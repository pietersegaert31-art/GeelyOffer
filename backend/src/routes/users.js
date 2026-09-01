import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { allAsync, getAsync, runAsync } from '../database/init.js';
import { requireAuth, requireAdmin, blockPendingPasswordChange } from '../middleware/auth.js';
import { toPublicUser } from '../utils/publicUser.js';
import { logAudit } from '../utils/auditLog.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange, requireAdmin);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'sales_manager', 'sales'];

// Returns an error message if branchId is set but doesn't match a real branch, or null
// if it's valid (including the "no branch" case — not every account needs one, e.g. HQ admins).
async function validateBranchId(branchId) {
  if (!branchId) return null;
  const branch = await getAsync('SELECT id FROM branches WHERE id = ?', [branchId]);
  return branch ? null : 'Onbekende vestiging';
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
    const { name, email, phone, password, role = 'sales', branchId } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Naam, e-mail, telefoonnummer en wachtwoord zijn verplicht' });
    }
    // Trimmed + lowercased the same way PUT below already normalizes it — without this, an
    // email pasted with stray whitespace (common from a spreadsheet) got stored as-is, and
    // login (routes/auth.js, also trim-less) would then never match what the colleague
    // actually types, permanently locking them out until an admin happened to re-save the
    // account via PUT.
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens bevatten' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol moet admin, sales_manager of sales zijn' });
    }
    const branchError = await validateBranchId(branchId);
    if (branchError) {
      return res.status(400).json({ error: branchError });
    }

    const existing = await getAsync('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'Er bestaat al een gebruiker met dit e-mailadres' });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12);
    await runAsync(
      'INSERT INTO users (id, name, email, phone, passwordHash, role, branchId, mustChangePassword) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [id, name, normalizedEmail, phone, passwordHash, role, branchId || null]
    );

    // Colleague accounts (role, access) are exactly the kind of change every other
    // sensitive-mutation route in this app records — vehicles.js, accessories.js,
    // inventory.js, quotes.js, imports.js, gdpr.js all call logAudit, but nothing in this
    // file previously did, leaving the audit trail blind over account creation, role
    // changes, password resets, deactivation, and deletion.
    await logAudit({
      entityType: 'user',
      entityId: id,
      action: 'created',
      details: { name, email: normalizedEmail, role },
      user: req.user,
    });

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json(toPublicUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a colleague (name, e-mail, role, active, branch, optional password reset)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, role, active, password, branchId } = req.body;
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    // `role &&` used to skip this check entirely for role: '' (an empty string is falsy),
    // and the write below only guards against null/undefined (`role ?? user.role`), not
    // '' — so a request with an empty-string role slipped straight past validation and
    // got persisted, silently bricking that account's access (isManagerRole('') is always
    // false). Checked by `role !== undefined` instead, matching how every other optional
    // field in this handler is validated.
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol moet admin, sales_manager of sales zijn' });
    }
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Naam mag niet leeg zijn' });
    }
    if (branchId !== undefined) {
      const branchError = await validateBranchId(branchId);
      if (branchError) {
        return res.status(400).json({ error: branchError });
      }
    }
    let normalizedEmail = user.email;
    if (email !== undefined) {
      normalizedEmail = String(email).trim().toLowerCase();
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Ongeldig e-mailadres' });
      }
      if (normalizedEmail !== user.email) {
        const existing = await getAsync('SELECT id FROM users WHERE email = ? AND id != ?', [normalizedEmail, req.params.id]);
        if (existing) {
          return res.status(409).json({ error: 'Er bestaat al een gebruiker met dit e-mailadres' });
        }
      }
    }

    // Don't allow deactivating/demoting the last active admin. Both sides normalized to a
    // real boolean first — `active === false` alone missed `active: 0` (0 !== false under
    // strict equality), which would skip this guard while the write below still coerced it
    // to inactive, letting a request with `{active: 0}` deactivate the sole admin account
    // without ever tripping this protection.
    const resolvedActive = active === undefined ? !!user.active : !!active;
    const isDeactivating = resolvedActive === false && !!user.active;
    const isDemoting = role !== undefined && role !== 'admin' && user.role === 'admin';
    if ((isDeactivating || isDemoting) && user.role === 'admin' && user.active) {
      const admins = await allAsync('SELECT id FROM users WHERE role = ? AND active = 1', ['admin']);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Kan de laatste actieve beheerder niet deactiveren of degraderen' });
      }
    }

    if (password && password.length < 8) {
      return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens bevatten' });
    }
    const passwordHash = password ? bcrypt.hashSync(password, 12) : user.passwordHash;
    const resolvedName = name !== undefined ? name : user.name;
    const resolvedRole = role !== undefined ? role : user.role;

    await runAsync(
      'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, active = ?, passwordHash = ?, mustChangePassword = ?, branchId = ? WHERE id = ?',
      [
        resolvedName,
        normalizedEmail,
        phone !== undefined ? phone : user.phone,
        resolvedRole,
        resolvedActive ? 1 : 0,
        passwordHash,
        // An admin setting a new password is a fresh temp password — force the
        // colleague to pick their own on next login, same as a brand-new account.
        password ? 1 : user.mustChangePassword,
        branchId !== undefined ? (branchId || null) : user.branchId,
        req.params.id,
      ]
    );

    // Only the sensitive/notable changes get their own audit entry (matches how quotes.js
    // only logs a discount change when the discount actually changed, not every save).
    if (role !== undefined && resolvedRole !== user.role) {
      await logAudit({
        entityType: 'user', entityId: req.params.id, action: 'role_changed',
        details: { name: user.name, from: user.role, to: resolvedRole }, user: req.user,
      });
    }
    if (active !== undefined && resolvedActive !== !!user.active) {
      await logAudit({
        entityType: 'user', entityId: req.params.id, action: 'status_changed',
        details: { name: user.name, active: resolvedActive }, user: req.user,
      });
    }
    if (password) {
      await logAudit({
        entityType: 'user', entityId: req.params.id, action: 'password_reset',
        details: { name: user.name }, user: req.user,
      });
    }

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
    await logAudit({
      entityType: 'user',
      entityId: req.params.id,
      action: 'deleted',
      details: { name: user.name, email: user.email },
      user: req.user,
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
