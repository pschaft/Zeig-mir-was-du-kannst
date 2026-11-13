// Fokus: Pomodoro-Timer, Hintergrundgeräusche, Statistiken, Zen-Modus.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { bars, ring, heatmap } from '../core/charts.js';
import { form, toast } from '../core/ui.js';
import { uid, sortBy } from '../core/util.js';
import { today, addDays, startOfWeek, WD, weekday, tsToDate, fmtDate, dayStartTs, relDayShort } from '../core/date.js';
import { fmtClock, fmtMinutes, plural } from '../core/format.js';
import { noise, NOISES } from '../core/audio.js';
import { removeWithUndo } from '../core/undo.js';
import { timer, onTick, remainingMs, totalMs } from '../services/timer.js';
import { requestPermission } from '../services/notify.js';
import { MODES, modeMinutes, minutesOn, lastDays, streak, byCourse, totalMinutes, bestDay } from '../logic/focus.js';
import { courseMap } from '../logic/timetable.js';
import { courseOptions } from './tasks.js';

const R = 46;
const CIRC = 2 * Math.PI * R;

function ringOffset(ms, total) {
  return CIRC * (1 - Math.max(0, Math.min(1, total ? ms / total : 1)));
}

async function labelForm() {
  const s = store.state;
  const t = s.focus.timer;
  const open = s.tasks.filter((x) => !x.done).slice(0, 8);
  const v = await form({
    title: 'Woran arbeitest du?',
    fields: [
      { name: 'label', label: 'Thema / Aufgabe', value: t.label, placeholder: 'z. B. Übungsblatt 5, Kapitel 3 lesen …', autofocus: true, list: open.map((x) => x.title) },
      { name: 'courseId', label: 'Kurs', type: 'select', options: courseOptions(s, 'Ohne Kurs'), value: t.courseId },
    ],
    submitLabel: 'Übernehmen',
  });
  if (!v) return;
  const task = open.find((x) => x.title === v.label);
  timer.setLabel(v.label, v.courseId || task?.courseId || '');
}

async function settingsForm() {
  const s = store.state;
  const f = s.focus.settings;
  const v = await form({
    title: 'Timer-Einstellungen',
    fields: [
      { type: 'row', fields: [
        { name: 'work', label: 'Fokus (Min)', type: 'number', integer: true, min: 1, max: 180, value: f.work, required: true },
        { name: 'short', label: 'Kurze Pause', type: 'number', integer: true, min: 1, max: 60, value: f.short, required: true },
        { name: 'long', label: 'Lange Pause', type: 'number', integer: true, min: 1, max: 90, value: f.long, required: true },
      ] },
      { name: 'longEvery', label: 'Lange Pause nach … Fokus-Sessions', type: 'segmented', options: [2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), value: f.longEvery },
      { name: 'dailyGoal', label: 'Tagesziel', type: 'range', min: 15, max: 480, step: 15, value: f.dailyGoal, suffix: 'Min' },
      { name: 'autoBreak', label: 'Pausen automatisch starten', type: 'switch', value: f.autoBreak },
      { name: 'autoWork', label: 'Nach der Pause automatisch weiter', type: 'switch', value: f.autoWork },
      { name: 'wakeLock', label: 'Bildschirm anlassen, solange der Timer läuft', type: 'switch', value: f.wakeLock },
      { name: 'sound', label: 'Gong am Ende', type: 'switch', value: s.settings.sound },
      { type: 'html', html: html`<button type="button" class="btn btn-soft btn-sm" data-notif>${icon('bell')} Benachrichtigungen erlauben</button><div class="hint mt-4">Damit du den Gong auch mitbekommst, wenn Unikram im Hintergrund ist.</div>` },
    ],
    onMount: (el) => el.querySelector('[data-notif]')?.addEventListener('click', async () => {
      const r = await requestPermission();
      toast(r === 'granted' ? 'Benachrichtigungen aktiviert' : r === 'unsupported' ? 'Dein Browser unterstützt keine Benachrichtigungen' : 'Benachrichtigungen wurden nicht erlaubt', { type: r === 'granted' ? 'success' : 'error' });
    }),
  });
  if (!v) return;
  store.update((st) => {
    Object.assign(st.focus.settings, { work: v.work, short: v.short, long: v.long, longEvery: Number(v.longEvery), dailyGoal: v.dailyGoal, autoBreak: v.autoBreak, autoWork: v.autoWork, wakeLock: v.wakeLock });
    st.settings.sound = v.sound;
  });
  toast('Gespeichert', { type: 'success' });
}

