import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { calculatePricing, validatePricingInputs, discountNeedsApproval } from '../utils/pricing.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';
import { loadQuoteForPdf, generateQuotePdfBuffer } from './pdf.js';
import { sendQuoteEmail } from '../utils/email.js';
import { logAudit } from '../utils/auditLog.js';
import { PDF, resolveLang } from '../i18n/translate.js';
import { formatQuoteNumber } from '../utils/quoteNumber.js';

// Next 0-based offer number — assigned once, at creation, from the current max. Not
// wrapped in a transaction: at this app's scale (a handful of reps, SQLite has a single
// writer anyway) two quotes created in the exact same instant colliding on a number is a
// cosmetic risk, not a correctness one, and not worth the added complexity of a dedicated
// counter table for.
async function nextSequenceNumber() {
  const row = await getAsync('SELECT COALESCE(MAX(sequenceNumber), -1) + 1 AS next FROM quotes');
  return row.next;
}

const QUOTE_LANGUAGES = ['nl', 'fr'];

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];
const OPEN_STATUSES = ['draft', 'sent'];
const EXPIRY_WARNING_DAYS = 7;
// A 'sent' quote the customer hasn't responded to in this many days surfaces as
// needing a follow-up call — mirrors EXPIRY_WARNING_DAYS's role for the expiry filter.
const FOLLOWUP_REMINDER_DAYS = 5;
// Exported so the public quote-acceptance route (routes/quoteAcceptance.js) applies the
// exact same rule: a customer can't click "accept" on a discount that hasn't cleared
// manager sign-off internally yet.
export const BLOCKING_APPROVAL_STATUSES = ['pending', 'rejected'];

// A manager/admin's own discount never needs sign-off — they're the approver. A rep's
// discount needs one only once it clears the threshold; a small/no discount never does.
function computeDiscountApprovalStatus(discountType, discountValue, actorRole) {
  if (!discountValue || discountValue <= 0) return 'not_required';
  if (['admin', 'sales_manager'].includes(actorRole)) return 'approved';
  return discountNeedsApproval(discountType, discountValue) ? 'pending' : 'not_required';
}

// The branch a quote gets attributed to is always the creating user's own assigned
// branch — never something the client can pass in — so a rep can't misattribute a sale
// to a different branch than the one they actually work from.
async function resolveActorBranch(user) {
  if (!user.branchId) return { branchId: null, branchName: null, branchAddress: null };
  const branch = await getAsync('SELECT * FROM branches WHERE id = ?', [user.branchId]);
  if (!branch) return { branchId: null, branchName: null, branchAddress: null };
  return { branchId: branch.id, branchName: branch.name, branchAddress: branch.address };
}

// Normalizes a Belgian VAT number to a single canonical "BE" + 10-digit form regardless
// of how the rep typed it (with dots, spaces, a "BE" prefix or not) — so the same company
// always renders identically on every quote/PDF/CSV export instead of drifting per rep.
// Anything that isn't a recognizable Belgian VAT number is stored trimmed, as-is, rather
// than rejected outright (a rep may legitimately be quoting a foreign business).
function normalizeVatNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/^BE/i, '').replace(/[^0-9]/g, '');
  if (/^[01]\d{9}$/.test(digits)) return `BE${digits}`;
  return String(raw).trim() || null;
}

// Resolve client-submitted accessory lines against the authoritative accessories
// table by id — a quote's price must never be derived from a client-supplied price,
// name, or line total, or any authenticated user could quote a customer whatever
// price they liked (e.g. a real accessory relabeled or repriced at submission time).
// Only `quantity` is trusted from the client, and even that is clamped to a sane
// positive integer.
// Mirrors frontend/src/utils/constants.js SINGLE_SELECT_CATEGORIES — a car can only
// have one paint color, so this is checked here too rather than trusting the UI alone
// to enforce it (the UI can have bugs, and this endpoint can be called directly).
const SINGLE_SELECT_CATEGORIES = ['exterior'];

