import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

// List branches — every authenticated user can read this (needed to populate the
// branch picker on the user form and the branch filter in reports), only admins can edit.
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' && req.user.role === 'admin';
    const rows = await allAsync(
      includeInactive
        ? 'SELECT * FROM branches ORDER BY name ASC'
        : 'SELECT * FROM branches WHERE active = 1 ORDER BY name ASC'
    );
    res.json(rows.map((b) => ({ ...b, active: !!b.active })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name || !address) {
      return res.status(400).json({ error: 'Naam en adres zijn verplicht' });
    }

    const id = uuidv4();
    await runAsync('INSERT INTO branches (id, name, address, active) VALUES (?, ?, ?, 1)', [id, name, address]);

    const row = await getAsync('SELECT * FROM branches WHERE id = ?', [id]);
    res.status(201).json({ ...row, active: !!row.active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await getAsync('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Vestiging niet gevonden' });
    }

    const { name, address, active } = req.body;
    await runAsync(
      'UPDATE branches SET name = ?, address = ?, active = ? WHERE id = ?',
      [
        name ?? existing.name,
        address ?? existing.address,
        active === undefined ? existing.active : (active ? 1 : 0),
        req.params.id,
      ]
    );

    const updated = await getAsync('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    res.json({ ...updated, active: !!updated.active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
