// Gewohnheiten: tägliche Routinen mit Serien und Heatmap.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { heatmap } from '../core/charts.js';
import { form, toast } from '../core/ui.js';
import { uid, vibrate } from '../core/util.js';
import { today, addDays, WD, weekday, fmtDate, parseDate } from '../core/date.js';
import { plural } from '../core/format.js';
import { confetti } from '../core/confetti.js';
import { removeWithUndo } from '../core/undo.js';
import { isScheduled, isDone, currentStreak, bestStreak, completionRate, heatmapDays, todayProgress, ALL_DAYS } from '../logic/habits.js';
import { COURSE_COLORS } from '../logic/state.js';

const SUGGESTIONS = [
  ['🏃', 'Sport'], ['💧', '2 Liter Wasser'], ['📖', '30 Min lesen'], ['🧘', 'Meditieren'], ['🗣️', 'Vokabeln'],
  ['😴', 'Vor 0 Uhr ins Bett'], ['📵', 'Kein Handy nach 22 Uhr'], ['🥗', 'Gesund essen'], ['🚶', '10.000 Schritte'], ['✍️', 'Tagebuch'],
];
const MILESTONES = [7, 14, 21, 30, 50, 100, 365];

export function toggleHabit(id, date = today()) {
  let nowDone = false, streakNow = 0, allDone = false;
  store.update((s) => {
    const h = s.habits.find((x) => x.id === id);
    if (!h) return;
    h.log ??= {};
    if (h.log[date]) delete h.log[date]; else h.log[date] = 1;
    nowDone = !!h.log[date];
    streakNow = currentStreak(h);
    const p = todayProgress(s.habits);
    allDone = date === today() && p.planned > 1 && p.done === p.planned;
  });
  if (!nowDone) return;
  if (store.state.settings.haptics) vibrate(15);
  if (date === today() && MILESTONES.includes(streakNow)) {
    confetti({ count: 180 });
    toast(`${streakNow} Tage in Folge! 🔥`, { type: 'success', iconName: 'fire' });
  } else if (allDone) {
    confetti({ count: 100 });
    toast('Alle Gewohnheiten für heute geschafft! 🌟', { type: 'success', iconName: 'star' });
  }
}

async function habitForm(id, preset = {}) {
  const s = store.state;
  const h = id ? s.habits.find((x) => x.id === id) : null;
  const v = await form({
    title: h ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit',
    fields: [
      !h && { type: 'html', html: html`<div class="toggle-grid" data-suggest>${SUGGESTIONS.map(([e, n]) => html`<button type="button" class="chip sm" data-e="${e}" data-n="${n}">${e} ${n}</button>`)}</div>` },
      { type: 'row', fields: [
        { name: 'emoji', label: 'Emoji', value: h?.emoji ?? preset.emoji ?? '✨', maxlength: 4, required: true },
        { name: 'name', label: 'Name', value: h?.name ?? preset.name ?? '', required: true, placeholder: 'z. B. Sport, Lesen, Wasser trinken' },
      ] },
      { name: 'days', label: 'An welchen Tagen?', type: 'weekdays', value: h?.days ?? ALL_DAYS, required: true },
      { name: 'color', label: 'Farbe', type: 'color', value: h?.color ?? COURSE_COLORS[(s.habits.length * 3 + 2) % COURSE_COLORS.length] },
      h && { name: 'archived', label: 'Archivieren (pausieren, Verlauf bleibt)', type: 'switch', value: !!h.archived },
    ].filter(Boolean),
    danger: h ? 'Löschen' : null,
    submitLabel: h ? 'Speichern' : 'Hinzufügen',
    onMount: (el, formEl) => {
      el.querySelectorAll('[data-suggest] button').forEach((b) => b.addEventListener('click', () => {
        formEl.elements.emoji.value = b.dataset.e;
        formEl.elements.name.value = b.dataset.n;
      }));
    },
  });
  if (v === 'delete') return removeWithUndo((st) => st.habits, id, 'Gewohnheit gelöscht');
  if (!v) return;
  store.update((st) => {
    if (h) Object.assign(st.habits.find((x) => x.id === id), { emoji: v.emoji, name: v.name, days: v.days, color: v.color, archived: v.archived });
    else st.habits.push({ id: uid('h'), emoji: v.emoji, name: v.name, days: v.days, color: v.color, log: {}, createdDate: today(), createdAt: Date.now() });
  });
  toast(h ? 'Gespeichert' : 'Los geht’s – jeden Tag ein bisschen! 💪', { type: 'success' });
}

