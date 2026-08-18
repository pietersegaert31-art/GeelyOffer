import express from 'express';
import { allAsync } from '../database/init.js';
import { requireAuth, requireManager, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange, requireManager);

function closeRate(accepted, declined) {
  const decided = accepted + declined;
  return decided > 0 ? accepted / decided : null;
}

// This calendar month and the one before it, in UTC — used for the fixed
// month-over-month trend, independent of whatever date range is selected above it.
function monthRangeBounds() {
  const now = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    previousStart: fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))),
    currentStart: fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    nextStart: fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))),
  };
}

async function getMonthlyTrend(branchId) {
  const { previousStart, currentStart, nextStart } = monthRangeBounds();
  const conditions = ['createdAt >= ?', 'createdAt < ?'];
  const params = [previousStart, nextStart];
  if (branchId) {
    conditions.push('branchId = ?');
    params.push(branchId);
  }
  const rows = await allAsync(
    `SELECT status, totalPrice, createdAt FROM quotes WHERE ${conditions.join(' AND ')}`,
    params
  );

  const bucket = () => ({ total: 0, accepted: 0, declined: 0, acceptedValue: 0 });
  const current = bucket();
  const previous = bucket();

  for (const r of rows) {
    const target = r.createdAt >= currentStart ? current : previous;
    target.total += 1;
    if (r.status === 'accepted') {
      target.accepted += 1;
      target.acceptedValue += r.totalPrice;
    }
    if (r.status === 'declined') target.declined += 1;
  }

  return {
    current: { ...current, closeRate: closeRate(current.accepted, current.declined) },
    previous: { ...previous, closeRate: closeRate(previous.accepted, previous.declined) },
  };
}

// Sales summary: funnel counts by status, close rate, most-configured vehicle
// models, and a per-salesperson breakdown — the numbers a sales/branch manager
// needs without digging through the raw quote list.
router.get('/summary', async (req, res) => {
  try {
    const { from, to, branchId } = req.query;
    const conditions = [];
    const params = [];
    if (from) {
      conditions.push('createdAt >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('createdAt <= ?');
      params.push(`${to} 23:59:59`);
    }
    if (branchId) {
      conditions.push('branchId = ?');
      params.push(branchId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const quotes = await allAsync(
      `SELECT status, configuration, totalPrice, createdBy, createdByName, branchId, branchName FROM quotes ${whereClause}`,
      params
    );

    const totals = { total: quotes.length, draft: 0, sent: 0, accepted: 0, declined: 0 };
    let acceptedValue = 0;
    const modelCounts = new Map();
    const salespersonCounts = new Map();
    const branchCounts = new Map();

    for (const q of quotes) {
      if (totals[q.status] !== undefined) totals[q.status] += 1;
      if (q.status === 'accepted') acceptedValue += q.totalPrice;

      let label = 'Onbekend';
      try {
        const config = JSON.parse(q.configuration || '{}');
        label = `${config.vehicleName || ''} ${config.vehicleModel || ''}`.trim() || label;
      } catch {
        // malformed configuration JSON — group under "Onbekend" rather than fail the report
      }
      const modelEntry = modelCounts.get(label) || { model: label, count: 0, totalValue: 0 };
      modelEntry.count += 1;
      modelEntry.totalValue += q.totalPrice;
      modelCounts.set(label, modelEntry);

      const salespersonKey = q.createdBy || 'onbekend';
      const salespersonEntry = salespersonCounts.get(salespersonKey) || {
        id: q.createdBy || null,
        name: q.createdByName || 'Onbekend',
        total: 0,
        accepted: 0,
        declined: 0,
      };
      salespersonEntry.total += 1;
      if (q.status === 'accepted') salespersonEntry.accepted += 1;
      if (q.status === 'declined') salespersonEntry.declined += 1;
      salespersonCounts.set(salespersonKey, salespersonEntry);

      const branchKey = q.branchId || 'onbekend';
      const branchEntry = branchCounts.get(branchKey) || {
        id: q.branchId || null,
        name: q.branchName || 'Onbekend',
        total: 0,
        accepted: 0,
        declined: 0,
      };
      branchEntry.total += 1;
      if (q.status === 'accepted') branchEntry.accepted += 1;
      if (q.status === 'declined') branchEntry.declined += 1;
      branchCounts.set(branchKey, branchEntry);
    }

    const bySalesperson = [...salespersonCounts.values()]
      .map((entry) => ({ ...entry, closeRate: closeRate(entry.accepted, entry.declined) }))
      .sort((a, b) => b.total - a.total);

    const byBranch = [...branchCounts.values()]
      .map((entry) => ({ ...entry, closeRate: closeRate(entry.accepted, entry.declined) }))
      .sort((a, b) => b.total - a.total);

    res.json({
      totals,
      acceptedValue,
      conversionRate: totals.total > 0 ? totals.accepted / totals.total : 0,
      closeRate: closeRate(totals.accepted, totals.declined),
      topModels: [...modelCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
      bySalesperson,
      byBranch,
      monthlyTrend: await getMonthlyTrend(branchId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
