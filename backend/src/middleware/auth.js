import { COOKIE_NAME, verifyToken } from '../utils/auth.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  req.user = { id: payload.sub, name: payload.name, email: payload.email, role: payload.role };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Alleen beheerders hebben toegang tot deze actie' });
  }
  next();
}