async function logForm() {
  const s = store.state;
  const v = await form({
    title: 'Lernzeit nachtragen',
    intro: 'Für Sessions ohne Timer – z. B. in der Bib oder in der Lerngruppe.',
    fields: [
      { type: 'row', fields: [
        { name: 'date', label: 'Datum', type: 'date', value: today(), required: true },
        { name: 'minutes', label: 'Minuten', type: 'number', integer: true, min: 1, max: 720, value: 60, required: true },
      ] },
      { name: 'courseId', label: 'Kurs', type: 'select', options: courseOptions(s, 'Ohne Kurs'), value: '' },
      { name: 'label', label: 'Thema', placeholder: 'optional' },
    ],
    submitLabel: 'Eintragen',
  });
  if (!v) return;
  store.update((st) => st.focus.sessions.push({ id: uid('f'), start: dayStartTs(v.date) + 12 * 3600000, minutes: v.minutes, courseId: v.courseId, label: v.label, manual: true }));
  toast(`${fmtMinutes(v.minutes)} eingetragen`, { type: 'success' });
}

function timerCard(state, zen) {
  const t = state.focus.timer;
  const set = state.focus.settings;
  const ms = remainingMs();
  const total = t.status === 'idle' ? modeMinutes(set, t.mode) * 60000 : totalMs();
  const c = courseMap(state).get(t.courseId);
  const running = t.status === 'running';
  const cyclePos = (t.cycle || 0) % set.longEvery;
  return html`<section class="card timer-card ${zen ? 'focus-zen' : ''}">
    <div class="seg timer-modes" role="tablist">
      ${Object.values(MODES).map((m) => html`<button class="${t.mode === m.key ? 'active' : ''}" data-action="mode" data-m="${m.key}" role="tab">${m.label}</button>`)}
    </div>
    <div class="timer-wrap" style="--c:${t.mode === 'work' ? (c?.color ?? 'var(--accent)') : 'var(--success)'}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" r="${R}" fill="none"/>
        <circle class="ring-val" data-timer-ring cx="50" cy="50" r="${R}" fill="none" stroke-dasharray="${CIRC}" stroke-dashoffset="${ringOffset(ms, total)}"/>
      </svg>
      <div class="timer-center">
        <div class="timer-time" data-timer-big aria-live="off">${fmtClock(ms)}</div>
        <button class="btn btn-xs btn-ghost timer-label" data-action="label" title="Thema ändern">${t.mode === 'work' ? (t.label || c?.name || 'Woran arbeitest du?') : t.mode === 'short' ? 'Kurz durchatmen ☕' : 'Lange Pause 🌿'} ${icon('edit', 'xs')}</button>
        <div class="cycle-dots" title="Fokus-Sessions bis zur langen Pause">${Array.from({ length: set.longEvery }, (_, i) => html`<i class="${i < cyclePos ? 'on' : ''}"></i>`)}</div>
      </div>
    </div>
    <div class="timer-controls">
      <button class="icon-btn filled" data-action="reset" aria-label="Zurücksetzen" title="Zurücksetzen (R)">${icon('reset')}</button>
      <button class="btn btn-primary timer-main-btn" data-action="toggle" aria-label="${running ? 'Pause' : 'Start'}" title="Start/Pause (Leertaste)">${icon(running ? 'pause' : 'play')}</button>
      <button class="icon-btn filled" data-action="skip" aria-label="Überspringen" title="Phase beenden (S)">${icon('skip')}</button>
    </div>
    ${zen ? html`<button class="btn btn-ghost btn-sm mt-16" data-action="zen">${icon('minimize')} Zen-Modus verlassen</button>` : ''}
  </section>`;
}

