// Zahlen, Geld, Noten, Dauer – alles im deutschen Format.

const moneyFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const moneyFmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Cent → '12,50 €' */
export function fmtMoney(cents, { sign = false, round = false } = {}) {
  const v = (cents || 0) / 100;
  const s = (round ? moneyFmt0 : moneyFmt).format(Math.abs(v));
  if (v < 0) return '−' + s;
  if (sign && v > 0) return '+' + s;
  return s;
}

/** '12,50' | '12.5' | '1.234,56' | '1234' → Cent (Integer) oder null */
export function parseMoney(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/[€\s]/g, '').replace('−', '-');
  if (!s) return null;
  const neg = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')) s = parts.join('');
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;
  const v = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

/** Cent → '12,50' (für Eingabefelder) */
export function moneyInput(cents) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function fmtNum(n, digits = 0) {
  return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 1.7 → '1,7'; 1.666 → '1,67' (digits=2) */
export function fmtGrade(g, digits = 1) {
  if (g == null || !Number.isFinite(g)) return '–';
  return g.toFixed(digits).replace('.', ',');
}

/** Minuten → '1 Std 25 Min' / '25 Min' */
export function fmtMinutes(min, compact = false) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (compact) {
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (!h) return `${m} Min`;
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}

/** Minuten → '1,5 h' */
export function fmtHours(min, digits = 1) {
  const h = (min || 0) / 60;
  return `${fmtNum(h, Number.isInteger(h) ? 0 : digits)} h`;
}

/** mm:ss */
export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Intervall in Tagen (Bruchteile möglich) → '10 Min', '1 T', '3 Mon' */
export function fmtInterval(days) {
  const mins = days * 1440;
  if (mins < 60) return `${Math.max(1, Math.round(mins))} Min`;
  if (mins < 1440) return `${Math.round(mins / 60)} Std`;
  if (days < 30) return `${Math.round(days)} T`;
  if (days < 365) return `${fmtNum(days / 30, days < 60 ? 1 : 0)} Mon`;
  return `${fmtNum(days / 365, 1)} J`;
}

export function plural(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)[0] : (parts[0]?.[1] ?? ''))).toUpperCase();
}
