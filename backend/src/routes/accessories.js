import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireManager, isManagerRole, blockPendingPasswordChange } from '../middleware/auth.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

function toPublicAccessory(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    vehicleModels: JSON.parse(row.vehicleModels || '[]'),
    active: !!row.active,
    mandatory: !!row.mandatory,
    discountable: !!row.discountable,
    colorHex: row.colorHex || null,
  };
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Empty/undefined clears it (not every accessory is a color); anything non-empty must
// be a real 6-digit hex so a bad value can't silently break the swatch's CSS.
function normalizeColorHex(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!HEX_COLOR_PATTERN.test(value)) {
    const error = new Error('colorHex moet een geldige hex-kleur zijn, bv. #A1B2C3');
    error.status = 400;
    throw error;
  }
  return value;
}

// List all active accessories (used by the quote builder)
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' && isManagerRole(req.user.role);
    const rows = await allAsync(
      includeInactive
        ? 'SELECT * FROM accessories ORDER BY category ASC, name ASC'
        : 'SELECT * FROM accessories WHERE active = 1 ORDER BY category ASC, name ASC'
    );
    res.json(rows.map(toPublicAccessory));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new accessory (admin or sales manager)
router.post('/', requireManager, async (req, res) => {
  try {
    const { name, price, category, vehicleModels = [], mandatory = false, discountable = true, colorHex } = req.body;
    if (!name || !category || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'name, category en een geldige price zijn verplicht' });
    }

    const id = uuidv4();
    await runAsync(
      'INSERT INTO accessories (id, name, price, category, vehicleModels, active, mandatory, discountable, colorHex) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      [id, name, price, category, JSON.stringify(vehicleModels), mandatory ? 1 : 0, discountable ? 1 : 0, normalizeColorHex(colorHex) ?? null]
    );

    const row = await getAsync('SELECT * FROM accessories WHERE id = ?', [id]);
    await logAudit({
      entityType: 'accessory',
      entityId: id,
      action: 'created',
      details: { name, price },
      user: req.user,
    });
    res.status(201).json(toPublicAccessory(row));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Update an accessory (admin or sales manager) — price, name, category, applicable models, active flag
router.put('/:id', requireManager, async (req, res) => {
  try {
    const existing = await getAsync('SELECT * FROM accessories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Optie niet gevonden' });
    }

    const { name, price, category, vehicleModels, active, mandatory, discountable, colorHex } = req.body;
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return res.status(400).json({ error: 'price moet een niet-negatief getal zijn' });
    }
    const normalizedColorHex = normalizeColorHex(colorHex);

    await runAsync(
      'UPDATE accessories SET name = ?, price = ?, category = ?, vehicleModels = ?, active = ?, mandatory = ?, discountable = ?, colorHex = ? WHERE id = ?',
      [
        name ?? existing.name,
        price ?? existing.price,
        category ?? existing.category,
        vehicleModels ? JSON.stringify(vehicleModels) : existing.vehicleModels,
        active === undefined ? existing.active : (active ? 1 : 0),
        mandatory === undefined ? existing.mandatory : (mandatory ? 1 : 0),
        discountable === undefined ? existing.discountable : (discountable ? 1 : 0),
        normalizedColorHex === undefined ? existing.colorHex : normalizedColorHex,
        req.params.id,
      ]
    );

    if (price !== undefined && price !== existing.price) {
      await logAudit({
        entityType: 'accessory',
        entityId: req.params.id,
        action: 'price_changed',
        details: { name: existing.name, from: existing.price, to: price },
        user: req.user,
      });
    }

    const updated = await getAsync('SELECT * FROM accessories WHERE id = ?', [req.params.id]);
    res.json(toPublicAccessory(updated));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Permanently remove an accessory (admin or sales manager) — prefer deactivating via
// PUT for options that have already been used on quotes, since this doesn't touch
// quote history.
router.delete('/:id', requireManager, async (req, res) => {
  try {
    const existing = await getAsync('SELECT id FROM accessories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Optie niet gevonden' });
    }
    await runAsync('DELETE FROM accessories WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