function noiseCard(state) {
  const active = noise.type;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('headphones')} Hintergrundgeräusche</span>${active ? html`<span class="badge badge-accent">läuft</span>` : ''}</div>
    <div class="noise-grid">${NOISES.map((n) => html`<button class="noise-btn ${active === n.id ? 'active' : ''}" data-action="noise" data-n="${n.id}" title="${n.name}">${icon(n.icon)}${n.short}</button>`)}</div>
    <div class="row mt-12">${icon(active ? 'volume' : 'volumeOff', 'sm')}<input type="range" min="0" max="1" step="0.02" value="${state.focus.noise.volume}" data-input="noise-vol" data-change="noise-vol-save" aria-label="Lautstärke"></div>
    <p class="tiny muted mt-8">Live im Browser erzeugt – kein Download, keine Werbung. Läuft weiter, wenn du die Seite wechselst.</p>
  </section>`;
}

function statsCard(state) {
  const sessions = state.focus.sessions;
  const goal = state.focus.settings.dailyGoal;
  const d = today();
  const week = lastDays(sessions, 7);
  const wkStart = startOfWeek(d);
  const thisWeek = totalMinutes(sessions, wkStart);
  const st = streak(sessions);
  const best = bestDay(sessions);
  const cm = courseMap(state);
  const per = sortBy([...byCourse(sessions, addDays(d, -29)).entries()], ([, m]) => -m).slice(0, 6);
  const maxPer = per[0]?.[1] ?? 1;
  const todayMin = minutesOn(sessions, d);
  const hmStart = addDays(startOfWeek(d), -15 * 7);
  const perDay = new Map();
  for (const s of sessions) { const k = tsToDate(s.start); perDay.set(k, (perDay.get(k) ?? 0) + s.minutes); }
  const hmDays = Array.from({ length: 16 * 7 }, (_, i) => {
    const date = addDays(hmStart, i);
    const m = perDay.get(date) ?? 0;
    return { date, level: m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < goal ? 3 : 4, off: date > d, today: date === d, title: `${fmtDate(date)}: ${fmtMinutes(m)}` };
  });
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('trending')} Statistik</span><button class="card-link" data-action="log">${icon('plus')} Nachtragen</button></div>
    <div class="mini-stat mb-16">
      ${ring({ value: todayMin / goal, size: 72, thickness: 8, center: html`<span class="bold num small">${Math.round((todayMin / goal) * 100)}%</span>` })}
      <div class="stats" style="flex:1">
        <div><div class="stat-value sm">${fmtMinutes(todayMin, true)}</div><div class="stat-label">heute</div></div>
        <div><div class="stat-value sm">${fmtMinutes(thisWeek, true)}</div><div class="stat-label">diese Woche</div></div>
        <div><div class="stat-value sm">${st} 🔥</div><div class="stat-label">${st === 1 ? 'Tag' : 'Tage'} in Folge</div></div>
      </div>
    </div>
    ${bars({ data: week.map((x) => ({ label: WD[weekday(x.date)], value: x.minutes, highlight: x.date === d, title: `${fmtDate(x.date)}: ${fmtMinutes(x.minutes)}` })), goal, format: (v) => fmtMinutes(v, true), height: 110 })}
    ${per.length ? html`<div class="section-title">Letzte 30 Tage nach Kurs</div>
      <div class="stack-sm">${per.map(([id, m]) => {
        const c = cm.get(id);
        return html`<div><div class="row-between small"><span class="row"><i class="dot" style="--c:${c?.color ?? 'var(--muted)'}"></i>${c?.name ?? 'Ohne Kurs'}</span><span class="num muted">${fmtMinutes(m, true)}</span></div>
          <div class="progress sm mt-4" style="--c:${c?.color ?? 'var(--muted)'}"><div class="progress-bar" style="width:${(m / maxPer) * 100}%"></div></div></div>`;
      })}</div>` : ''}
    <div class="section-title">Letzte 16 Wochen</div>
    ${heatmap({ days: hmDays })}
    ${best ? html`<p class="tiny muted mt-8">Bester Tag: ${fmtDate(best.date)} mit ${fmtMinutes(best.minutes)} 🏆 · insgesamt ${fmtMinutes(sessions.reduce((a, s) => a + s.minutes, 0))}</p>` : ''}
  </section>`;
}

