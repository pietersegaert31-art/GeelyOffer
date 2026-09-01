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
// never trust a client-submitted accessory id at face value — an option that exists but
// belongs to a DIFFERENT vehicle model must not be accepted just because the id is valid.
// Shared by colorAccessoryId and interiorAccessoryId — same rule, different catalog column.
// Also checks the accessory's own category matches the field it's being assigned to
// (colorAccessoryId must be an 'exterior' option, interiorAccessoryId an 'interior' one) —
// without this, colorAccessoryId could silently be set to an interior-catalog id (or the
// reverse) as long as it applied to that model, corrupting the colorName/interiorName
// display fields and confusing QuoteBuilder.jsx's stock-match comparison.
async function validateAccessoryId(accessoryId, vehicleName, expectedCategory, unknownMessage, notApplicableMessage, wrongCategoryMessage) {
  if (!accessoryId) return null;
  const accessory = await getAsync('SELECT id, category, vehicleModels FROM accessories WHERE id = ?', [accessoryId]);
  if (!accessory) return unknownMessage;
  if (accessory.category !== expectedCategory) return wrongCategoryMessage;
  const applicableModels = JSON.parse(accessory.vehicleModels || '[]');
  if (applicableModels.length > 0 && !applicableModels.includes(vehicleName)) {
    return notApplicableMessage;
  }
  return null;
}

function validateColorAccessoryId(colorAccessoryId, vehicleName) {
  return validateAccessoryId(
    colorAccessoryId, vehicleName, 'exterior',
    'Onbekende kleuroptie', 'Deze kleuroptie is niet beschikbaar voor dit voertuig', 'Deze optie is geen kleuroptie'
  );
}

function validateInteriorAccessoryId(interiorAccessoryId, vehicleName) {
  return validateAccessoryId(
    interiorAccessoryId, vehicleName, 'interior',
    'Onbekende interieuroptie', 'Deze interieuroptie is niet beschikbaar voor dit voertuig', 'Deze optie is geen interieuroptie'
  );
}

// Joins in the display fields the UI needs (vehicle name/model, branch name, color/interior
// name + swatch) so the frontend doesn't have to stitch catalogs together itself. Two
// separate LEFT JOINs against the same accessories table (aliased) since a unit's exterior
// color and interior/upholstery are two independent catalog rows.
const SELECT_WITH_JOINS = `
  SELECT
    inv.*,
    v.name AS vehicleName, v.model AS vehicleModel,
    b.name AS branchName,
    a.name AS colorName, a.colorHex AS colorHex,
    ai.name AS interiorName, ai.colorHex AS interiorHex
  FROM inventory inv
  JOIN vehicles v ON v.id = inv.vehicleId
  LEFT JOIN branches b ON b.id = inv.branchId
  LEFT JOIN accessories a ON a.id = inv.colorAccessoryId
  LEFT JOIN accessories ai ON ai.id = inv.interiorAccessoryId
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
    const { vehicleId, branchId, vin, colorAccessoryId, interiorAccessoryId, status = 'in_stock', expectedArrival, reservedFor, notes } = req.body;
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
    const interiorError = await validateInteriorAccessoryId(interiorAccessoryId, vehicle.name);
    if (interiorError) {
      return res.status(400).json({ error: interiorError });
    }

    const id = uuidv4();
    await runAsync(
      `INSERT INTO inventory (id, vehicleId, branchId, vin, colorAccessoryId, interiorAccessoryId, status, expectedArrival, reservedFor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, vehicleId, branchId || null, vin || null, colorAccessoryId || null, interiorAccessoryId || null, status, expectedArrival || null, reservedFor || null, notes || null]
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

    const { branchId, vin, colorAccessoryId, interiorAccessoryId, status, expectedArrival, reservedFor, notes } = req.body;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status moet één van volgende zijn: ${STATUSES.join(', ')}` });
    }
    if (branchId !== undefined) {
      const branchError = await validateBranchId(branchId);
      if (branchError) {
        return res.status(400).json({ error: branchError });
      }
    }
    if (colorAccessoryId !== undefined || interiorAccessoryId !== undefined) {
      // Fetched once and reused for both checks below — colorAccessoryId and
      // interiorAccessoryId validate against the exact same vehicle (existing.vehicleId
      // never changes via this endpoint), so there's no reason to look it up twice.
      const vehicle = await getAsync('SELECT name FROM vehicles WHERE id = ?', [existing.vehicleId]);
      if (colorAccessoryId !== undefined) {
        const colorError = await validateColorAccessoryId(colorAccessoryId, vehicle?.name);
        if (colorError) {
          return res.status(400).json({ error: colorError });
        }
      }
      if (interiorAccessoryId !== undefined) {
        const interiorError = await validateInteriorAccessoryId(interiorAccessoryId, vehicle?.name);
        if (interiorError) {
          return res.status(400).json({ error: interiorError });
        }
      }
    }

    await runAsync(
      `UPDATE inventory SET branchId = ?, vin = ?, colorAccessoryId = ?, interiorAccessoryId = ?, status = ?, expectedArrival = ?, reservedFor = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        branchId !== undefined ? (branchId || null) : existing.branchId,
        vin !== undefined ? (vin || null) : existing.vin,
        colorAccessoryId !== undefined ? (colorAccessoryId || null) : existing.colorAccessoryId,
        interiorAccessoryId !== undefined ? (interiorAccessoryId || null) : existing.interiorAccessoryId,
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
