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

// Sales managers get the same access as admins by business decision — every access check
// in this app that distinguishes "staff" from "management" should key off this, not a
// separately-typed-out ['admin', 'sales_manager'] array, so the two can never quietly
// drift apart (e.g. one route recognizing a future new management role that another
// forgot to add).
export const MANAGER_ROLES = ['admin', 'sales_manager'];
export function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}

// Kept as a separate function from requireManager (which every route below already treats
// as identical to this) so a future actual admin-only action has a natural, already-
// imported place to plug into without having to touch every existing call site.
export function requireAdmin(req, res, next) {
  if (!isManagerRole(req.user?.role)) {
    return res.status(403).json({ error: 'Alleen beheerders en sales managers hebben toegang tot deze actie' });
  }
  next();
}

export function requireManager(req, res, next) {
  if (!isManagerRole(req.user?.role)) {
    return res.status(403).json({ error: 'Alleen beheerders en sales managers hebben toegang tot deze actie' });
  }
  next();
}