function historyCard(state) {
  const cm = courseMap(state);
  const recent = sortBy(state.focus.sessions, (s) => -s.start).slice(0, 6);
  if (!recent.length) return '';
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('clock')} Verlauf</span></div>
    <div class="list">${recent.map((s) => {
      const c = cm.get(s.courseId);
      return html`<div class="li" data-key="${s.id}">
        <span class="li-bar" style="--c:${c?.color ?? 'var(--muted)'}"></span>
        <div class="li-main"><div class="li-title">${s.label || c?.name || 'Fokus-Session'}</div>
          <div class="li-sub"><span>${relDayShort(tsToDate(s.start))}${s.manual ? '' : ` · ${new Date(s.start).toTimeString().slice(0, 5)}`}</span><span>${fmtMinutes(s.minutes)}</span>${s.manual ? html`<span>nachgetragen</span>` : ''}</div></div>
        <button class="icon-btn sm danger" data-action="del-session" data-id="${s.id}" aria-label="Löschen">${icon('trash')}</button>
      </div>`;
    })}</div>
  </section>`;
}

export default {
  title: 'Fokus',
  immersive: (c) => !!c.ui.zen,
  render(c) {
    const { state, ui } = c;
    const d = today();
    const m = minutesOn(state.focus.sessions, d);
    if (ui.zen) {
      return html`<div style="min-height:calc(100dvh - 60px);display:grid;place-items:center"><div style="width:min(560px,100%)">${timerCard(state, true)}</div></div>`;
    }
    return html`
      <header class="page-head">
        <div class="titles"><h1>Fokus</h1><p class="page-sub">Heute ${fmtMinutes(m)} · ${plural(state.focus.sessions.filter((s) => tsToDate(s.start) === d).length, 'Session', 'Sessions')}</p></div>
        <div class="page-actions">
          <button class="icon-btn filled" data-action="zen" aria-label="Zen-Modus" title="Zen-Modus (Z)">${icon('maximize')}</button>
          <button class="icon-btn filled" data-action="settings" aria-label="Einstellungen">${icon('settings')}</button>
        </div>
      </header>
      <div class="focus-layout">
        <div class="stack">${timerCard(state, false)}${noiseCard(state)}</div>
        <div class="stack">${statsCard(state)}${historyCard(state)}</div>
      </div>`;
  },
  mount(el) {
    const off = onTick((ms) => {
      const big = el.querySelector('[data-timer-big]');
      if (big) big.textContent = fmtClock(ms);
      el.querySelector('[data-timer-ring]')?.setAttribute('stroke-dashoffset', String(ringOffset(ms, totalMs())));
    });
    return off;
  },
  onKey(e, c) {
    if (e.key === ' ') { e.preventDefault(); timer.toggle(); return true; }
    if (e.key === 'r') { timer.reset(); return true; }
    if (e.key === 's') { timer.skip(); return true; }
    if (e.key === 'z') { c.ui.zen = !c.ui.zen; c.rerender(); return true; }
    if (e.key === 'Escape' && c.ui.zen) { c.ui.zen = false; c.rerender(); return true; }
    return false;
  },
  actions: {
    toggle: () => timer.toggle(),
    reset: () => timer.reset(),
    skip: () => timer.skip(),
    mode: (c, el) => timer.setMode(el.dataset.m),
    label: () => labelForm(),
    settings: () => settingsForm(),
    log: () => logForm(),
    zen: (c) => { c.ui.zen = !c.ui.zen; c.rerender(); },
    noise: (c, el) => {
      const id = el.dataset.n;
      if (noise.type === id) noise.stop();
      else noise.play(id, store.state.focus.noise.volume);
      store.update((s) => { s.focus.noise.type = id; });
      c.rerender();
    },
    'noise-vol': (c, el) => noise.setVolume(Number(el.value)),
    'noise-vol-save': (c, el) => store.update((s) => { s.focus.noise.volume = Number(el.value); }),
    'del-session': (c, el) => removeWithUndo((s) => s.focus.sessions, el.dataset.id, 'Session gelöscht'),
  },
};
