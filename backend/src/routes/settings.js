import express from 'express';
import { allAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

async function getSetting(key, fallback) {
  const rows = await allAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length ? rows[0].value : fallback;
}

// Every authenticated user can read the financing settings (needed to show the monthly
// payment estimate while building a quote); only admins can change them.
router.get('/financing', async (req, res) => {
  try {
    const annualRatePercent = parseFloat(await getSetting('financingAnnualRatePercent', '6.9'));
    const terms = (await getSetting('financingTerms', '36,48,60'))
      .split(',').map((t) => parseInt(t.trim(), 10)).filter((t) => Number.isFinite(t) && t > 0);
    res.json({ annualRatePercent, terms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/financing', requireAdmin, async (req, res) => {
  try {
    const { annualRatePercent, terms } = req.body;
    if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > 30) {
      return res.status(400).json({ error: 'Rentevoet moet een percentage tussen 0 en 30 zijn' });
    }
    if (!Array.isArray(terms) || terms.length === 0 || !terms.every((t) => Number.isInteger(t) && t > 0 && t <= 120)) {
      return res.status(400).json({ error: 'Looptijden moeten een lijst van gehele maanden zijn (1-120)' });
    }

    await runAsync(
      `INSERT INTO settings (key, value) VALUES ('financingAnnualRatePercent', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(annualRatePercent)]
    );
    await runAsync(
      `INSERT INTO settings (key, value) VALUES ('financingTerms', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [terms.join(',')]
    );

    res.json({ annualRatePercent, terms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
