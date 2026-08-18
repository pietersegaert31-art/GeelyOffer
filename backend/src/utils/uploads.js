import path from 'path';
import fs from 'fs';
import { getDatabasePath } from '../database/init.js';

let cachedDir;

// Co-located with the SQLite database file so it lands on the same persistent disk on
// Render — no separate volume or env var to configure, and it survives redeploys the
// same way the database already does.
export function getUploadsDir() {
  if (!cachedDir) {
    cachedDir = path.join(path.dirname(getDatabasePath()), 'uploads');
    fs.mkdirSync(cachedDir, { recursive: true });
  }
  return cachedDir;
}
