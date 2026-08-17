import express from 'express';
import fs from 'fs';
import { getDatabasePath } from '../database/init.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Download a raw copy of the SQLite database file — the simplest possible backup:
// an admin can trigger this manually, or an external scheduler (cron, uptime monitor,
// hosting platform's job runner) can hit it on a schedule and store the result off-site.
router.get('/backup', (req, res) => {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'Database file not found' });
  }
  const filename = `geely-offertes-backup-${new Date().toISOString().slice(0, 10)}.db`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(dbPath).pipe(res);
});

export default router;
