import { COOKIE_NAME, verifyToken } from '../utils/auth.js';
import { getAsync } from '../database/init.js';
import { toPublicUser } from '../utils/publicUser.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  try {
    // Re-read the user on every request instead of trusting the token's payload for
    // role/active/mustChangePassword — otherwise a demotion, deactivation, or forced
    // password reset wouldn't take effect until the old token expires (up to 12h later).
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Niet ingelogd' });
    }
    req.user = toPublicUser(user);
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// A user with a pending forced password change (freshly created, or reset by an admin)
// can only reach the auth routes (to change their password, check who they are, or log
// out) until they've done so — every other route is blocked here rather than trusting
// the frontend to enforce it.
export function blockPendingPasswordChange(req, res, next) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Wijzig eerst je wachtwoord voordat je verdergaat', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Alleen beheerders hebben toegang tot deze actie' });
  }
  next();
}

export function requireManager(req, res, next) {
  if (!['admin', 'sales_manager'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Alleen beheerders en sales managers hebben toegang tot deze actie' });
  }
  next();
}