function scheduleLabel(days) {
  if (!days?.length || days.length === 7) return 'täglich';
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) return 'werktags';
  return days.map((d) => WD[d]).join(', ');
}

export default {
  title: 'Gewohnheiten',
  render({ state, ui }) {
    const d = today();
    const active = state.habits.filter((h) => !h.archived);
    const archived = state.habits.filter((h) => h.archived);
    const p = todayProgress(state.habits);
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));
    return html`
      <header class="page-head">
        <div class="titles"><h1>Gewohnheiten</h1><p class="page-sub">${p.planned ? `${p.done} von ${p.planned} heute erledigt` : 'Kleine Routinen, große Wirkung'}</p></div>
        <div class="page-actions"><button class="btn btn-primary" data-action="new-habit">${icon('plus')}<span class="hide-mobile">Gewohnheit</span></button></div>
      </header>
      ${!active.length ? html`<div class="card"><div class="empty">
        <div class="empty-icon">🔥</div><h3>Jeden Tag 1 % besser</h3>
        <p>Leg Routinen an – Sport, Lesen, früh schlafen – und hake sie täglich ab. Serien motivieren erstaunlich gut.</p>
        <button class="btn btn-primary" data-action="new-habit">${icon('plus')} Erste Gewohnheit</button>
      </div></div>` : html`
      ${p.planned ? html`<div class="progress lg mb-16" style="--c:var(--success)"><div class="progress-bar" style="width:${(p.done / p.planned) * 100}%"></div></div>` : ''}
      <div class="grid grid-2">${active.map((h) => {
        const st = currentStreak(h, d);
        const best = bestStreak(h, d);
        const rate = completionRate(h, 30, d);
        const scheduled = isScheduled(h, d);
        return html`<section class="card" style="--c:${h.color}" data-key="${h.id}">
          <div class="habit-head">
            <span class="habit-emoji">${h.emoji}</span>
            <div style="flex:1;min-width:0"><h3 class="truncate">${h.name}</h3><div class="tiny muted">${scheduleLabel(h.days)}${st ? ` · 🔥 ${plural(st, 'Tag', 'Tage')}` : ''}</div></div>
            <button class="habit-toggle ${isDone(h, d) ? 'done' : ''}" data-action="toggle-habit" data-id="${h.id}" data-date="${d}" ${scheduled ? '' : 'disabled'} aria-label="${h.name} heute erledigt" title="${scheduled ? 'Heute erledigt?' : 'Heute nicht geplant'}">${icon('check')}</button>
          </div>
          <div class="week-strip mt-16">${week.map((day) => {
            const sch = isScheduled(h, day), dn = isDone(h, day);
            return html`<button data-action="toggle-habit" data-id="${h.id}" data-date="${day}" class="${day === d ? 'today' : ''}" title="${fmtDate(day)}">
              <span class="ws-dot ${dn ? 'on' : ''} ${!sch && !dn ? 'off' : ''}">${dn ? icon('check') : parseDate(day).getDate()}</span>${WD[weekday(day)]}
            </button>`;
          })}</div>
          <div class="mt-16">${heatmap({ days: heatmapDays(h, 16, d), color: h.color })}</div>
          <div class="row-between tiny muted mt-12">
            <span>Beste Serie: <b>${best}</b></span><span>30 Tage: <b>${rate == null ? '–' : Math.round(rate * 100) + ' %'}</b></span>
            <button class="btn btn-xs btn-ghost" data-action="edit-habit" data-id="${h.id}">${icon('edit')} Bearbeiten</button>
          </div>
        </section>`;
      })}</div>`}
      ${archived.length ? html`<div class="li-group">Archiviert <span class="count">${archived.length}</span></div>
        <div class="card flush"><div class="list">${archived.map((h) => html`<div class="li li-clickable" data-action="edit-habit" data-id="${h.id}"><span class="habit-emoji" style="--c:${h.color};width:36px;height:36px;font-size:18px">${h.emoji}</span><div class="li-main"><div class="li-title">${h.name}</div><div class="li-sub">Beste Serie ${bestStreak(h, d)}</div></div></div>`)}</div></div>` : ''}`;
  },
  actions: {
    'new-habit': () => habitForm(null),
    'edit-habit': (c, el) => habitForm(el.dataset.id),
  },
};
