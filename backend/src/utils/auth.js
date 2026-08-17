import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'geely_session';
const TOKEN_TTL = '12h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // server.js refuses to boot in production without JWT_SECRET set; this fallback
    // only ever runs in local development so sessions simply reset on restart.
    return 'dev-only-insecure-secret-do-not-use-in-production';
  }
  return secret;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    getSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  };
}
