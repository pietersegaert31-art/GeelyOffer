import { v4 as uuidv4 } from 'uuid';
import { runAsync } from '../database/init.js';

// Records who did what, to what, and when — a discount changed, a quote's status
// moved, a catalog price was edited. `details` is a small plain object describing
// the change (e.g. { from: 10, to: 20 }); it's stored as JSON and never interpreted.
export async function logAudit({ entityType, entityId, action, details, user }) {
  await runAsync(
    `INSERT INTO audit_log (id, entityType, entityId, action, details, performedBy, performedByName)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      entityType,
      entityId,
      action,
      details !== undefined ? JSON.stringify(details) : null,
      user?.id || null,
      user?.name || null,
    ]
  );
}