// vehicleName scopes accessories to the quote's actual vehicle — without this, a request
// (crafted by hand, or a frontend bug) could attach an accessory that only makes sense
// for a different model. This is also what makes the delivery-pack duplication bug
// impossible even if something upstream misbehaves again: two accessories can share a
// name across models, but this check keys off the accessory's own `vehicleModels`, not
// a name match, so a mismatched one is always rejected here regardless of how it arrived.
async function resolveAccessories(items, vehicleName) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const resolved = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string') {
      const error = new Error('Elke optie moet een geldig id hebben');
      error.status = 400;
      throw error;
    }
    const accessory = await getAsync('SELECT * FROM accessories WHERE id = ? AND active = 1', [item.id]);
    if (!accessory) {
      const error = new Error(`Optie niet gevonden of niet meer actief: ${item.id}`);
      error.status = 400;
      throw error;
    }
    const applicableModels = JSON.parse(accessory.vehicleModels || '[]');
    if (applicableModels.length > 0 && vehicleName && !applicableModels.includes(vehicleName)) {
      const error = new Error(`Optie "${accessory.name}" is niet beschikbaar voor dit voertuig`);
      error.status = 400;
      throw error;
    }
    const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    resolved.push({ id: accessory.id, name: accessory.name, price: accessory.price, quantity, category: accessory.category });
  }

  return resolved;
}

// Mandatory accessories (e.g. the delivery pack fee) are added here — server-side,
// unconditionally — rather than relying on the client to include them. The quote
// builder never lets a user deselect one, but resolving them independently of whatever
// the client sent means a quote is correctly priced even if the frontend has a bug, or
// the request was crafted by hand to omit it.
async function resolveMandatoryAccessories(vehicleName) {
  const rows = await allAsync('SELECT * FROM accessories WHERE mandatory = 1 AND active = 1', []);
  return rows
    .filter((row) => JSON.parse(row.vehicleModels || '[]').includes(vehicleName))
    .map((row) => ({ id: row.id, name: row.name, price: row.price, quantity: 1, category: row.category }));
}

// Merges resolved client accessories with the vehicle's mandatory ones, the client's
// copy of a mandatory item (it shouldn't send one, but a hand-crafted request might)
// losing out to the authoritative one so it's never duplicated or priced differently.
// The single-select check runs on this final merged list, not just the client-submitted
// half, so it stays correct even if a future mandatory accessory is ever configured into
// a single-select category (e.g. 'exterior') — it can't quietly slip past validation just
// because it arrived via the mandatory path instead of the client's own selection.
function mergeMandatoryAccessories(resolvedAccessories, mandatoryAccessories) {
  const mandatoryIds = new Set(mandatoryAccessories.map((a) => a.id));
  const merged = [...resolvedAccessories.filter((a) => !mandatoryIds.has(a.id)), ...mandatoryAccessories];

  for (const category of SINGLE_SELECT_CATEGORIES) {
    const picked = merged.filter((a) => a.category === category);
    if (picked.length > 1) {
      const error = new Error(`Er kan maar één optie uit de categorie "${category}" gekozen worden (gekozen: ${picked.map((p) => p.name).join(', ')})`);
      error.status = 400;
      throw error;
    }
  }

  return merged;
}

