import express from 'express';
import { requireAuth, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

// There is no free official live KBO search API — the KBO itself only sells paid database
// access or monthly bulk exports. The EU's VIES service (VAT Information Exchange System)
// is free, official, and sources Belgian entries directly from the KBO/BTW-administratie,
// so a valid Belgian VAT number reliably returns the KBO-registered company name + address.
const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';
const LOOKUP_TIMEOUT_MS = 8000;

// Belgian VAT/ondernemingsnummers are "BE" + 10 digits, starting with 0 or 1 — strip any
// "BE" prefix, spaces, or dots the user typed before validating.
function normalizeBelgianVat(raw) {
  return String(raw || '').replace(/^BE/i, '').replace(/[^0-9]/g, '');
}

router.get('/:vatNumber', async (req, res) => {
  const vatNumber = normalizeBelgianVat(req.params.vatNumber);
  if (!/^[01]\d{9}$/.test(vatNumber)) {
    return res.status(400).json({ error: 'Ongeldig BTW-nummer formaat (verwacht: BE + 10 cijfers)' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const viesResponse = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: 'BE', vatNumber }),
      signal: controller.signal,
    });

    if (!viesResponse.ok) {
      return res.status(502).json({ error: 'De BTW-opzoekdienst (VIES) is momenteel niet bereikbaar. Gelieve de gegevens handmatig in te vullen.' });
    }

    const data = await viesResponse.json();
    if (!data.valid || !data.name || data.name === '---') {
      return res.status(404).json({ error: 'Geen bedrijf gevonden voor dit BTW-nummer.' });
    }

    // VIES returns the address as one multi-line string: street on the first line,
    // "postcode gemeente" on the second — split it into the structured fields the rest
    // of the app uses so it can be dropped straight into the customer form.
    const [streetLine = '', cityLine = ''] = String(data.address || '').split('\n');
    const cityMatch = cityLine.match(/^(\d{4,})\s+(.+)$/);

    res.json({
      companyName: data.name,
      street: streetLine.trim(),
      postalCode: cityMatch ? cityMatch[1] : '',
      city: cityMatch ? cityMatch[2].trim() : cityLine.trim(),
    });
  } catch (error) {
    const timedOut = error.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: 'De BTW-opzoekdienst (VIES) is momenteel niet bereikbaar. Gelieve de gegevens handmatig in te vullen.',
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
