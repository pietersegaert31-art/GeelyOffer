import express from 'express';
import { allAsync, getAsync } from '../database/init.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange, requireManager);

// List audit entries (newest first), optionally filtered by entity type/id.
router.get('/', async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (entityType) {
      conditions.push('entityType = ?');
      params.push(entityType);
    }
    if (entityId) {
      conditions.push('entityId = ?');
      params.push(entityId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalRow = await getAsync(`SELECT COUNT(*) AS count FROM audit_log ${whereClause}`, params);
    const entries = await allAsync(
      `SELECT * FROM audit_log ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      entries: entries.map((e) => ({ ...e, details: e.details ? JSON.parse(e.details) : null })),
      total: totalRow.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalRow.count / limit)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
