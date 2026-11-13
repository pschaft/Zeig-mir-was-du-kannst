// Vortrags-Timer: riesiger Countdown, der bei knapper Zeit gelb und bei Überziehung rot wird.
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { chime } from '../../core/audio.js';
import { vibrate } from '../../core/util.js';

const T = { minutes: 10, warn: 2, running: false, endsAt: null, remaining: 10 * 60000, warned: false, ended: false };

function fmt(ms) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000) + (neg ? 0 : (Math.abs(ms) % 1000 ? 1 : 0));
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function remaining() { return T.running ? T.endsAt - Date.now() : T.remaining; }
function stateOf(ms) { return ms < 0 ? 'over' : ms <= T.warn * 60000 ? 'warn' : ''; }

function paint(root) {
  const el = root.querySelector('[data-talk]');
  if (!el) return;
  const ms = remaining();
  el.querySelector('[data-talk-time]').textContent = fmt(ms);
  const state = stateOf(ms);
  el.className = `talk-display ${state}`;
  el.querySelector('[data-talk-sub]').textContent = ms < 0 ? 'Zeit überschritten – zum Schluss kommen!' : state === 'warn' ? 'Noch knapp – Fazit vorbereiten' : T.running ? 'Läuft' : ms === T.minutes * 60000 ? 'Bereit' : 'Pausiert';
  if (T.running && state === 'warn' && !T.warned) { T.warned = true; chime('soft', 0.25); vibrate(120); }
  if (T.running && ms < 0 && !T.ended) { T.ended = true; chime('done', 0.3); vibrate([200, 100, 200]); }
}

export default {
  title: 'Vortrags-Timer',
  render() {
    return html`
      <header class="page-head"><div class="titles"><h1>Vortrags-Timer</h1><p class="page-sub">Fürs Referat: Handy aufs Pult legen, Vollbild an, los.</p></div></header>
      <div class="stack">
        <div class="talk-display ${stateOf(remaining())}" data-talk data-morph-skip><div class="talk-time num" data-talk-time>${fmt(remaining())}</div><div class="talk-sub" data-talk-sub>Bereit</div></div>
        <div class="card">
          <div class="field-row">
            <div class="field"><label class="label" for="talk-min">Redezeit (Min)</label><input class="input" id="talk-min" inputmode="numeric" value="${T.minutes}" data-change="talk-set" data-k="minutes"></div>
            <div class="field"><label class="label" for="talk-warn">Warnung bei (Min)</label><input class="input" id="talk-warn" inputmode="numeric" value="${T.warn}" data-change="talk-set" data-k="warn"></div>
          </div>
          <div class="chips mt-12">${[5, 10, 15, 20, 30, 45].map((m) => html`<button class="chip sm" data-action="talk-preset" data-m="${m}">${m} Min</button>`)}</div>
          <div class="row wrap mt-16">
            <button class="btn btn-primary btn-lg" data-action="talk-toggle" style="flex:1">${icon(T.running ? 'pause' : 'play')} ${T.running ? 'Pause' : 'Start'}</button>
            <button class="btn btn-outline btn-lg" data-action="talk-reset" aria-label="Zurücksetzen">${icon('reset')}</button>
            <button class="btn btn-outline btn-lg" data-action="talk-full" aria-label="Vollbild">${icon('maximize')}</button>
          </div>
          <p class="tiny muted mt-12">Tastatur: Leertaste = Start/Pause, R = Reset, F = Vollbild</p>
        </div>
      </div>`;
  },
  mount(el) {
    paint(el);
    const iv = setInterval(() => paint(el), 200);
    return () => clearInterval(iv);
  },
  onKey(e, c) {
    if (e.key === ' ') { e.preventDefault(); this.actions['talk-toggle'](c); return true; }
    if (e.key === 'r') { this.actions['talk-reset'](c); return true; }
    if (e.key === 'f') { this.actions['talk-full'](c); return true; }
    return false;
  },
  actions: {
    'talk-toggle': (c) => {
      if (T.running) { T.remaining = T.endsAt - Date.now(); T.running = false; }
      else { T.endsAt = Date.now() + T.remaining; T.running = true; }
      c.rerender();
    },
    'talk-reset': (c) => { Object.assign(T, { running: false, endsAt: null, remaining: T.minutes * 60000, warned: false, ended: false }); c.rerender(); },
    'talk-set': (c, el) => {
      const n = Math.max(0, parseFloat(el.value.replace(',', '.')) || 0);
      T[el.dataset.k] = n;
      if (!T.running) Object.assign(T, { remaining: T.minutes * 60000, warned: false, ended: false });
      c.rerender();
    },
    'talk-preset': (c, el) => { T.minutes = Number(el.dataset.m); T.warn = Math.max(1, Math.round(T.minutes / 5)); Object.assign(T, { running: false, remaining: T.minutes * 60000, warned: false, ended: false }); c.rerender(); },
    'talk-full': () => {
      const el = document.querySelector('[data-talk]');
      if (document.fullscreenElement) document.exitFullscreen?.();
      else el?.requestFullscreen?.().catch(() => {});
    },
  },
};
