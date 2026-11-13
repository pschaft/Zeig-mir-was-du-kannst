// Budget-Logik: Monatsübersicht, Tagesbudget, Fixkosten automatisch buchen.
import { today, monthKey, daysInMonth, addMonths, pad, tsToDate } from '../core/date.js';
import { uid } from '../core/util.js';

export function catMap(budget) {
  return new Map(budget.categories.map((c) => [c.id, c]));
}

export function monthTx(budget, key) {
  return budget.transactions.filter((t) => t.date.startsWith(key));
}

/** Noch ausstehende Fixkosten in diesem Monat (Tag > heute). */
export function upcomingFixed(budget, key, base = today()) {
  if (key !== monthKey(base)) return 0;
  const day = Number(base.slice(8, 10));
  let sum = 0;
  for (const r of budget.recurring) {
    if (!r.active || r.type !== 'expense') continue;
    if ((r.startMonth ?? '0000-00') > key) continue;
    if (r.lastApplied && r.lastApplied >= key) continue;
    const d = Math.min(r.day, daysInMonth(key));
    if (d > day) sum += r.amount;
  }
  return sum;
}

export function monthSummary(budget, key, base = today()) {
  const txs = monthTx(budget, key);
  let expenses = 0, income = 0;
  const byCat = new Map();
  const byDay = new Map();
  for (const t of txs) {
    if (t.type === 'income') { income += t.amount; continue; }
    expenses += t.amount;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  }
  const dim = daysInMonth(key);
  const cur = monthKey(base);
  const isCurrent = key === cur;
  const day = isCurrent ? Number(base.slice(8, 10)) : key < cur ? dim : 0;
  const daysLeft = isCurrent ? dim - day + 1 : key > cur ? dim : 0;
  const fixedAhead = upcomingFixed(budget, key, base);
  const limit = budget.limit || 0;
  const remaining = limit - expenses;
  const perDay = daysLeft > 0 ? Math.floor((remaining - fixedAhead) / daysLeft) : 0;
  const todaySpent = isCurrent ? (byDay.get(base) ?? 0) : 0;
  // Tagesbudget für heute: was heute noch geht (ohne die heutigen Ausgaben doppelt zu zählen)
  const perDayStart = daysLeft > 0 ? Math.floor((remaining + todaySpent - fixedAhead) / daysLeft) : 0;
  const leftToday = perDayStart - todaySpent;
  // Tempo nur für variable Ausgaben bewerten – Fixkosten (Miete am 1.) würden es verzerren
  let fixedBooked = 0;
  for (const t of txs) if (t.type === 'expense' && t.recurringId) fixedBooked += t.amount;
  const fixedTotal = fixedBooked + fixedAhead;
  const pace = dim ? day / dim : 0;
  const variableSpent = expenses - fixedBooked;
  const variableBudget = Math.max(0, limit - fixedTotal);
  const expectedByNow = fixedBooked + variableBudget * pace;
  const tooFast = isCurrent && limit > 0 && variableSpent > variableBudget * pace * 1.1 + 500;
  return {
    key, txs, expenses, income, balance: income - expenses, byCat, byDay, limit, remaining,
    daysLeft, perDay, fixedAhead, dim, day, pace, isCurrent, todaySpent, leftToday,
    fixedBooked, variableSpent, variableBudget, expectedByNow, tooFast,
  };
}

/** Fixkosten buchen, die seit der letzten Buchung fällig geworden sind. Mutiert budget. */
export function applyRecurring(budget, base = today()) {
  const cur = monthKey(base);
  let added = 0;
  for (const r of budget.recurring) {
    if (!r.active) continue;
    let m = r.lastApplied ? addMonths(r.lastApplied, 1) : (r.startMonth ?? cur);
    let guard = 0;
    while (m <= cur && guard++ < 36) {
      const d = Math.min(r.day, daysInMonth(m));
      const date = `${m}-${pad(d)}`;
      if (date > base) break;
      budget.transactions.push({
        id: uid('t'), type: r.type, amount: r.amount, categoryId: r.categoryId, date,
        note: r.note, recurringId: r.id, createdAt: Date.now(),
      });
      r.lastApplied = m;
      added++;
      m = addMonths(m, 1);
    }
  }
  return added;
}

export function trend(budget, months = 6, base = today()) {
  const out = [];
  const cur = monthKey(base);
  for (let i = months - 1; i >= 0; i--) {
    const key = addMonths(cur, -i);
    let expenses = 0, income = 0;
    for (const t of budget.transactions) {
      if (!t.date.startsWith(key)) continue;
      if (t.type === 'income') income += t.amount; else expenses += t.amount;
    }
    out.push({ key, expenses, income });
  }
  return out;
}

export function fixedMonthly(budget) {
  let exp = 0, inc = 0;
  for (const r of budget.recurring) {
    if (!r.active) continue;
    if (r.type === 'income') inc += r.amount; else exp += r.amount;
  }
  return { expenses: exp, income: inc };
}

export function txDate(ts) { return tsToDate(ts); }
