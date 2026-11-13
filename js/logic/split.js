// WG-Kasse: Kosten fair aufteilen und mit möglichst wenigen Überweisungen ausgleichen.

/** Anteile einer Ausgabe in Cent pro Person (Map memberId → Cent). Rundungscents fair verteilt. */
export function shares(expense) {
  const m = new Map();
  const split = expense.split ?? { type: 'equal', among: [] };
  if (split.type === 'exact') {
    for (const [id, v] of Object.entries(split.shares ?? {})) if (v) m.set(id, Math.round(v));
    return m;
  }
  const among = split.among ?? [];
  if (!among.length) return m;
  const base = Math.floor(expense.amount / among.length);
  let rest = expense.amount - base * among.length;
  // Rest-Cents rotierend vergeben (abhängig von der ID, damit es nicht immer dieselbe Person trifft)
  const offset = hash(expense.id ?? '') % among.length;
  among.forEach((id) => m.set(id, base));
  for (let i = 0; rest > 0; i++, rest--) {
    const id = among[(offset + i) % among.length];
    m.set(id, m.get(id) + 1);
  }
  return m;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Salden (Cent): positiv = bekommt Geld, negativ = schuldet Geld. */
export function balances(group) {
  const bal = new Map(group.members.map((m) => [m.id, 0]));
  for (const e of group.expenses) {
    if (!bal.has(e.payerId)) bal.set(e.payerId, 0);
    bal.set(e.payerId, bal.get(e.payerId) + e.amount);
    for (const [id, s] of shares(e)) bal.set(id, (bal.get(id) ?? 0) - s);
  }
  return bal;
}

/** Minimale Ausgleichszahlungen (Greedy: größter Schuldner an größten Gläubiger). */
export function settle(bal) {
  const debtors = [], creditors = [];
  for (const [id, v] of bal) {
    if (v < 0) debtors.push({ id, v: -v });
    else if (v > 0) creditors.push({ id, v });
  }
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

export function groupTotal(group) {
  return group.expenses.filter((e) => e.kind !== 'payment').reduce((s, e) => s + e.amount, 0);
}

/** Wer ist diese Woche mit welcher Aufgabe dran? (Putzplan-Rotation) */
export function choreAssignments(tasks, members, weekIndex) {
  if (!tasks.length || !members.length) return [];
  return tasks.map((task, i) => ({ task, member: members[(((i + weekIndex) % members.length) + members.length) % members.length] }));
}
