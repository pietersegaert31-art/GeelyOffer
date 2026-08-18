import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';
import { logAudit } from '../utils/auditLog.js';
import { getUploadsDir } from '../utils/uploads.js';
import { parsePriceList } from '../utils/priceListParser.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange, requireManager);

// PDF/Word are accepted as a document archive (price sheets, campaign terms, ...) but
// are never auto-parsed — extracting a structured price table from free-form text
// reliably enough to trust with real prices isn't something this app attempts.
// Only .xlsx/.csv get parsed into a reviewable proposal.
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.csv']);
const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.csv']);
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadsDir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ALLOWED_EXTENSIONS.has(ext) ? ext : ''}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(Object.assign(new Error('Alleen PDF, Word (.docx/.doc), Excel (.xlsx) en CSV-bestanden zijn toegestaan'), { status: 400 }));
    }
    cb(null, true);
  },
});

function toPublicImport(row) {
  return {
    id: row.id,
    filename: row.filename,
    fileSize: row.fileSize,
    kind: row.kind,
    status: row.status,
    proposedChanges: row.proposedChanges ? JSON.parse(row.proposedChanges) : null,
    unmatchedRows: row.unmatchedRows ? JSON.parse(row.unmatchedRows) : null,
    parseError: row.parseError,
    appliedAt: row.appliedAt,
    uploadedByName: row.uploadedByName,
    createdAt: row.createdAt,
  };
}

// Upload a document — spreadsheets get parsed immediately into a proposal, nothing else happens yet.
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Bestand is te groot (max 15MB)' : err.message;
      return res.status(err.status || 400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand ontvangen' });
    }

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const isSpreadsheet = SPREADSHEET_EXTENSIONS.has(ext);
      let proposedChanges = null;
      let unmatchedRows = null;
      let parseError = null;

      if (isSpreadsheet) {
        try {
          const buffer = fs.readFileSync(req.file.path);
          const result = await parsePriceList(buffer, ext.slice(1));
          proposedChanges = JSON.stringify(result.proposedChanges);
          unmatchedRows = JSON.stringify(result.unmatchedRows);
        } catch (parseErr) {
          parseError = parseErr.message;
        }
      }

      const id = uuidv4();
      await runAsync(
        `INSERT INTO imports (id, filename, storedFilename, fileSize, kind, status, proposedChanges, unmatchedRows, parseError, uploadedBy, uploadedByName)
         VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?, ?)`,
        [
          id,
          req.file.originalname,
          req.file.filename,
          req.file.size,
          isSpreadsheet ? 'spreadsheet' : 'document',
          proposedChanges,
          unmatchedRows,
          parseError,
          req.user.id,
          req.user.name,
        ]
      );

      const row = await getAsync('SELECT * FROM imports WHERE id = ?', [id]);
      res.status(201).json(toPublicImport(row));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const totalRow = await getAsync('SELECT COUNT(*) AS count FROM imports');
    const rows = await allAsync('SELECT * FROM imports ORDER BY createdAt DESC LIMIT ? OFFSET ?', [limit, offset]);

    res.json({
      imports: rows.map(toPublicImport),
      total: totalRow.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalRow.count / limit)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const row = await getAsync('SELECT * FROM imports WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Import niet gevonden' });
    }
    const filePath = path.join(getUploadsDir(), row.storedFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Bestand niet meer aanwezig op de server' });
    }
    res.download(filePath, row.filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply some or all of the previewed price changes. Nothing is ever written until this
// is explicitly called with the reviewed indexes — upload/parse alone never touches
// vehicles or accessories.
router.post('/:id/apply', async (req, res) => {
  try {
    const row = await getAsync('SELECT * FROM imports WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Import niet gevonden' });
    }
    if (row.kind !== 'spreadsheet' || !row.proposedChanges) {
      return res.status(400).json({ error: 'Dit bestand heeft geen te verwerken prijswijzigingen' });
    }
    if (row.status === 'applied') {
      return res.status(400).json({ error: 'Deze import is al toegepast' });
    }

    const allChanges = JSON.parse(row.proposedChanges);
    const { selectedIndexes } = req.body;
    const indexesToApply = Array.isArray(selectedIndexes) && selectedIndexes.length > 0
      ? selectedIndexes
      : allChanges.map((_, i) => i);

    let appliedCount = 0;
    for (const idx of indexesToApply) {
      const change = allChanges[idx];
      if (!change) continue;

      if (change.type === 'vehicle') {
        await runAsync('UPDATE vehicles SET basePrice = ? WHERE id = ?', [change.newPrice, change.id]);
      } else {
        await runAsync('UPDATE accessories SET price = ? WHERE id = ?', [change.newPrice, change.id]);
      }
      await logAudit({
        entityType: change.type,
        entityId: change.id,
        action: 'price_changed',
        details: { name: change.label, from: change.currentPrice, to: change.newPrice, source: 'import', importId: row.id },
        user: req.user,
      });
      appliedCount += 1;
    }

    await runAsync(`UPDATE imports SET status = 'applied', appliedAt = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
    res.json({ applied: appliedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const row = await getAsync('SELECT * FROM imports WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Import niet gevonden' });
    }
    const filePath = path.join(getUploadsDir(), row.storedFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await runAsync('DELETE FROM imports WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
