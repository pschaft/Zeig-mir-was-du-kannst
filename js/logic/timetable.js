// Stundenplan-Logik: Termine pro Tag, nächste Veranstaltung, Vorlesungswochen.
import { weekday, isoWeek, diffDays, startOfWeek, addDays, timeToMin, today, nowDate, tsToDate } from '../core/date.js';

export const WEEKS_LABEL = { all: 'Jede Woche', odd: 'Ungerade KW', even: 'Gerade KW' };

export function courseMap(state) {
  return new Map(state.courses.map((c) => [c.id, c]));
}

export function inLecturePeriod(sem, date) {
  if (!sem?.lectureStart || !sem?.lectureEnd) return true;
  return date >= sem.lectureStart && date <= sem.lectureEnd;
}

export function breakOn(sem, date) {
  return (sem?.breaks ?? []).find((b) => b.start && b.end && date >= b.start && date <= b.end) ?? null;
}

export function sessionOccursOn(s, date, sem) {
  if (s.weekday !== weekday(date)) return false;
  const kw = isoWeek(date);
  if (s.weeks === 'odd' && kw % 2 === 0) return false;
  if (s.weeks === 'even' && kw % 2 === 1) return false;
  if (s.from && date < s.from) return false;
  if (s.until && date > s.until) return false;
  if (!inLecturePeriod(sem, date)) return false;
  if (breakOn(sem, date)) return false;
  return true;
}

/**
 * Alle Termine eines Tages (Lehrveranstaltungen + Einzeltermine), sortiert.
 * Einträge: { kind, id, title, start, end, room, color, courseId, type, cancelled, ref }
 */
export function agendaFor(state, date) {
  const cm = courseMap(state);
  const items = [];
  for (const s of state.sessions) {
    if (!sessionOccursOn(s, date, state.semester)) continue;
    const c = cm.get(s.courseId);
    items.push({
      kind: 'session', id: s.id, date,
      title: c?.name ?? s.title ?? 'Veranstaltung', short: c?.short,
      start: s.start, end: s.end, room: s.room || '', color: c?.color ?? '#687076',
      courseId: s.courseId, type: s.type, cancelled: (s.cancelled ?? []).includes(date), ref: s,
    });
  }
  for (const e of state.events) {
    if (e.date !== date) continue;
    const c = cm.get(e.courseId);
    items.push({
      kind: e.kind === 'exam' ? 'exam' : 'event', id: e.id, date,
      title: e.title || c?.name || 'Termin', short: c?.short,
      start: e.start || '', end: e.end || '', room: e.room || '', color: e.color ?? c?.color ?? (e.kind === 'exam' ? '#e5484d' : '#0b84e3'),
      courseId: e.courseId, type: e.kind === 'exam' ? 'Prüfung' : 'Termin', cancelled: false, ref: e,
    });
  }
  items.sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00') || (a.end || '').localeCompare(b.end || ''));
  return items;
}

/** Aktuelle und nächste Veranstaltung (sucht bis zu 5 Wochen voraus). */
export function nextUp(state, at = nowDate()) {
  const base = tsToDate(at.getTime());
  const mins = at.getHours() * 60 + at.getMinutes();
  let current = null, next = null;
  for (let d = 0; d < 36 && !next; d++) {
    const date = addDays(base, d);
    for (const it of agendaFor(state, date)) {
      if (it.cancelled || !it.start) continue;
      const s = timeToMin(it.start), e = timeToMin(it.end || it.start) || s + 90;
      if (d === 0 && s <= mins && mins < e) { current ??= { ...it, minutesLeft: e - mins }; continue; }
      if (d === 0 && s <= mins) continue;
      next = { ...it, inMinutes: d * 1440 + s - mins, dayOffset: d };
      break;
    }
  }
  return { current, next };
}

/** Vorlesungswoche { week, total } oder null außerhalb der Vorlesungszeit. */
export function lectureWeek(sem, date = today()) {
  if (!sem?.lectureStart || !sem?.lectureEnd) return null;
  const s = startOfWeek(sem.lectureStart);
  const total = Math.floor(diffDays(s, startOfWeek(sem.lectureEnd)) / 7) + 1;
  if (date < sem.lectureStart || date > sem.lectureEnd) return { week: null, total };
  return { week: Math.floor(diffDays(s, startOfWeek(date)) / 7) + 1, total };
}

/** Semesterfortschritt 0..1 bezogen auf die Vorlesungszeit. */
export function semesterProgress(sem, date = today()) {
  const a = sem?.lectureStart || sem?.start, b = sem?.lectureEnd || sem?.end;
  if (!a || !b) return null;
  const total = diffDays(a, b);
  if (total <= 0) return null;
  return Math.max(0, Math.min(1, diffDays(a, date) / total));
}

/** Kommende Prüfungen (sortiert). */
export function upcomingExams(state, base = today(), limit = 99) {
  return state.events
    .filter((e) => e.kind === 'exam' && e.date >= base)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''))
    .slice(0, limit);
}

/** Wochenstunden (SWS-ähnlich) pro Woche in Minuten. */
export function weeklyMinutes(state) {
  return state.sessions.reduce((sum, s) => {
    const m = (timeToMin(s.end) - timeToMin(s.start)) || 0;
    return sum + (s.weeks === 'all' || !s.weeks ? m : m / 2);
  }, 0);
}