function csvEscape(value) {
  let str = value === null || value === undefined ? '' : String(value);
  // Excel/Sheets/LibreOffice treat a cell starting with =, +, -, @, or a tab/CR as a
  // formula on open — a customer or company name is free text a colleague typed in,
  // so without this guard a crafted name becomes a formula (e.g. =HYPERLINK(...)) that
  // runs the moment whoever opens this export clicks into that cell.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Get all quotes (search, status filter, pagination)
router.get('/', async (req, res) => {
  try {
    const { search, status, expiringSoon, needsFollowup } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (search) {
      conditions.push('(LOWER(customerName) LIKE ? OR LOWER(customerEmail) LIKE ? OR LOWER(customerCompany) LIKE ?)');
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term, term);
    }
    if (status && QUOTE_STATUSES.includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (expiringSoon === 'true') {
      // Only quotes still awaiting a decision can meaningfully "expire" — an
      // accepted/declined quote's expiresAt date is no longer operationally relevant.
      const cutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();
      conditions.push(`status IN (${OPEN_STATUSES.map(() => '?').join(', ')})`, 'expiresAt IS NOT NULL', 'expiresAt <= ?');
      params.push(...OPEN_STATUSES, cutoff);
    }
    if (needsFollowup === 'true') {
      // 'sent' and quiet ever since — a customer who already accepted/declined doesn't
      // need a nudge, and a quote that's still a draft was never waiting on them.
      const cutoff = new Date(Date.now() - FOLLOWUP_REMINDER_DAYS * 24 * 60 * 60 * 1000).toISOString();
      conditions.push("status = 'sent'", 'sentAt IS NOT NULL', 'sentAt <= ?');
      params.push(cutoff);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalRow = await getAsync(`SELECT COUNT(*) AS count FROM quotes ${whereClause}`, params);
    const quotes = await allAsync(
      `SELECT * FROM quotes ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      quotes: quotes.map(q => ({ ...q, configuration: JSON.parse(q.configuration) })),
      total: totalRow.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalRow.count / limit)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export all quotes as CSV
router.get('/export.csv', async (req, res) => {
  try {
    const quotes = await allAsync('SELECT * FROM quotes ORDER BY createdAt DESC');
    const header = ['Offertenummer', 'Klant', 'Type', 'E-mail', 'Telefoon', 'Adres', 'Bedrijf', 'BTW-nummer', 'Model', 'Status', 'Korting', 'Totaal excl. BTW', 'BTW', 'Totaal incl. BTW', 'Verkoper', 'Datum'];
    const lines = [header.map(csvEscape).join(',')];

    quotes.forEach((q) => {
      const configuration = JSON.parse(q.configuration || '{}');
      const discount = q.discountType === 'fixed'
        ? (q.discountEuro > 0 ? `€${q.discountEuro}` : '')
        : (q.discountPercentage > 0 ? `${q.discountPercentage}%` : '');
      const address = [q.customerStreet, [q.customerPostalCode, q.customerCity].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      lines.push([
        formatQuoteNumber(q),
        q.customerName,
        q.customerType === 'bedrijf' ? 'Bedrijf' : 'Particulier',
        q.customerEmail,
        q.customerPhone,
        address,
        q.customerCompany,
        q.customerVatNumber,
        `${configuration.vehicleName || ''} ${configuration.vehicleModel || ''}`.trim(),
        q.status,
        discount,
        q.subtotal,
        q.vatAmount,
        q.totalPrice,
        q.createdByName,
        q.createdAt,
      ].map(csvEscape).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="offertes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\n')); // BOM so Excel opens UTF-8 correctly
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Looks up past quotes for the same customer by email, phone, or VAT number, so a rep
// can recognize a repeat/existing customer while filling in the customer form instead of
// treating every quote as a first contact. Matches on ANY of the three identifiers (a
// customer might reuse the same email with a new phone, or vice versa). Phone numbers are
// compared with separators stripped and the country code collapsed to the leading "0"
// Belgians actually dial, since "+32 470 12 34 56", "0032470123456", and "0470123456" are
// all the same number typed differently.
function normalizePhone(value) {
  let digits = String(value || '').replace(/[\s.\-/]/g, '');
  if (digits.startsWith('+32')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0032')) digits = `0${digits.slice(4)}`;
  return digits;
}
// Same normalization, applied to the stored column so both sides compare equal —
// strip separators first, then collapse whichever country-code form is present.
const PHONE_MATCH_SQL = `
  REPLACE(
    REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(customerPhone, ' ', ''), '.', ''), '-', ''), '/', ''),
    '0032', '0'),
  '+32', '0') = ?
`;

router.get('/customer-history', async (req, res) => {
  try {
    const { email, phone, vatNumber, excludeId } = req.query;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const normalizedPhone = phone ? normalizePhone(phone) : '';
    const normalizedVat = vatNumber ? normalizeVatNumber(vatNumber) : '';

    if (!normalizedEmail && !normalizedPhone && !normalizedVat) {
      return res.json([]);
    }

    const conditions = [];
    const params = [];
    if (normalizedEmail) {
      conditions.push('LOWER(customerEmail) = ?');
      params.push(normalizedEmail);
    }
    if (normalizedPhone) {
      conditions.push(PHONE_MATCH_SQL);
      params.push(normalizedPhone);
    }
    if (normalizedVat) {
      conditions.push('customerVatNumber = ?');
      params.push(normalizedVat);
    }

    let whereClause = `(${conditions.join(' OR ')})`;
    if (excludeId) {
      whereClause += ' AND id != ?';
      params.push(excludeId);
    }

    const quotes = await allAsync(
      `SELECT id, customerName, configuration, status, totalPrice, createdAt FROM quotes WHERE ${whereClause} ORDER BY createdAt DESC LIMIT 20`,
      params
    );

    res.json(quotes.map((q) => {
      const configuration = JSON.parse(q.configuration || '{}');
      return {
        id: q.id,
        customerName: q.customerName,
        vehicleLabel: `${configuration.vehicleName || ''} ${configuration.vehicleModel || ''}`.trim(),
        status: q.status,
        totalPrice: q.totalPrice,
        createdAt: q.createdAt,
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get quote by ID
router.get('/:id', async (req, res) => {
  try {
    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const items = await allAsync(
      'SELECT * FROM quote_items WHERE quoteId = ?',
      [req.params.id]
    );

    res.json({
      ...quote,
      configuration: JSON.parse(quote.configuration),
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new quote
router.post('/', async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      customerCompany,
      customerType = 'particulier',
      customerVatNumber,
      customerStreet,
      customerPostalCode,
      customerCity,
      selectedVehicleId,
      configuration,
      discountType = 'percentage',
      discountValue = 0,
      accessories = [],
      notes,
      language = 'nl',
      tradeInEnabled = false,
      tradeInMake,
      tradeInModel,
      tradeInYear,
      tradeInMileage,
      tradeInValue = 0,
    } = req.body;

    if (!customerName || !selectedVehicleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['particulier', 'bedrijf'].includes(customerType)) {
      return res.status(400).json({ error: 'customerType must be "particulier" or "bedrijf"' });
    }
    if (!QUOTE_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `language must be one of: ${QUOTE_LANGUAGES.join(', ')}` });
    }
    if (tradeInEnabled && (!Number.isFinite(tradeInValue) || tradeInValue < 0)) {
      return res.status(400).json({ error: 'tradeInValue must be a non-negative number' });
    }

    const vehicle = await getAsync('SELECT * FROM vehicles WHERE id = ?', [selectedVehicleId]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const id = uuidv4();
    const basePrice = vehicle.basePrice;

    const mandatoryAccessories = await resolveMandatoryAccessories(vehicle.name);
    const mandatoryAccessoriesTotal = mandatoryAccessories.reduce((sum, acc) => sum + acc.price * acc.quantity, 0);
    const resolvedAccessories = mergeMandatoryAccessories(await resolveAccessories(accessories, vehicle.name), mandatoryAccessories);
    const accessoriesTotal = resolvedAccessories.reduce((sum, acc) => sum + acc.price * acc.quantity, 0);

    const validationError = validatePricingInputs(basePrice, accessoriesTotal, discountType, discountValue);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Calculate pricing — mandatory accessories (e.g. the delivery pack) are priced in full
    // but excluded from the discount base, see calculatePricing's docs.
    const pricing = calculatePricing(basePrice, accessoriesTotal, discountType, discountValue, mandatoryAccessoriesTotal);
    const discountApprovalStatus = computeDiscountApprovalStatus(discountType, discountValue, req.user.role);
    const branch = await resolveActorBranch(req.user);
    const sequenceNumber = await nextSequenceNumber();

    // Insert quote
    await runAsync(
      `INSERT INTO quotes (id, sequenceNumber, customerName, customerEmail, customerPhone, customerCompany, customerType, customerVatNumber, customerStreet, customerPostalCode, customerCity, selectedVehicleId, configuration, basePrice, accessories, discountType, discountPercentage, discountEuro, discountAmount, discountApprovalStatus, subtotal, vatAmount, totalPrice, notes, language, expiresAt, createdBy, createdByName, createdByEmail, branchId, branchName, branchAddress, tradeInEnabled, tradeInMake, tradeInModel, tradeInYear, tradeInMileage, tradeInValue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sequenceNumber,
        customerName,
        customerEmail || null,
        customerPhone || null,
        customerType === 'bedrijf' ? (customerCompany || null) : null,
        customerType,
        customerType === 'bedrijf' ? normalizeVatNumber(customerVatNumber) : null,
        customerStreet || null,
        customerPostalCode || null,
        customerCity || null,
        selectedVehicleId,
        JSON.stringify(configuration || {}),
        basePrice,
        accessoriesTotal,
        discountType,
        discountType === 'percentage' ? discountValue : 0,
        discountType === 'fixed' ? discountValue : 0,
        pricing.discountAmount,
        discountApprovalStatus,
        pricing.subtotal,
        pricing.vat,
        pricing.total,
        notes || null,
        language,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days expiry
        req.user.id,
        req.user.name,
        req.user.email,
        branch.branchId,
        branch.branchName,
        branch.branchAddress,
        tradeInEnabled ? 1 : 0,
        tradeInEnabled ? (tradeInMake || null) : null,
        tradeInEnabled ? (tradeInModel || null) : null,
        tradeInEnabled ? (tradeInYear || null) : null,
        tradeInEnabled ? (tradeInMileage || null) : null,
        tradeInEnabled ? tradeInValue : 0,
      ]
    );

    // Add accessories as quote items
    for (const acc of resolvedAccessories) {
      const itemId = uuidv4();
      await runAsync(
        `INSERT INTO quote_items (id, quoteId, itemName, quantity, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [itemId, id, acc.name, acc.quantity, acc.price, acc.quantity * acc.price]
      );
    }

    if (discountValue > 0) {
      await logAudit({
        entityType: 'quote',
        entityId: id,
        action: 'discount_applied',
        details: { discountType, discountValue, status: discountApprovalStatus },
        user: req.user,
      });
    }

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [id]);
    res.status(201).json({
      ...quote,
      configuration: JSON.parse(quote.configuration),
      items: resolvedAccessories
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Duplicate an existing quote (same vehicle/accessories/discount, blank customer fields, fresh draft)
router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!source) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    const sourceItems = await allAsync('SELECT * FROM quote_items WHERE quoteId = ?', [req.params.id]);

    const id = uuidv4();
    // Re-evaluate approval against whoever is duplicating it, not the source quote's
    // history — a copy made by a different (lower-privileged) rep shouldn't inherit an
    // approval it didn't earn.
    const duplicateDiscountValue = source.discountType === 'fixed' ? source.discountEuro : source.discountPercentage;
    const discountApprovalStatus = computeDiscountApprovalStatus(source.discountType, duplicateDiscountValue, req.user.role);
    // Same reasoning as the approval re-evaluation above — the copy is attributed to
    // whoever is actually making it, not wherever the original happened to be made.
    const branch = await resolveActorBranch(req.user);
    // A duplicate is a distinct new offer for tracking purposes — it gets its own fresh
    // number rather than inheriting the source's, same as it already gets a fresh id.
    const sequenceNumber = await nextSequenceNumber();

    await runAsync(
      `INSERT INTO quotes (id, sequenceNumber, customerName, customerEmail, customerPhone, customerCompany, customerType, customerVatNumber, customerStreet, customerPostalCode, customerCity, selectedVehicleId, configuration, basePrice, accessories, discountType, discountPercentage, discountEuro, discountAmount, discountApprovalStatus, subtotal, vatAmount, totalPrice, status, notes, language, expiresAt, createdBy, createdByName, createdByEmail, branchId, branchName, branchAddress, tradeInEnabled, tradeInMake, tradeInModel, tradeInYear, tradeInMileage, tradeInValue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, 0)`,
      [
        id,
        sequenceNumber,
        `${source.customerName} (kopie)`,
        null,
        null,
        null,
        'particulier',
        null,
        null,
        null,
        null,
        source.selectedVehicleId,
        source.configuration,
        source.basePrice,
        source.accessories,
        source.discountType,
        source.discountPercentage,
        source.discountEuro,
        source.discountAmount,
        discountApprovalStatus,
        source.subtotal,
        source.vatAmount,
        source.totalPrice,
        source.notes,
        source.language || 'nl',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        req.user.id,
        req.user.name,
        req.user.email,
        branch.branchId,
        branch.branchName,
        branch.branchAddress,
      ]
    );

    for (const item of sourceItems) {
      await runAsync(
        `INSERT INTO quote_items (id, quoteId, itemName, quantity, unitPrice, totalPrice) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, item.itemName, item.quantity, item.unitPrice, item.totalPrice]
      );
    }

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [id]);
    res.status(201).json({ ...quote, configuration: JSON.parse(quote.configuration) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// E-mail the quote PDF to the customer, marking the quote as sent
router.post('/:id/send-email', async (req, res) => {
  try {
    const { quote, vehicle, items, financing } = await loadQuoteForPdf(req.params.id);
    if (!quote.customerEmail) {
      return res.status(400).json({ error: 'Deze offerte heeft geen klant-e-mailadres' });
    }
    if (BLOCKING_APPROVAL_STATUSES.includes(quote.discountApprovalStatus)) {
      return res.status(400).json({ error: 'De korting op deze offerte moet eerst goedgekeurd worden door een sales manager voordat ze naar de klant verzonden kan worden' });
    }

    // Fresh acceptance token every send — same one-way-hashed scheme as the password
    // reset flow (routes/auth.js). A resend deliberately invalidates any earlier link.
    const acceptanceToken = crypto.randomBytes(32).toString('hex');
    const acceptanceTokenHash = crypto.createHash('sha256').update(acceptanceToken).digest('hex');
    const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?acceptQuote=${acceptanceToken}`;

    // A quote's expiresAt is fixed 30 days out at creation and never otherwise renewed.
    // Sending it again after that window has already lapsed (e.g. a rep following up on
    // a stale "Vervolg nodig" quote) would otherwise hand the customer a link tied to that
    // same stale date — dead on arrival, or dead within hours. Re-quote it with a fresh
    // 30-day window instead, so the emailed PDF, the "Geldig tot" date and the acceptance
    // link all agree and the link is actually usable for the period the customer is told.
    if (new Date(quote.expiresAt) <= new Date()) {
      quote.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const pdfBuffer = await generateQuotePdfBuffer({ quote, vehicle, items, financing });
    await sendQuoteEmail({
      to: quote.customerEmail,
      customerName: quote.customerName,
      vehicleLabel: `${vehicle.name} ${vehicle.model}`,
      salespersonName: quote.createdByName,
      pdfBuffer,
      filename: `${PDF[resolveLang(quote.language)].filenamePrefix}${formatQuoteNumber(quote)}_${quote.customerName.replace(/\s+/g, '_')}.pdf`,
      acceptUrl,
      language: quote.language,
    });

    await runAsync(
      `UPDATE quotes SET status = 'sent', expiresAt = ?, acceptanceTokenHash = ?, acceptanceTokenExpires = ?, sentAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [quote.expiresAt, acceptanceTokenHash, quote.expiresAt, req.params.id]
    );
    const updated = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    res.json({ ...updated, configuration: JSON.parse(updated.configuration) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Approve or reject a quote's pending discount (sales manager / admin only)
router.post('/:id/approve-discount', requireManager, async (req, res) => {
  try {
    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    await runAsync(`UPDATE quotes SET discountApprovalStatus = 'approved', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    await logAudit({
      entityType: 'quote',
      entityId: req.params.id,
      action: 'discount_approved',
      details: { discountType: quote.discountType, discountValue: quote.discountType === 'fixed' ? quote.discountEuro : quote.discountPercentage },
      user: req.user,
    });
    const updated = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    res.json({ ...updated, configuration: JSON.parse(updated.configuration) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/reject-discount', requireManager, async (req, res) => {
  try {
    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    await runAsync(`UPDATE quotes SET discountApprovalStatus = 'rejected', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    await logAudit({
      entityType: 'quote',
      entityId: req.params.id,
      action: 'discount_rejected',
      details: { discountType: quote.discountType, discountValue: quote.discountType === 'fixed' ? quote.discountEuro : quote.discountPercentage },
      user: req.user,
    });
    const updated = await getAsync('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    res.json({ ...updated, configuration: JSON.parse(updated.configuration) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update quote
router.put('/:id', async (req, res) => {
  try {
    const {
      discountType, discountValue, accessories,
      customerName, customerEmail, customerPhone, customerCompany,
      customerType, customerVatNumber, customerStreet, customerPostalCode, customerCity,
      tradeInEnabled, tradeInMake, tradeInModel, tradeInYear, tradeInMileage, tradeInValue,
      notes, status, language,
    } = req.body;
    const quoteId = req.params.id;

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (status !== undefined && !QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${QUOTE_STATUSES.join(', ')}` });
    }
    if (customerType !== undefined && !['particulier', 'bedrijf'].includes(customerType)) {
      return res.status(400).json({ error: 'customerType must be "particulier" or "bedrijf"' });
    }
    if (language !== undefined && !QUOTE_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `language must be one of: ${QUOTE_LANGUAGES.join(', ')}` });
    }
    const resolvedCustomerType = customerType !== undefined ? customerType : quote.customerType;
    const resolvedTradeInEnabled = tradeInEnabled !== undefined ? tradeInEnabled : !!quote.tradeInEnabled;
    const resolvedTradeInValue = tradeInValue !== undefined ? tradeInValue : quote.tradeInValue;
    if (resolvedTradeInEnabled && (!Number.isFinite(resolvedTradeInValue) || resolvedTradeInValue < 0)) {
      return res.status(400).json({ error: 'tradeInValue must be a non-negative number' });
    }

    const basePrice = quote.basePrice;
    // Needed on every save (not just when accessories are resubmitted) since pricing —
    // and specifically which portion of it is exempt from the discount — is recalculated
    // unconditionally below, even for edits that only touch the discount or customer info.
    const vehicle = await getAsync('SELECT name FROM vehicles WHERE id = ?', [quote.selectedVehicleId]);
    const mandatoryAccessories = vehicle ? await resolveMandatoryAccessories(vehicle.name) : [];
    const mandatoryAccessoriesTotal = mandatoryAccessories.reduce((sum, acc) => sum + acc.price * acc.quantity, 0);

    let resolvedAccessories = null;
    if (accessories) {
      resolvedAccessories = mergeMandatoryAccessories(await resolveAccessories(accessories, vehicle?.name), mandatoryAccessories);
    }
    const accessoriesTotal = resolvedAccessories
      ? resolvedAccessories.reduce((sum, acc) => sum + acc.price * acc.quantity, 0)
      : quote.accessories;
    const resolvedDiscountType = discountType !== undefined ? discountType : quote.discountType;
    const resolvedDiscountValue = discountValue !== undefined
      ? discountValue
      : (resolvedDiscountType === 'fixed' ? quote.discountEuro : quote.discountPercentage);

    const validationError = validatePricingInputs(basePrice, accessoriesTotal, resolvedDiscountType, resolvedDiscountValue);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Mandatory accessories (e.g. the delivery pack) are priced in full but excluded from
    // the discount base, see calculatePricing's docs.
    const pricing = calculatePricing(basePrice, accessoriesTotal, resolvedDiscountType, resolvedDiscountValue, mandatoryAccessoriesTotal);

    // Only re-run the approval gate if the discount itself actually changed — otherwise
    // an unrelated edit (e.g. fixing a typo in the customer's name) by the original rep
    // would silently re-lock a discount a manager already approved.
    const previousDiscountValue = quote.discountType === 'fixed' ? quote.discountEuro : quote.discountPercentage;
    const discountChanged = resolvedDiscountType !== quote.discountType || resolvedDiscountValue !== previousDiscountValue;
    const discountApprovalStatus = discountChanged
      ? computeDiscountApprovalStatus(resolvedDiscountType, resolvedDiscountValue, req.user.role)
      : quote.discountApprovalStatus;

    const finalStatus = status || quote.status;
    if (['sent', 'accepted'].includes(finalStatus) && BLOCKING_APPROVAL_STATUSES.includes(discountApprovalStatus)) {
      return res.status(400).json({ error: 'De korting op deze offerte moet eerst goedgekeurd worden door een sales manager voordat de offerte verzonden of geaccepteerd kan worden' });
    }

    // Only stamp sentAt on an actual draft->sent transition here — an edit that leaves an
    // already-sent quote as 'sent' (e.g. a typo fix) must not reset the follow-up clock.
    // send-email (above) always stamps it fresh since that's an explicit new send.
    const sentAt = finalStatus === 'sent' && quote.status !== 'sent' ? new Date().toISOString() : quote.sentAt;

    await runAsync(
      `UPDATE quotes SET discountType = ?, discountPercentage = ?, discountEuro = ?, discountAmount = ?, discountApprovalStatus = ?, accessories = ?, subtotal = ?, vatAmount = ?, totalPrice = ?, customerName = ?, customerEmail = ?, customerPhone = ?, customerCompany = ?, customerType = ?, customerVatNumber = ?, customerStreet = ?, customerPostalCode = ?, customerCity = ?, tradeInEnabled = ?, tradeInMake = ?, tradeInModel = ?, tradeInYear = ?, tradeInMileage = ?, tradeInValue = ?, notes = ?, language = ?, status = ?, sentAt = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        resolvedDiscountType,
        resolvedDiscountType === 'percentage' ? resolvedDiscountValue : 0,
        resolvedDiscountType === 'fixed' ? resolvedDiscountValue : 0,
        pricing.discountAmount,
        discountApprovalStatus,
        accessoriesTotal,
        pricing.subtotal,
        pricing.vat,
        pricing.total,
        customerName || quote.customerName,
        customerEmail !== undefined ? customerEmail : quote.customerEmail,
        customerPhone !== undefined ? customerPhone : quote.customerPhone,
        // Company name/VAT number only make sense for 'bedrijf' — switching a quote back
        // to 'particulier' clears them rather than leaving stale company data attached.
        resolvedCustomerType === 'bedrijf' ? (customerCompany !== undefined ? customerCompany : quote.customerCompany) : null,
        resolvedCustomerType,
        resolvedCustomerType === 'bedrijf'
          ? (customerVatNumber !== undefined ? normalizeVatNumber(customerVatNumber) : quote.customerVatNumber)
          : null,
        customerStreet !== undefined ? customerStreet : quote.customerStreet,
        customerPostalCode !== undefined ? customerPostalCode : quote.customerPostalCode,
        customerCity !== undefined ? customerCity : quote.customerCity,
        resolvedTradeInEnabled ? 1 : 0,
        resolvedTradeInEnabled ? (tradeInMake !== undefined ? tradeInMake : quote.tradeInMake) : null,
        resolvedTradeInEnabled ? (tradeInModel !== undefined ? tradeInModel : quote.tradeInModel) : null,
        resolvedTradeInEnabled ? (tradeInYear !== undefined ? tradeInYear : quote.tradeInYear) : null,
        resolvedTradeInEnabled ? (tradeInMileage !== undefined ? tradeInMileage : quote.tradeInMileage) : null,
        resolvedTradeInEnabled ? resolvedTradeInValue : 0,
        notes !== undefined ? notes : quote.notes,
        language !== undefined ? language : quote.language,
        finalStatus,
        sentAt,
        quoteId,
      ]
    );

    // Update quote items if accessories provided
    if (resolvedAccessories) {
      await runAsync('DELETE FROM quote_items WHERE quoteId = ?', [quoteId]);
      for (const acc of resolvedAccessories) {
        const itemId = uuidv4();
        await runAsync(
          `INSERT INTO quote_items (id, quoteId, itemName, quantity, unitPrice, totalPrice)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [itemId, quoteId, acc.name, acc.quantity, acc.price, acc.quantity * acc.price]
        );
      }
    }

    if (discountChanged) {
      await logAudit({
        entityType: 'quote',
        entityId: quoteId,
        action: 'discount_changed',
        details: {
          from: { type: quote.discountType, value: previousDiscountValue },
          to: { type: resolvedDiscountType, value: resolvedDiscountValue },
          status: discountApprovalStatus,
        },
        user: req.user,
      });
    }
    if (status !== undefined && status !== quote.status) {
      await logAudit({
        entityType: 'quote',
        entityId: quoteId,
        action: 'status_changed',
        details: { from: quote.status, to: status },
        user: req.user,
      });
    }

    const updatedQuote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    const updatedItems = await allAsync('SELECT * FROM quote_items WHERE quoteId = ?', [quoteId]);
    res.json({
      ...updatedQuote,
      configuration: JSON.parse(updatedQuote.configuration),
      items: updatedItems,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Delete a quote
router.delete('/:id', async (req, res) => {
  try {
    const quote = await getAsync('SELECT id FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await runAsync('DELETE FROM quote_items WHERE quoteId = ?', [req.params.id]);
    await runAsync('DELETE FROM quotes WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
