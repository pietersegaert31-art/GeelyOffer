import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: !!user.active, createdAt: user.createdAt };
}

// List colleagues
router.get('/', async (req, res) => {
  try {
    const users = await allAsync('SELECT * FROM users ORDER BY createdAt ASC');
    res.json(users.map(toPublicUser));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a colleague account
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role = 'sales' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Naam, e-mail en wachtwoord zijn verplicht' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens bevatten' });
    }
    if (!['admin', 'sales'].includes(role)) {
      return res.status(400).json({ error: 'Rol moet admin of sales zijn' });
    }

    const existing = await getAsync('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Er bestaat al een gebruiker met dit e-mailadres' });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12);
    await runAsync(
      'INSERT INTO users (id, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)',
      [id, name, email.toLowerCase(), passwordHash, role]
    );

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json(toPublicUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a colleague (name, role, active, optional password reset)
router.put('/:id', async (req, res) => {
  try {
    const { name, role, active, password } = req.body;
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    if (role && !['admin', 'sales'].includes(role)) {
      return res.status(400).json({ error: 'Rol moet admin of sales zijn' });
    }

    // Don't allow deactivating/demoting the last active admin
    if ((active === false || (role && role !== 'admin')) && user.role === 'admin' && user.active) {
      const admins = await allAsync('SELECT id FROM users WHERE role = ? AND active = 1', ['admin']);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Kan de laatste actieve beheerder niet deactiveren of degraderen' });
      }
    }

    const passwordHash = password ? bcrypt.hashSync(password, 12) : user.passwordHash;
    if (password && password.length < 8) {
      return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens bevatten' });
    }

    await runAsync(
      'UPDATE users SET name = ?, role = ?, active = ?, passwordHash = ? WHERE id = ?',
      [
        name ?? user.name,
        role ?? user.role,
        active === undefined ? user.active : (active ? 1 : 0),
        passwordHash,
        req.params.id,
      ]
    );

    const updated = await getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
    res.json(toPublicUser(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a colleague account
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Je kan je eigen account niet verwijderen' });
    }

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }

    if (user.role === 'admin') {
      const admins = await allAsync('SELECT id FROM users WHERE role = ? AND active = 1', ['admin']);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Kan de laatste beheerder niet verwijderen' });
      }
    }

    await runAsync('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
