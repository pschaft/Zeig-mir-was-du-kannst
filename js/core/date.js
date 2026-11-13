// Datums-Helfer. Kalendertage werden als 'YYYY-MM-DD' (lokale Zeit) gespeichert –
// das vermeidet Zeitzonen-Fallen komplett.

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
export const DAY_MS = 86400000;

export const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = parseDate(s);
  return toISODate(d) === s;
}

let _now = null;
/** Für Tests: feste "Jetzt"-Zeit setzen. */
export function setNow(ts) { _now = ts; }
export function now() { return _now ?? Date.now(); }
export function nowDate() { return new Date(now()); }
export function today() { return toISODate(nowDate()); }

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** b - a in ganzen Tagen (DST-sicher). */
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

/** 0 = Montag … 6 = Sonntag */
export function weekday(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function startOfWeek(s) {
  return addDays(s, -weekday(s));
}

export function isoWeek(s) {
  const d = parseDate(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / DAY_MS + 1) / 7);
}

export function monthKey(s) { return String(s).slice(0, 7); }

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  return `${(short ? MONTHS_SHORT : MONTHS)[m - 1]} ${y}`;
}

export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowMinutes() {
  const d = nowDate();
  return d.getHours() * 60 + d.getMinutes();
}

/** Zeitstempel → 'YYYY-MM-DD' */
export function tsToDate(ts) { return toISODate(new Date(ts)); }

/** Tagesbeginn (lokal) als Zeitstempel. */
export function dayStartTs(s) { return parseDate(s).getTime(); }

export function fmtDate(s, style = 'medium') {
  if (!s) return '';
  const d = parseDate(s);
  const wd = WD[(d.getDay() + 6) % 7];
  const dd = d.getDate();
  const mm = d.getMonth();
  switch (style) {
    case 'short': return `${pad(dd)}.${pad(mm + 1)}.`;
    case 'numeric': return `${pad(dd)}.${pad(mm + 1)}.${d.getFullYear()}`;
    case 'long': return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${dd}. ${MONTHS[mm]}`;
    case 'full': return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${dd}. ${MONTHS[mm]} ${d.getFullYear()}`;
    case 'day': return `${dd}. ${MONTHS[mm]} ${d.getFullYear()}`;
    case 'dm': return `${dd}. ${MONTHS_SHORT[mm]}`;
    default: return `${wd}, ${dd}. ${MONTHS_SHORT[mm]}`;
  }
}

/** 'Heute', 'Morgen', 'in 3 Tagen', 'vor 2 Tagen' … */
export function relDay(s, base = today()) {
  const n = diffDays(base, s);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === 2) return 'Übermorgen';
  if (n === -1) return 'Gestern';
  if (n === -2) return 'Vorgestern';
  if (n > 0 && n < 7) return WEEKDAYS[weekday(s)];
  if (n > 0) return `in ${n} Tagen`;
  return `vor ${-n} Tagen`;
}

export function relDayShort(s, base = today()) {
  const n = diffDays(base, s);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === -1) return 'Gestern';
  if (n > 1 && n < 7) return WD[weekday(s)];
  return fmtDate(s, 'dm');
}

/** Zeitspanne bis zu einem Zeitpunkt in Minuten hübsch: 'in 25 Min', 'in 2 Std 5 Min' */
export function fmtIn(minutes) {
  if (minutes <= 0) return 'jetzt';
  if (minutes < 60) return `in ${minutes} Min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `in ${h} Std ${m} Min` : `in ${h} Std`;
}

export function greeting(d = nowDate()) {
  const h = d.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 14) return 'Mahlzeit';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

/** Liste aller Tage von a bis b (inklusive). */
export function dateRange(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ICS/Date-Helfer: lokales Date → 'YYYYMMDDTHHMMSS' */
export function icsLocal(dateStr, time) {
  return dateStr.replaceAll('-', '') + 'T' + (time ? time.replace(':', '') + '00' : '000000');
}
