import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// Get all active vehicles
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' && req.user.role === 'admin';
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
    const { name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl } = req.body;

    if (!name || !model || !basePrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    await runAsync(
      `INSERT INTO vehicles (id, name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, model, basePrice, fuel || 'Petrol', transmission || 'Automatic', power, torque, consumption, specifications || '{}', imageUrl]
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

    const { name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl, active } = req.body;
    if (basePrice !== undefined && (!Number.isFinite(basePrice) || basePrice < 0)) {
      return res.status(400).json({ error: 'basePrice must be a non-negative number' });
    }

    await runAsync(
      `UPDATE vehicles SET name = ?, model = ?, basePrice = ?, fuel = ?, transmission = ?, power = ?, torque = ?, consumption = ?, specifications = ?, imageUrl = ?, active = ?
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
        req.params.id,
      ]
    );

    const updated = await getAsync('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
