import express from 'express';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin, blockPendingPasswordChange } from '../middleware/auth.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
// Gated behind requireAdmin rather than the plain 'sales' role — this tool exports and
// permanently strips customer PII, so it needs a tighter gate than the rest of the app's
// mostly-shared data visibility. Note requireAdmin allows sales_manager too, same as
// requireManager (see middleware/auth.js) — that's the deliberate, app-wide "sales
// managers are admin-equivalent" business decision, not a gap specific to this file.
router.use(requireAuth, requireAdmin, blockPendingPasswordChange);

function toSummary(row) {
  const configuration = JSON.parse(row.configuration || '{}');
  return {
    id: row.id,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    customerType: row.customerType,
    customerCompany: row.customerCompany,
    customerVatNumber: row.customerVatNumber,
    vehicleLabel: `${configuration.vehicleName || ''} ${configuration.vehicleModel || ''}`.trim(),
    status: row.status,
    totalPrice: row.totalPrice,
    createdAt: row.createdAt,
  };
}

// Finds every quote matching a free-text search across the identifying customer fields —
// used to locate everything tied to a given person before an export or erasure request,
// since the same customer might appear under slightly different spellings across quotes.
// Also searches inventory.reservedFor: it's a free-text "customer name or quote reference"
// field with no structured link back to a quote, so a customer's name can end up sitting
// there too — surfaced separately since an inventory unit isn't a quote (no e-mail/phone/
// address to export), it just needs its own path to get that name cleared.
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.json({ quotes: [], inventoryMatches: [] });
    const term = `%${query.toLowerCase()}%`;
    // The two tables are unrelated to each other, so there's no reason to make the second
    // wait on the first — run them concurrently.
    const [quotes, inventoryMatches] = await Promise.all([
      allAsync(
        `SELECT * FROM quotes
         WHERE LOWER(customerName) LIKE ? OR LOWER(customerEmail) LIKE ? OR customerPhone LIKE ?
            OR LOWER(customerVatNumber) LIKE ? OR LOWER(customerCompany) LIKE ?
         ORDER BY createdAt DESC LIMIT 50`,
        [term, term, `%${query}%`, term, term]
      ),
      allAsync(
        `SELECT inv.id, inv.reservedFor, inv.status, v.name AS vehicleName, v.model AS vehicleModel
         FROM inventory inv JOIN vehicles v ON v.id = inv.vehicleId
         WHERE LOWER(inv.reservedFor) LIKE ?
         ORDER BY inv.updatedAt DESC LIMIT 50`,
        [term]
      ),
    ]);
    res.json({ quotes: quotes.map(toSummary), inventoryMatches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Exports the full record for the given quotes as a downloadable JSON file — the
// "recht op gegevensoverdraagbaarheid" (data portability) part of a GDPR request.
router.get('/export', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids is verplicht (comma-gescheiden lijst van offerte-id\'s)' });
    }
    const placeholders = ids.map(() => '?').join(', ');
    const quotes = await allAsync(`SELECT * FROM quotes WHERE id IN (${placeholders})`, ids);
    const exportData = quotes.map((q) => ({ ...q, configuration: JSON.parse(q.configuration || '{}') }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="klantgegevens-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Strips personal data (name, contact details, address, VAT number, notes) from the given
// quotes — the "recht op vergetelheid" (right to erasure) part of a GDPR request. Sales
// figures, the vehicle, status, and date are deliberately kept so aggregate reporting
// (revenue by month/branch) stays accurate; only what identifies the person is removed.
// customerName can't be NULLed (NOT NULL column) so it gets a placeholder instead.
const ANONYMIZED_NAME = 'Verwijderd op verzoek (GDPR)';

router.post('/anonymize', async (req, res) => {
  try {
    const { quoteIds } = req.body;
    if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
      return res.status(400).json({ error: 'quoteIds is verplicht en moet minstens 1 offerte bevatten' });
    }

    let anonymized = 0;
    for (const id of quoteIds) {
      const quote = await getAsync('SELECT id FROM quotes WHERE id = ?', [id]);
      if (!quote) continue;

      await runAsync(
        `UPDATE quotes SET customerName = ?, customerEmail = NULL, customerPhone = NULL, customerCompany = NULL,
          customerVatNumber = NULL, customerStreet = NULL, customerPostalCode = NULL, customerCity = NULL,
          notes = NULL, acceptedByName = NULL, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [ANONYMIZED_NAME, id]
      );
      // Deliberately no customer details in the audit details blob — logging the name we
      // just erased would defeat the point of erasing it.
      await logAudit({
        entityType: 'quote',
        entityId: id,
        action: 'gdpr_anonymized',
        details: { fieldsCleared: ['customerName', 'customerEmail', 'customerPhone', 'customerCompany', 'customerVatNumber', 'customerStreet', 'customerPostalCode', 'customerCity', 'notes', 'acceptedByName'] },
        user: req.user,
      });
      anonymized += 1;
    }

    res.json({ anonymized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clears just the reservedFor text on the given inventory units — the erasure counterpart
// to the inventory half of /search above. Separate from /anonymize since an inventory unit
// isn't a quote (nothing else on it is personal data to strip).
router.post('/anonymize-inventory', async (req, res) => {
  try {
    const { inventoryIds } = req.body;
    if (!Array.isArray(inventoryIds) || inventoryIds.length === 0) {
      return res.status(400).json({ error: 'inventoryIds is verplicht en moet minstens 1 voorraadeenheid bevatten' });
    }

    let anonymized = 0;
    for (const id of inventoryIds) {
      const unit = await getAsync('SELECT id FROM inventory WHERE id = ?', [id]);
      if (!unit) continue;

      await runAsync(`UPDATE inventory SET reservedFor = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      await logAudit({
        entityType: 'inventory',
        entityId: id,
        action: 'gdpr_anonymized',
        details: { fieldsCleared: ['reservedFor'] },
        user: req.user,
      });
      anonymized += 1;
    }

    res.json({ anonymized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
