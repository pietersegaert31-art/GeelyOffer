import express from 'express';
import bcrypt from 'bcryptjs';
import { getAsync, runAsync } from '../database/init.js';
import { signToken, cookieOptions, COOKIE_NAME } from '../utils/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht' });
    }

    const user = await getAsync('SELECT * FROM users WHERE email = ? AND active = 1', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Ongeldige inloggegevens' });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Ongeldige inloggegevens' });
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nieuw wachtwoord moet minstens 8 tekens bevatten' });
    }

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: 'Huidig wachtwoord is onjuist' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 12);
    await runAsync('UPDATE users SET passwordHash = ? WHERE id = ?', [passwordHash, user.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
