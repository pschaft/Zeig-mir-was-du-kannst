// Gewohnheiten: Serien, Quoten, Heatmap-Daten.
import { weekday, addDays, startOfWeek, today, tsToDate, diffDays } from '../core/date.js';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function created(h) { return h.createdDate ?? (h.createdAt ? tsToDate(h.createdAt) : '2000-01-01'); }

export function isScheduled(h, date) {
  return (h.days?.length ? h.days : ALL_DAYS).includes(weekday(date));
}

export function isDone(h, date) { return !!h.log?.[date]; }

export function currentStreak(h, base = today()) {
  let d = base;
  if (isScheduled(h, d) && !isDone(h, d)) d = addDays(d, -1);
  const start = created(h);
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    if (d < start && !isDone(h, d)) break;
    if (isScheduled(h, d)) {
      if (isDone(h, d)) n++;
      else break;
    }
    d = addDays(d, -1);
  }
  return n;
}

export function bestStreak(h, base = today()) {
  const dates = Object.keys(h.log ?? {}).filter((d) => h.log[d]).sort();
  const first = dates[0] && dates[0] < created(h) ? dates[0] : created(h);
  let best = 0, cur = 0;
  const span = Math.min(diffDays(first, base), 1500);
  for (let i = 0; i <= span; i++) {
    const d = addDays(first, i);
    if (!isScheduled(h, d)) continue;
    if (isDone(h, d)) { cur++; best = Math.max(best, cur); }
    else if (d !== base) cur = 0;
  }
  return best;
}

/** Erfüllungsquote der letzten n Tage (nur geplante Tage seit Erstellung). */
export function completionRate(h, days = 30, base = today()) {
  let planned = 0, done = 0;
  const start = created(h);
  for (let i = 0; i < days; i++) {
    const d = addDays(base, -i);
    if (d < start) break;
    if (!isScheduled(h, d)) continue;
    if (d === base && !isDone(h, d)) continue; // heute noch offen
    planned++;
    if (isDone(h, d)) done++;
  }
  return planned ? done / planned : null;
}

export function heatmapDays(h, weeks = 16, base = today()) {
  const start = addDays(startOfWeek(base), -(weeks - 1) * 7);
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const future = d > base;
    out.push({
      date: d,
      level: isDone(h, d) ? 4 : 0,
      off: future || !isScheduled(h, d),
      today: d === base,
      title: `${d.split('-').reverse().join('.')}${isDone(h, d) ? ' ✓' : ''}`,
    });
  }
  return out;
}

/** Wie viele der heute geplanten Gewohnheiten sind erledigt? */
export function todayProgress(habits, base = today()) {
  const planned = habits.filter((h) => !h.archived && isScheduled(h, base));
  return { planned: planned.length, done: planned.filter((h) => isDone(h, base)).length };
}
