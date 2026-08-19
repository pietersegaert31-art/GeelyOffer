import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

const STATUSES = ['in_stock', 'incoming', 'reserved', 'sold'];

async function validateBranchId(branchId) {
  if (!branchId) return null;
  const branch = await getAsync('SELECT id FROM branches WHERE id = ?', [branchId]);
  return branch ? null : 'Onbekende vestiging';
}

// Mirrors the applicability rule resolveAccessories() enforces on quotes (routes/quotes.js):
// never trust a client-submitted accessory id at face value — a color that exists but
// belongs to a DIFFERENT vehicle model must not be accepted just because the id is valid.
async function validateColorAccessoryId(colorAccessoryId, vehicleName) {
  if (!colorAccessoryId) return null;
  const accessory = await getAsync('SELECT id, vehicleModels FROM accessories WHERE id = ?', [colorAccessoryId]);
  if (!accessory) return 'Onbekende kleuroptie';
  const applicableModels = JSON.parse(accessory.vehicleModels || '[]');
  if (applicableModels.length > 0 && !applicableModels.includes(vehicleName)) {
    return 'Deze kleuroptie is niet beschikbaar voor dit voertuig';
  }
  return null;
}

// Joins in the display fields the UI needs (vehicle name/model, branch name, color name +
// swatch) so the frontend doesn't have to stitch three catalogs together itself.
const SELECT_WITH_JOINS = `
  SELECT
    inv.*,
    v.name AS vehicleName, v.model AS vehicleModel,
    b.name AS branchName,
    a.name AS colorName, a.colorHex AS colorHex
  FROM inventory inv
  JOIN vehicles v ON v.id = inv.vehicleId
  LEFT JOIN branches b ON b.id = inv.branchId
  LEFT JOIN accessories a ON a.id = inv.colorAccessoryId
`;

// Every authenticated user can see stock levels — "is dit model op voorraad?" is a
// question any rep needs answered while building a quote, not just managers.
router.get('/', async (req, res) => {
  try {
    const { vehicleId, branchId, status } = req.query;
    const conditions = [];
    const params = [];
    if (vehicleId) { conditions.push('inv.vehicleId = ?'); params.push(vehicleId); }
    if (branchId) { conditions.push('inv.branchId = ?'); params.push(branchId); }
    if (status && STATUSES.includes(status)) { conditions.push('inv.status = ?'); params.push(status); }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await allAsync(`${SELECT_WITH_JOINS} ${whereClause} ORDER BY v.name, v.model, b.name`, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireManager, async (req, res) => {
  try {
    const { vehicleId, branchId, vin, colorAccessoryId, status = 'in_stock', expectedArrival, reservedFor, notes } = req.body;
    if (!vehicleId || !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'vehicleId en een geldige status zijn verplicht' });
    }
    const vehicle = await getAsync('SELECT id, name, model FROM vehicles WHERE id = ?', [vehicleId]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Voertuig niet gevonden' });
    }
    const branchError = await validateBranchId(branchId);
    if (branchError) {
      return res.status(400).json({ error: branchError });
    }
    const colorError = await validateColorAccessoryId(colorAccessoryId, vehicle.name);
    if (colorError) {
      return res.status(400).json({ error: colorError });
    }

    const id = uuidv4();
    await runAsync(
      `INSERT INTO inventory (id, vehicleId, branchId, vin, colorAccessoryId, status, expectedArrival, reservedFor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, vehicleId, branchId || null, vin || null, colorAccessoryId || null, status, expectedArrival || null, reservedFor || null, notes || null]
    );

    await logAudit({
      entityType: 'inventory',
      entityId: id,
      action: 'created',
      details: { vehicle: `${vehicle.name} ${vehicle.model}`, status },
      user: req.user,
    });

    const [row] = await allAsync(`${SELECT_WITH_JOINS} WHERE inv.id = ?`, [id]);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireManager, async (req, res) => {
  try {
    const existing = await getAsync('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Voorraadeenheid niet gevonden' });
    }

    const { branchId, vin, colorAccessoryId, status, expectedArrival, reservedFor, notes } = req.body;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status moet één van volgende zijn: ${STATUSES.join(', ')}` });
    }
    if (branchId !== undefined) {
      const branchError = await validateBranchId(branchId);
      if (branchError) {
        return res.status(400).json({ error: branchError });
      }
    }
    if (colorAccessoryId !== undefined) {
      const vehicle = await getAsync('SELECT name FROM vehicles WHERE id = ?', [existing.vehicleId]);
      const colorError = await validateColorAccessoryId(colorAccessoryId, vehicle?.name);
      if (colorError) {
        return res.status(400).json({ error: colorError });
      }
    }

    await runAsync(
      `UPDATE inventory SET branchId = ?, vin = ?, colorAccessoryId = ?, status = ?, expectedArrival = ?, reservedFor = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        branchId !== undefined ? (branchId || null) : existing.branchId,
        vin !== undefined ? (vin || null) : existing.vin,
        colorAccessoryId !== undefined ? (colorAccessoryId || null) : existing.colorAccessoryId,
        status !== undefined ? status : existing.status,
        expectedArrival !== undefined ? (expectedArrival || null) : existing.expectedArrival,
        reservedFor !== undefined ? (reservedFor || null) : existing.reservedFor,
        notes !== undefined ? (notes || null) : existing.notes,
        req.params.id,
      ]
    );

    if (status !== undefined && status !== existing.status) {
      await logAudit({
        entityType: 'inventory',
        entityId: req.params.id,
        action: 'status_changed',
        details: { from: existing.status, to: status },
        user: req.user,
      });
    }

    const [row] = await allAsync(`${SELECT_WITH_JOINS} WHERE inv.id = ?`, [req.params.id]);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireManager, async (req, res) => {
  try {
    const existing = await getAsync('SELECT id FROM inventory WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Voorraadeenheid niet gevonden' });
    }
    await runAsync('DELETE FROM inventory WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
