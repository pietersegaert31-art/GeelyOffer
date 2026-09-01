import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin, isManagerRole, blockPendingPasswordChange } from '../middleware/auth.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

// Shared basePrice rule for both create and update, so the two endpoints can never drift
// on what counts as valid: required (a finite positive number) unless the vehicle is
// "coming soon", in which case it's optional but still must not be negative when given.
function validateBasePrice(basePrice, comingSoon) {
  if (!comingSoon) {
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return 'basePrice is verplicht tenzij het voertuig "Coming soon" is';
    }
    return null;
  }
  if (basePrice !== undefined && basePrice !== null && (!Number.isFinite(basePrice) || basePrice < 0)) {
    return 'basePrice mag niet negatief zijn';
  }
  return null;
}

// Get all active vehicles
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' && isManagerRole(req.user.role);
    const vehicles = await allAsync(
      includeInactive
        ? 'SELECT * FROM vehicles ORDER BY name ASC, model ASC'
        : 'SELECT * FROM vehicles WHERE active = 1 ORDER BY name ASC, model ASC'
    );
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get vehicle by ID
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await getAsync(
      'SELECT * FROM vehicles WHERE id = ?',
      [req.params.id]
    );
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new vehicle (admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl, comingSoon, deliveryEstimate } = req.body;

    if (!name || !model) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // A "coming soon" model has no announced price yet — everything else still needs a
    // real, non-negative basePrice before it can appear as buildable. A "coming soon" model
    // MAY still be given a price up front (to have it ready for launch), so that's still
    // checked for validity when present — just not required.
    const basePriceError = validateBasePrice(basePrice, comingSoon);
    if (basePriceError) {
      return res.status(400).json({ error: basePriceError });
    }

    const id = uuidv4();
    await runAsync(
      `INSERT INTO vehicles (id, name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl, comingSoon, deliveryEstimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        model,
        comingSoon ? (Number.isFinite(basePrice) ? basePrice : 0) : basePrice,
        fuel || (comingSoon ? 'Nog niet bekend' : 'Petrol'),
        transmission || (comingSoon ? 'Nog niet bekend' : 'Automatic'),
        power,
        torque,
        consumption,
        specifications || '{}',
        imageUrl,
        comingSoon ? 1 : 0,
        deliveryEstimate || null,
      ]
    );

    const vehicle = await getAsync('SELECT * FROM vehicles WHERE id = ?', [id]);
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a vehicle (admin) — price, specs, active flag
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await getAsync('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const { name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl, active, comingSoon, deliveryEstimate } = req.body;
    const resolvedComingSoon = comingSoon === undefined ? existing.comingSoon : (comingSoon ? 1 : 0);
    // Only re-validated when this request actually touches basePrice or comingSoon — an
    // edit that touches neither (e.g. just renaming the vehicle) must never be blocked by
    // a value it never submitted, the same reasoning as quotes.js's trade-in validation.
    // comingSoon flipping is included even without a new basePrice, since that's exactly
    // the moment the applicable price rule changes (e.g. toggling a "coming soon" model
    // live must not silently keep an old €0 basePrice from before it had a real price).
    if (basePrice !== undefined || comingSoon !== undefined) {
      const resolvedBasePrice = basePrice !== undefined ? basePrice : existing.basePrice;
      const basePriceError = validateBasePrice(resolvedBasePrice, resolvedComingSoon);
      if (basePriceError) {
        return res.status(400).json({ error: basePriceError });
      }
    }

    await runAsync(
      `UPDATE vehicles SET name = ?, model = ?, basePrice = ?, fuel = ?, transmission = ?, power = ?, torque = ?, consumption = ?, specifications = ?, imageUrl = ?, active = ?, comingSoon = ?, deliveryEstimate = ?
       WHERE id = ?`,
      [
        name ?? existing.name,
        model ?? existing.model,
        basePrice ?? existing.basePrice,
        fuel ?? existing.fuel,
        transmission ?? existing.transmission,
        power ?? existing.power,
        torque ?? existing.torque,
        consumption ?? existing.consumption,
        specifications ?? existing.specifications,
        imageUrl ?? existing.imageUrl,
        active === undefined ? existing.active : (active ? 1 : 0),
        resolvedComingSoon,
        deliveryEstimate !== undefined ? deliveryEstimate : existing.deliveryEstimate,
        req.params.id,
      ]
    );

    if (basePrice !== undefined && basePrice !== existing.basePrice) {
      await logAudit({
        entityType: 'vehicle',
        entityId: req.params.id,
        action: 'price_changed',
        details: { name: `${existing.name} ${existing.model}`, from: existing.basePrice, to: basePrice },
        user: req.user,
      });
    }

    const updated = await getAsync('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
