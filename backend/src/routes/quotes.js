import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { calculatePricing, validatePricingInputs, discountNeedsApproval } from '../utils/pricing.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';
import { loadQuoteForPdf, generateQuotePdfBuffer } from './pdf.js';
import { sendQuoteEmail } from '../utils/email.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];
const OPEN_STATUSES = ['draft', 'sent'];
const EXPIRY_WARNING_DAYS = 7;
const BLOCKING_APPROVAL_STATUSES = ['pending', 'rejected'];

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

// Resolve client-submitted accessory lines against the authoritative accessories
// table by id — a quote's price must never be derived from a client-supplied price,
// name, or line total, or any authenticated user could quote a customer whatever
// price they liked (e.g. a real accessory relabeled or repriced at submission time).
// Only `quantity` is trusted from the client, and even that is clamped to a sane
// positive integer.
async function resolveAccessories(items) {
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
    const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    resolved.push({ id: accessory.id, name: accessory.name, price: accessory.price, quantity });
  }
  return resolved;
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
    const { search, status, expiringSoon } = req.query;
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
    const header = ['Klant', 'E-mail', 'Telefoon', 'Bedrijf', 'Model', 'Status', 'Korting', 'Totaal excl. BTW', 'BTW', 'Totaal incl. BTW', 'Verkoper', 'Datum'];
    const lines = [header.map(csvEscape).join(',')];

    quotes.forEach((q) => {
      const configuration = JSON.parse(q.configuration || '{}');
      const discount = q.discountType === 'fixed'
        ? (q.discountEuro > 0 ? `€${q.discountEuro}` : '')
        : (q.discountPercentage > 0 ? `${q.discountPercentage}%` : '');
      lines.push([
        q.customerName,
        q.customerEmail,
        q.customerPhone,
        q.customerCompany,
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
      selectedVehicleId,
      configuration,
      discountType = 'percentage',
      discountValue = 0,
      accessories = [],
      notes
    } = req.body;

    if (!customerName || !selectedVehicleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const vehicle = await getAsync('SELECT * FROM vehicles WHERE id = ?', [selectedVehicleId]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const id = uuidv4();
    const basePrice = vehicle.basePrice;

    const resolvedAccessories = await resolveAccessories(accessories);
    const accessoriesTotal = resolvedAccessories.reduce((sum, acc) => sum + acc.price * acc.quantity, 0);

    const validationError = validatePricingInputs(basePrice, accessoriesTotal, discountType, discountValue);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Calculate pricing
    const pricing = calculatePricing(basePrice, accessoriesTotal, discountType, discountValue);
    const discountApprovalStatus = computeDiscountApprovalStatus(discountType, discountValue, req.user.role);
    const branch = await resolveActorBranch(req.user);

    // Insert quote
    await runAsync(
      `INSERT INTO quotes (id, customerName, customerEmail, customerPhone, customerCompany, selectedVehicleId, configuration, basePrice, accessories, discountType, discountPercentage, discountEuro, discountAmount, discountApprovalStatus, subtotal, vatAmount, totalPrice, notes, expiresAt, createdBy, createdByName, branchId, branchName, branchAddress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customerName,
        customerEmail || null,
        customerPhone || null,
        customerCompany || null,
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
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days expiry
        req.user.id,
        req.user.name,
        branch.branchId,
        branch.branchName,
        branch.branchAddress,
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

    await runAsync(
      `INSERT INTO quotes (id, customerName, customerEmail, customerPhone, customerCompany, selectedVehicleId, configuration, basePrice, accessories, discountType, discountPercentage, discountEuro, discountAmount, discountApprovalStatus, subtotal, vatAmount, totalPrice, status, notes, expiresAt, createdBy, createdByName, branchId, branchName, branchAddress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `${source.customerName} (kopie)`,
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
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        req.user.id,
        req.user.name,
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
    const { quote, vehicle, items } = await loadQuoteForPdf(req.params.id);
    if (!quote.customerEmail) {
      return res.status(400).json({ error: 'Deze offerte heeft geen klant-e-mailadres' });
    }
    if (BLOCKING_APPROVAL_STATUSES.includes(quote.discountApprovalStatus)) {
      return res.status(400).json({ error: 'De korting op deze offerte moet eerst goedgekeurd worden door een sales manager voordat ze naar de klant verzonden kan worden' });
    }

    const pdfBuffer = await generateQuotePdfBuffer({ quote, vehicle, items });
    await sendQuoteEmail({
      to: quote.customerEmail,
      customerName: quote.customerName,
      vehicleLabel: `${vehicle.name} ${vehicle.model}`,
      salespersonName: quote.createdByName,
      pdfBuffer,
      filename: `Offerte_Geely_${quote.customerName.replace(/\s+/g, '_')}.pdf`,
    });

    await runAsync(`UPDATE quotes SET status = 'sent', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
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
    const { discountType, discountValue, accessories, customerName, customerEmail, customerPhone, customerCompany, notes, status } = req.body;
    const quoteId = req.params.id;

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (status !== undefined && !QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${QUOTE_STATUSES.join(', ')}` });
    }

    const basePrice = quote.basePrice;
    const resolvedAccessories = accessories ? await resolveAccessories(accessories) : null;
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

    const pricing = calculatePricing(basePrice, accessoriesTotal, resolvedDiscountType, resolvedDiscountValue);

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

    await runAsync(
      `UPDATE quotes SET discountType = ?, discountPercentage = ?, discountEuro = ?, discountAmount = ?, discountApprovalStatus = ?, accessories = ?, subtotal = ?, vatAmount = ?, totalPrice = ?, customerName = ?, customerEmail = ?, customerPhone = ?, customerCompany = ?, notes = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
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
        customerCompany !== undefined ? customerCompany : quote.customerCompany,
        notes !== undefined ? notes : quote.notes,
        finalStatus,
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
