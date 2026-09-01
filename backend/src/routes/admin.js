import express from 'express';
import fs from 'fs';
import { getDatabasePath } from '../database/init.js';
import { requireAuth, requireAdmin, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange, requireAdmin);

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
  const stream = fs.createReadStream(dbPath);
  // Without this, a read error here (the file removed or locked between the existsSync
  // check above and the stream actually reading it) is an unhandled 'error' event — with
  // no process-level uncaughtException handler anywhere in this app, that crashes the
  // entire server for every user, not just the admin downloading the backup.
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Kon back-up niet lezen: ' + err.message });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
});

export default router;
