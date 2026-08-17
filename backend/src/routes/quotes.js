import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { calculatePricing, validatePricingInputs } from '../utils/pricing.js';
import { requireAuth } from '../middleware/auth.js';
import { loadQuoteForPdf, generateQuotePdfBuffer } from './pdf.js';
import { sendQuoteEmail } from '../utils/email.js';

const router = express.Router();
router.use(requireAuth);

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Get all quotes (search, status filter, pagination)
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
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
    const header = ['Klant', 'E-mail', 'Telefoon', 'Bedrijf', 'Model', 'Status', 'Totaal excl. BTW', 'BTW', 'Totaal incl. BTW', 'Verkoper', 'Datum'];
    const lines = [header.map(csvEscape).join(',')];

    quotes.forEach((q) => {
      const configuration = JSON.parse(q.configuration || '{}');
      lines.push([
        q.customerName,
        q.customerEmail,
        q.customerPhone,
        q.customerCompany,
        `${configuration.vehicleName || ''} ${configuration.vehicleModel || ''}`.trim(),
        q.status,
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
      discountPercentage = 0,
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

    // Calculate accessories total
    const accessoriesTotal = accessories.reduce((sum, acc) => sum + (acc.price || 0), 0);

    const validationError = validatePricingInputs(basePrice, accessoriesTotal, discountPercentage);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Calculate pricing
    const pricing = calculatePricing(basePrice, accessoriesTotal, discountPercentage);

    // Insert quote
    await runAsync(
      `INSERT INTO quotes (id, customerName, customerEmail, customerPhone, customerCompany, selectedVehicleId, configuration, basePrice, accessories, discountPercentage, discountAmount, subtotal, vatAmount, totalPrice, notes, expiresAt, createdBy, createdByName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        discountPercentage,
        pricing.discountAmount,
        pricing.subtotal,
        pricing.vat,
        pricing.total,
        notes || null,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days expiry
        req.user.id,
        req.user.name,
      ]
    );

    // Add accessories as quote items
    for (const acc of accessories) {
      const itemId = uuidv4();
      await runAsync(
        `INSERT INTO quote_items (id, quoteId, itemName, quantity, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [itemId, id, acc.name, acc.quantity || 1, acc.price || 0, (acc.quantity || 1) * (acc.price || 0)]
      );
    }

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [id]);
    res.status(201).json({
      ...quote,
      configuration: JSON.parse(quote.configuration),
      items: accessories
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    await runAsync(
      `INSERT INTO quotes (id, customerName, customerEmail, customerPhone, customerCompany, selectedVehicleId, configuration, basePrice, accessories, discountPercentage, discountAmount, subtotal, vatAmount, totalPrice, status, notes, expiresAt, createdBy, createdByName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
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
        source.discountPercentage,
        source.discountAmount,
        source.subtotal,
        source.vatAmount,
        source.totalPrice,
        source.notes,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        req.user.id,
        req.user.name,
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

// Update quote
router.put('/:id', async (req, res) => {
  try {
    const { discountPercentage, accessories, customerName, customerEmail, customerPhone, customerCompany, notes, status } = req.body;
    const quoteId = req.params.id;

    const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (status !== undefined && !QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${QUOTE_STATUSES.join(', ')}` });
    }

    const basePrice = quote.basePrice;
    const accessoriesTotal = accessories ? accessories.reduce((sum, acc) => sum + (acc.price || 0), 0) : quote.accessories;
    const discount = discountPercentage !== undefined ? discountPercentage : quote.discountPercentage;

    const validationError = validatePricingInputs(basePrice, accessoriesTotal, discount);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const pricing = calculatePricing(basePrice, accessoriesTotal, discount);

    await runAsync(
      `UPDATE quotes SET discountPercentage = ?, discountAmount = ?, accessories = ?, subtotal = ?, vatAmount = ?, totalPrice = ?, customerName = ?, customerEmail = ?, customerPhone = ?, customerCompany = ?, notes = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        discount,
        pricing.discountAmount,
        accessoriesTotal,
        pricing.subtotal,
        pricing.vat,
        pricing.total,
        customerName || quote.customerName,
        customerEmail !== undefined ? customerEmail : quote.customerEmail,
        customerPhone !== undefined ? customerPhone : quote.customerPhone,
        customerCompany !== undefined ? customerCompany : quote.customerCompany,
        notes !== undefined ? notes : quote.notes,
        status || quote.status,
        quoteId,
      ]
    );

    // Update quote items if accessories provided
    if (accessories) {
      await runAsync('DELETE FROM quote_items WHERE quoteId = ?', [quoteId]);
      for (const acc of accessories) {
        const itemId = uuidv4();
        await runAsync(
          `INSERT INTO quote_items (id, quoteId, itemName, quantity, unitPrice, totalPrice)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [itemId, quoteId, acc.name, acc.quantity || 1, acc.price || 0, (acc.quantity || 1) * (acc.price || 0)]
        );
      }
    }

    const updatedQuote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    const updatedItems = await allAsync('SELECT * FROM quote_items WHERE quoteId = ?', [quoteId]);
    res.json({
      ...updatedQuote,
      configuration: JSON.parse(updatedQuote.configuration),
      items: updatedItems,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
