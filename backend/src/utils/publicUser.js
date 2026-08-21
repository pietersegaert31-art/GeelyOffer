// The single shape a user row is trimmed to before it ever leaves the server —
// used by every route that returns a user (auth, users) so they can't drift apart.
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    active: !!user.active,
    mustChangePassword: !!user.mustChangePassword,
    branchId: user.branchId || null,
    createdAt: user.createdAt,
  };
}
