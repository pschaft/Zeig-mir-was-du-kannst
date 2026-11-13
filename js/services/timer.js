// Fokus-Timer als App-weiter Dienst: läuft weiter, auch wenn man die Seite wechselt
// oder die App schließt (Endzeitpunkt wird gespeichert).
import { store } from '../core/store.js';
import { chime } from '../core/audio.js';
import { confetti } from '../core/confetti.js';
import { toast } from '../core/ui.js';
import { vibrate, uid } from '../core/util.js';
import { modeMinutes, MODES } from '../logic/focus.js';
import { notify } from './notify.js';

const listeners = new Set();
let interval = null;
let wakeLock = null;

export function remainingMs(t = store.state.focus.timer, s = store.state.focus.settings) {
  if (t.status === 'running') return Math.max(0, t.endsAt - Date.now());
  if (t.status === 'paused') return t.remaining ?? modeMinutes(s, t.mode) * 60000;
  return modeMinutes(s, t.mode) * 60000;
}

export function totalMs(t = store.state.focus.timer, s = store.state.focus.settings) {
  return (t.total ?? modeMinutes(s, t.mode)) * 60000;
}

export function onTick(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function requestWakeLock() {
  try {
    if (store.state.focus.settings.wakeLock && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* nicht verfügbar */ }
}
function releaseWakeLock() { try { wakeLock?.release(); } catch { /* */ } wakeLock = null; }

export const timer = {
  start(opts = {}) {
    store.update((s) => {
      const t = s.focus.timer;
      if (opts.mode && opts.mode !== t.mode) { t.mode = opts.mode; t.status = 'idle'; }
      if (opts.label != null) t.label = opts.label;
      if (opts.courseId != null) t.courseId = opts.courseId;
      const ms = t.status === 'paused' ? (t.remaining ?? modeMinutes(s.focus.settings, t.mode) * 60000) : modeMinutes(s.focus.settings, t.mode) * 60000;
      if (t.status !== 'paused') { t.startedAt = Date.now(); t.total = modeMinutes(s.focus.settings, t.mode); }
      t.endsAt = Date.now() + ms;
      t.status = 'running';
      t.remaining = null;
    });
    requestWakeLock();
    ensureLoop();
  },
  pause() {
    store.update((s) => {
      const t = s.focus.timer;
      if (t.status !== 'running') return;
      t.remaining = Math.max(0, t.endsAt - Date.now());
      t.status = 'paused';
      t.endsAt = null;
    });
    releaseWakeLock();
  },
  toggle() {
    const t = store.state.focus.timer;
    if (t.status === 'running') this.pause(); else this.start();
  },
  reset() {
    store.update((s) => {
      const t = s.focus.timer;
      Object.assign(t, { status: 'idle', endsAt: null, remaining: null, startedAt: null, total: null });
    });
    releaseWakeLock();
  },
  setMode(mode) {
    store.update((s) => {
      Object.assign(s.focus.timer, { mode, status: 'idle', endsAt: null, remaining: null, startedAt: null, total: null });
    });
  },
  /** Aktuelle Phase vorzeitig abschließen. Bei Fokus zählt die bisher gearbeitete Zeit (ab 1 Min). */
  skip() {
    const t = store.state.focus.timer;
    if (t.mode === 'work' && t.status !== 'idle') {
      const worked = Math.round((totalMs() - remainingMs()) / 60000);
      complete({ partialMinutes: worked });
    } else {
      complete({ silent: true });
    }
  },
  setLabel(label, courseId) {
    store.update((s) => {
      s.focus.timer.label = label ?? s.focus.timer.label;
      if (courseId != null) s.focus.timer.courseId = courseId;
    });
  },
};

function logSession(s, minutes) {
  const t = s.focus.timer;
  s.focus.sessions.push({
    id: uid('f'), start: t.startedAt ?? Date.now() - minutes * 60000, minutes,
    courseId: t.courseId || '', label: t.label || '',
  });
}

function complete({ partialMinutes = null, silent = false } = {}) {
  let finishedMode = null;
  let autoStart = false;
  let goalReached = false;
  store.update((s) => {
    const t = s.focus.timer;
    const set = s.focus.settings;
    finishedMode = t.mode;
    if (t.mode === 'work') {
      const minutes = partialMinutes ?? (t.total ?? set.work);
      if (minutes >= 1) {
        const before = todayMinutes(s);
        logSession(s, minutes);
        const after = before + minutes;
        goalReached = before < set.dailyGoal && after >= set.dailyGoal;
      }
      if (partialMinutes == null || partialMinutes >= set.work * 0.8) t.cycle = (t.cycle || 0) + 1;
      t.mode = t.cycle % set.longEvery === 0 ? 'long' : 'short';
      autoStart = set.autoBreak;
    } else {
      t.mode = 'work';
      autoStart = set.autoWork;
    }
    Object.assign(t, { status: 'idle', endsAt: null, remaining: null, startedAt: null, total: null });
  });
  releaseWakeLock();
  if (!silent) {
    const st = store.state;
    if (st.settings.sound) chime(finishedMode === 'work' ? 'done' : 'break');
    if (st.settings.haptics) vibrate([180, 80, 180]);
    const msg = finishedMode === 'work' ? 'Fokus-Session geschafft! Zeit für eine Pause ☕' : 'Pause vorbei – weiter geht’s 💪';
    notify(finishedMode === 'work' ? 'Fokus geschafft 🎉' : 'Pause vorbei', msg);
    toast(msg, { type: 'success', iconName: finishedMode === 'work' ? 'check' : 'zap' });
    if (finishedMode === 'work') confetti({ count: goalReached ? 220 : 90 });
    if (goalReached) setTimeout(() => toast('Tagesziel erreicht! 🏆', { type: 'success', iconName: 'trophy' }), 900);
  }
  if (autoStart && !silent) setTimeout(() => timer.start(), 600);
}

function todayMinutes(s) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return s.focus.sessions.filter((x) => x.start >= start).reduce((a, x) => a + x.minutes, 0);
}

function loop() {
  const t = store.state.focus.timer;
  if (t.status === 'running' && Date.now() >= t.endsAt) complete();
  const ms = remainingMs();
  for (const fn of listeners) {
    try { fn(ms, store.state.focus.timer); } catch (e) { console.error(e); }
  }
  if (store.state.focus.timer.status !== 'running') stopLoop();
}

function ensureLoop() {
  if (!interval) interval = setInterval(loop, 250);
  loop();
}
function stopLoop() {
  clearInterval(interval);
  interval = null;
}

export function initTimer() {
  if (store.state.focus.timer.status === 'running') ensureLoop();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && store.state.focus.timer.status === 'running') { requestWakeLock(); ensureLoop(); }
  });
  store.subscribe((s) => { if (s.focus.timer.status === 'running') ensureLoop(); });
}

export { MODES };
