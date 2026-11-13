// Fokus-/Pomodoro-Auswertungen.
import { tsToDate, addDays, today, diffDays } from '../core/date.js';

export const MODES = {
  work: { label: 'Fokus', key: 'work' },
  short: { label: 'Kurze Pause', key: 'short' },
  long: { label: 'Lange Pause', key: 'long' },
};

export function modeMinutes(settings, mode) {
  return mode === 'work' ? settings.work : mode === 'short' ? settings.short : settings.long;
}

export function minutesOn(sessions, date) {
  let m = 0;
  for (const s of sessions) if (tsToDate(s.start) === date) m += s.minutes;
  return m;
}

/** Minuten pro Tag für die letzten n Tage (älteste zuerst). */
export function lastDays(sessions, n = 7, base = today()) {
  const map = new Map();
  for (const s of sessions) {
    const d = tsToDate(s.start);
    map.set(d, (map.get(d) ?? 0) + s.minutes);
  }
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(base, -i);
    out.push({ date: d, minutes: map.get(d) ?? 0 });
  }
  return out;
}

/** Tage in Folge mit mindestens einer Fokus-Session (heute zählt, muss aber nicht schon erledigt sein). */
export function streak(sessions, base = today()) {
  const days = new Set(sessions.map((s) => tsToDate(s.start)));
  let d = days.has(base) ? base : addDays(base, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function byCourse(sessions, from, to = today()) {
  const m = new Map();
  for (const s of sessions) {
    const d = tsToDate(s.start);
    if (d < from || d > to) continue;
    const k = s.courseId || '';
    m.set(k, (m.get(k) ?? 0) + s.minutes);
  }
  return m;
}

export function totalMinutes(sessions, from, to = today()) {
  let m = 0;
  for (const s of sessions) {
    const d = tsToDate(s.start);
    if (d >= from && d <= to) m += s.minutes;
  }
  return m;
}

export function bestDay(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const d = tsToDate(s.start);
    map.set(d, (map.get(d) ?? 0) + s.minutes);
  }
  let best = null;
  for (const [date, minutes] of map) if (!best || minutes > best.minutes) best = { date, minutes };
  return best;
}

export function daysSince(ts, base = today()) {
  return diffDays(tsToDate(ts), base);
}
