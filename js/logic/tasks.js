// Aufgaben: deutsche Spracheingabe ("Übungsblatt 3 #ana bis morgen 10 Uhr !") und Gruppierung.
import { today, addDays, weekday, diffDays, isValidDate, pad, parseDate, toISODate, fmtDate, relDay, nowMinutes, timeToMin } from '../core/date.js';
import { norm } from '../core/util.js';

const WEEKDAY_FULL = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
const WEEKDAY_SHORT = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const MONTH_ABBR = ['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];
const PREPS = new Set(['bis', 'am', 'zum', 'ab', 'für', 'fuer', 'spätestens', 'bis zum']);
const NEXT_WORDS = new Set(['nächsten', 'nächste', 'nächster', 'naechsten', 'naechste', 'kommenden', 'kommende', 'kommender', 'diesen', 'diese', 'dieser']);
const NUM_WORDS = { ein: 1, eine: 1, einem: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, vierzehn: 14 };

function toNum(w) {
  if (/^\d{1,3}$/.test(w)) return Number(w);
  return NUM_WORDS[w] ?? null;
}

function nextWeekday(base, wd, allowToday = false) {
  const cur = weekday(base);
  let delta = (wd - cur + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  return addDays(base, delta);
}

function monthIndex(w) {
  const m = MONTHS.indexOf(w);
  if (m >= 0) return m;
  const a = MONTH_ABBR.indexOf(w.slice(0, 3));
  if (a >= 0 && w.length <= 4) return a;
  if (w === 'maerz') return 2;
  return -1;
}

/** Datum aus Tag/Monat(/Jahr) – Vergangenes (älter als 7 Tage) springt ins nächste Jahr. */
function resolveDM(d, m, y, base) {
  const by = parseDate(base).getFullYear();
  let year = y == null ? by : (y < 100 ? 2000 + y : y);
  let s = `${year}-${pad(m + 1)}-${pad(d)}`;
  if (!isValidDate(s)) return null;
  if (y == null && diffDays(base, s) < -7) {
    s = `${year + 1}-${pad(m + 1)}-${pad(d)}`;
    if (!isValidDate(s)) return null;
  }
  return s;
}

/**
 * Versucht an Position i einen Datumsausdruck zu erkennen.
 * @returns {{date: string, len: number}|null}
 */
function matchDateAt(w, i, base) {
  const a = w[i], b = w[i + 1], c = w[i + 2];
  if (a === 'heute' || a === 'heut') return { date: base, len: 1 };
  if (a === 'morgen') return { date: addDays(base, 1), len: 1 };
  if (a === 'übermorgen' || a === 'uebermorgen') return { date: addDays(base, 2), len: 1 };
  if (a === 'in' && b != null) {
    const n = toNum(b);
    if (n != null && c != null) {
      if (/^tag(en|e)?$/.test(c)) return { date: addDays(base, n), len: 3 };
      if (/^woche(n)?$/.test(c)) return { date: addDays(base, n * 7), len: 3 };
      if (/^monat(en|e)?$/.test(c)) {
        const d = parseDate(base);
        d.setMonth(d.getMonth() + n);
        return { date: toISODate(d), len: 3 };
      }
    }
  }
  if (NEXT_WORDS.has(a) && b === 'woche') return { date: nextWeekday(base, 0), len: 2 };
  if (a === 'nächstewoche') return { date: nextWeekday(base, 0), len: 1 };
  if ((a === 'ende' && b === 'der' && c === 'woche') || a === 'wochenende') {
    const target = a === 'wochenende' ? 5 : 4;
    const wd = weekday(base);
    const date = wd <= target ? addDays(base, target - wd) : nextWeekday(base, target);
    return { date, len: a === 'wochenende' ? 1 : 3 };
  }
  if ((a === 'ende' && b === 'des' && c === 'monats') || a === 'monatsende') {
    const d = parseDate(base);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { date: toISODate(last), len: a === 'monatsende' ? 1 : 3 };
  }
  // Wochentage: "Freitag", "nächsten Freitag", "am Fr"
  if (NEXT_WORDS.has(a) && b != null) {
    const wd = WEEKDAY_FULL.indexOf(b) >= 0 ? WEEKDAY_FULL.indexOf(b) : WEEKDAY_SHORT.indexOf(b);
    if (wd >= 0) return { date: nextWeekday(base, wd), len: 2 };
  }
  const full = WEEKDAY_FULL.indexOf(a);
  if (full >= 0) return { date: nextWeekday(base, full), len: 1 };
  const short = WEEKDAY_SHORT.indexOf(a);
  if (short >= 0 && i > 0 && PREPS.has(w[i - 1])) return { date: nextWeekday(base, short), len: 1 };
  // 15.11. / 15.11.2026 / 15.11.26 / 15.11
  let m = /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/.exec(a);
  if (m) {
    const date = resolveDM(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : null, base);
    if (date) return { date, len: 1 };
  }
  // 2026-11-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(a) && isValidDate(a)) return { date: a, len: 1 };
  // "15. November (2026)" / "15 nov"
  m = /^(\d{1,2})\.?$/.exec(a);
  if (m && b != null) {
    const mi = monthIndex(b.replace(/\.$/, ''));
    if (mi >= 0) {
      const y = c != null && /^\d{4}$/.test(c) ? Number(c) : null;
      const date = resolveDM(Number(m[1]), mi, y, base);
      if (date) return { date, len: y ? 3 : 2 };
    }
  }
  return null;
}

function matchTimeAt(w, i) {
  const a = w[i], b = w[i + 1];
  let m;
  const hasUm = i > 0 && w[i - 1] === 'um';
  if ((m = /^(\d{1,2})(?:[:.](\d{2}))?(uhr|h)?$/.exec(a))) {
    const h = Number(m[1]), min = m[2] ? Number(m[2]) : 0;
    const uhr = !!m[3] || b === 'uhr';
    if (h > 23 || min > 59) return null;
    if (!(hasUm || uhr || (m[2] && a.includes(':')))) return null;
    return { time: `${pad(h)}:${pad(min)}`, len: (b === 'uhr' && !m[3]) ? 2 : 1, um: hasUm };
  }
  return null;
}

export function findCourse(q, courses) {
  const n = norm(q);
  if (!n) return null;
  return courses.find((c) => norm(c.short) === n)
    ?? courses.find((c) => norm(c.name) === n)
    ?? courses.find((c) => norm(c.short).startsWith(n))
    ?? courses.find((c) => norm(c.name).replace(/\s+/g, '').startsWith(n))
    ?? courses.find((c) => norm(c.name).split(/[\s&,-]+/).some((x) => x.length > 2 && x.startsWith(n)))
    ?? null;
}

/**
 * Schnelleingabe parsen.
 * @returns {{title, due, dueTime, courseId, priority, parts: {kind, label}[]}}
 */
export function parseQuickAdd(input, { courses = [], base = today() } = {}) {
  const toks = String(input ?? '').trim().split(/\s+/).filter(Boolean);
  const used = new Array(toks.length).fill(false);
  const w = toks.map((t) => t.toLowerCase().replace(/^[("'„“‚]+|[)"'“”‘’,;:!?]+$/g, ''));
  const words = w.map((t) => (/^\d{1,2}\.\d{1,2}\.?(\d{2,4})?$/.test(t) || /^\d{1,2}\.$/.test(t) ? t : t.replace(/\.$/, '')));
  let due = null, dueTime = null, courseId = null, priority = 0;
  const parts = [];

  toks.forEach((t, i) => {
    if (/^!{1,3}$/.test(t)) { priority = Math.max(priority, Math.min(2, t.length)); used[i] = true; }
  });

  toks.forEach((t, i) => {
    if (courseId || used[i] || !t.startsWith('#') || t.length < 2) return;
    const c = findCourse(t.slice(1), courses);
    if (c) { courseId = c.id; used[i] = true; }
  });

  for (let i = 0; i < toks.length && !due; i++) {
    if (used[i]) continue;
    const r = matchDateAt(words, i, base);
    if (!r) continue;
    due = r.date;
    for (let k = i; k < i + r.len; k++) used[k] = true;
    if (i > 0 && !used[i - 1] && PREPS.has(words[i - 1])) used[i - 1] = true;
    if (i > 1 && !used[i - 2] && words[i - 2] === 'bis' && words[i - 1] === 'zum') used[i - 2] = true;
  }

  for (let i = 0; i < toks.length && !dueTime; i++) {
    if (used[i]) continue;
    const r = matchTimeAt(words, i);
    if (!r) continue;
    dueTime = r.time;
    for (let k = i; k < i + r.len; k++) used[k] = true;
    if (r.um) used[i - 1] = true;
  }

  // Kurs auch ohne # erkennen, wenn ein Wort exakt einem Kurskürzel entspricht (Wort bleibt im Titel)
  if (!courseId) {
    for (let i = 0; i < toks.length; i++) {
      if (used[i]) continue;
      const n = norm(words[i]);
      if (n.length < 2) continue;
      const c = courses.find((x) => norm(x.short) === n || norm(x.name) === n);
      if (c) { courseId = c.id; break; }
    }
  }

  if (dueTime && !due) due = timeToMin(dueTime) > nowMinutes() ? base : addDays(base, 1);

  let title = toks.filter((_, i) => !used[i]).join(' ').replace(/\s+([,.;:!?])/g, '$1').replace(/[\s,;:–-]+$/, '').trim();
  if (!title && courseId) title = courses.find((c) => c.id === courseId)?.name ?? '';

  if (due) parts.push({ kind: 'date', label: `${relDay(due, base)}${Math.abs(diffDays(base, due)) > 1 ? ` · ${fmtDate(due)}` : ''}` });
  if (dueTime) parts.push({ kind: 'time', label: `${dueTime} Uhr` });
  if (courseId) parts.push({ kind: 'course', label: courses.find((c) => c.id === courseId)?.short || courses.find((c) => c.id === courseId)?.name, courseId });
  if (priority) parts.push({ kind: 'prio', label: priority > 1 ? 'Sehr wichtig' : 'Wichtig' });
  return { title, due, dueTime, courseId, priority, parts };
}

function taskSort(a, b) {
  if ((a.due ?? '9999') !== (b.due ?? '9999')) return (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1;
  if ((a.dueTime ?? '99') !== (b.dueTime ?? '99')) return (a.dueTime ?? '99') < (b.dueTime ?? '99') ? -1 : 1;
  if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  return (a.createdAt || 0) - (b.createdAt || 0);
}

export const GROUP_LABELS = {
  overdue: 'Überfällig', today: 'Heute', tomorrow: 'Morgen', week: 'Diese Woche', later: 'Später', nodate: 'Ohne Datum', done: 'Erledigt',
};

/** Aufgaben in Abschnitte einteilen. */
export function groupTasks(tasks, base = today()) {
  const g = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
  for (const t of tasks) {
    if (t.done) { g.done.push(t); continue; }
    if (!t.due) { g.nodate.push(t); continue; }
    const d = diffDays(base, t.due);
    if (d < 0) g.overdue.push(t);
    else if (d === 0) g.today.push(t);
    else if (d === 1) g.tomorrow.push(t);
    else if (d < 7) g.week.push(t);
    else g.later.push(t);
  }
  for (const k of Object.keys(g)) g[k].sort(taskSort);
  g.nodate.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  g.done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return g;
}

export function openTasks(tasks) { return tasks.filter((t) => !t.done); }

export function dueCount(tasks, base = today()) {
  return tasks.filter((t) => !t.done && t.due && t.due <= base).length;
}

/** Nächste anstehende Aufgaben (überfällig + die nächsten n Tage). */
export function upcomingTasks(tasks, days = 3, base = today()) {
  const limit = addDays(base, days);
  return tasks.filter((t) => !t.done && t.due && t.due <= limit).sort(taskSort);
}

export { taskSort };
