import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getAsync, runAsync } from '../database/init.js';
import { signToken, cookieOptions, COOKIE_NAME } from '../utils/auth.js';
import { toPublicUser } from '../utils/publicUser.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPasswordResetEmail, isEmailConfigured } from '../utils/email.js';

const router = express.Router();

// Nothing rate-limited login attempts before this — an attacker (or anyone who
// knows a colleague's email, which is just firstname@geely.local) could try
// passwords indefinitely. Lock an account out after repeated failures rather than
// letting every login attempt reach bcrypt.compareSync unthrottled. In-memory is
// fine here: this is a single-process app, and a restart resetting the counters
// is an acceptable tradeoff for a small internal tool.
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // email -> { count, firstAttemptAt }

function isLockedOut(email) {
  const entry = loginAttempts.get(email);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > LOGIN_LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(email) {
  const entry = loginAttempts.get(email);
  if (!entry || Date.now() - entry.firstAttemptAt > LOGIN_LOCKOUT_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstAttemptAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht' });
    }
    const normalizedEmail = email.toLowerCase();

    if (isLockedOut(normalizedEmail)) {
      return res.status(429).json({ error: 'Te veel mislukte inlogpogingen. Probeer het over 15 minuten opnieuw.' });
    }

    const user = await getAsync('SELECT * FROM users WHERE email = ? AND active = 1', [normalizedEmail]);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      recordFailedLogin(normalizedEmail);
      return res.status(401).json({ error: 'Ongeldige inloggegevens' });
    }

    loginAttempts.delete(normalizedEmail);
    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const GENERIC_RESET_MESSAGE = 'Als dit e-mailadres bij ons bekend is, hebben we een link gestuurd om het wachtwoord opnieuw in te stellen.';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail is verplicht' });
    }
    const normalizedEmail = email.toLowerCase();

    // Always respond the same way regardless of whether the account exists — an
    // error that differs for "unknown email" vs "known email" lets an attacker
    // enumerate which colleagues have accounts.
    const user = await getAsync('SELECT * FROM users WHERE email = ? AND active = 1', [normalizedEmail]);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      await runAsync(
        'UPDATE users SET passwordResetTokenHash = ?, passwordResetExpires = ? WHERE id = ?',
        [tokenHash, expires, user.id]
      );

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?resetToken=${token}`;
      if (isEmailConfigured()) {
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      } else {
        // Local dev without SMTP configured — same fallback pattern as the bootstrap
        // admin password: print it server-side instead of silently doing nothing.
        console.log(`✓ Password reset link for ${user.email} (SMTP not configured, printing instead of e-mailing):`);
        console.log(`  ${resetUrl}`);
      }
    }

    res.json({ message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token en nieuw wachtwoord zijn verplicht' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nieuw wachtwoord moet minstens 8 tekens bevatten' });
    }

    const tokenHash = hashResetToken(token);
    const user = await getAsync('SELECT * FROM users WHERE passwordResetTokenHash = ?', [tokenHash]);
    if (!user || !user.passwordResetExpires || new Date(user.passwordResetExpires) < new Date()) {
      return res.status(400).json({ error: 'Deze resetlink is ongeldig of verlopen. Vraag een nieuwe aan.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 12);
    await runAsync(
      'UPDATE users SET passwordHash = ?, mustChangePassword = 0, passwordResetTokenHash = NULL, passwordResetExpires = NULL WHERE id = ?',
      [passwordHash, user.id]
    );

    res.json({ message: 'Wachtwoord succesvol gewijzigd. Je kan nu inloggen.' });
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
    await runAsync('UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?', [passwordHash, user.id]);

    const updated = await getAsync('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ user: toPublicUser(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
