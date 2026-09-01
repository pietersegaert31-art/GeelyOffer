import express from 'express';
import crypto from 'crypto';
import { getAsync, runAsync } from '../database/init.js';
import { logAudit } from '../utils/auditLog.js';
import { BLOCKING_APPROVAL_STATUSES } from './quotes.js';

const router = express.Router();
// Deliberately no requireAuth on this router — a customer clicking the link from their
// e-mail has no account in this system. The token itself (hashed, single-use-per-send,
// tied to the quote's own expiry — see routes/quotes.js send-email) is what authorizes
// access here, the same way a password-reset link works without a session.

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function loadQuoteByToken(token) {
  const tokenHash = hashToken(token);
  const quote = await getAsync('SELECT * FROM quotes WHERE acceptanceTokenHash = ?', [tokenHash]);
  if (!quote || !quote.acceptanceTokenExpires || new Date(quote.acceptanceTokenExpires) < new Date()) {
    return null;
  }
  return quote;
}

// Summary only — never the full quote (no address, no VAT number, no internal ids
// beyond the vehicle label) since this endpoint requires no authentication.
router.get('/:token', async (req, res) => {
  try {
    const quote = await loadQuoteByToken(req.params.token);
    if (!quote) {
      return res.status(404).json({ error: 'Deze link is ongeldig of verlopen.' });
    }
    const vehicle = await getAsync('SELECT name, model FROM vehicles WHERE id = ?', [quote.selectedVehicleId]);

    res.json({
      customerName: quote.customerName,
      vehicleLabel: vehicle ? `${vehicle.name} ${vehicle.model}` : '',
      totalPrice: quote.totalPrice,
      tradeInEnabled: !!quote.tradeInEnabled,
      tradeInValue: quote.tradeInValue,
      status: quote.status,
      alreadyAccepted: quote.status === 'accepted',
      acceptedAt: quote.acceptedAt,
      acceptedByName: quote.acceptedByName,
      expiresAt: quote.expiresAt,
      needsApproval: BLOCKING_APPROVAL_STATUSES.includes(quote.discountApprovalStatus),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:token', async (req, res) => {
  try {
    const quote = await loadQuoteByToken(req.params.token);
    if (!quote) {
      return res.status(404).json({ error: 'Deze link is ongeldig of verlopen.' });
    }
    if (quote.status === 'accepted') {
      return res.json({ message: 'Deze offerte was al bevestigd.', acceptedAt: quote.acceptedAt });
    }
    if (quote.status === 'declined') {
      return res.status(400).json({ error: 'Deze offerte is niet meer geldig.' });
    }
    if (BLOCKING_APPROVAL_STATUSES.includes(quote.discountApprovalStatus)) {
      return res.status(400).json({ error: 'Deze offerte kan nog niet online bevestigd worden — neem contact op met uw verkoper.' });
    }

    const acceptedByName = (req.body?.acceptedByName || '').trim();
    if (!acceptedByName) {
      return res.status(400).json({ error: 'Volledige naam is verplicht om te bevestigen.' });
    }

    // The status = 'accepted' guard above reads the row, but nothing locks it against a
    // second near-simultaneous request (a double-click before the button visually
    // disables, or a client-side retry) also passing that same read before either write
    // lands — both would then run this UPDATE and both log an 'accepted_online' entry for
    // one acceptance. Adding `AND status != 'accepted'` to the UPDATE itself closes that
    // window: only the first request to actually reach the database can still change zero
    // rows to one; a loser sees `changes: 0` and is treated the same as the ordinary
    // already-accepted case above, instead of writing (and logging) a duplicate.
    const result = await runAsync(
      `UPDATE quotes SET status = 'accepted', acceptedAt = CURRENT_TIMESTAMP, acceptedByName = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status != 'accepted'`,
      [acceptedByName, quote.id]
    );
    if (result.changes === 0) {
      const current = await getAsync('SELECT acceptedAt FROM quotes WHERE id = ?', [quote.id]);
      return res.json({ message: 'Deze offerte was al bevestigd.', acceptedAt: current?.acceptedAt });
    }
    await logAudit({
      entityType: 'quote',
      entityId: quote.id,
      action: 'accepted_online',
      details: { acceptedByName },
      user: { name: 'Klant (online, via offertelink)' },
    });

    res.json({ message: 'Bedankt! Uw offerte is bevestigd.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
