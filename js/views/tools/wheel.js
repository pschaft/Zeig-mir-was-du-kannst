// Glücksrad: Entscheidungen auslagern.
import { store } from '../../core/store.js';
import { html, raw, esc } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { randInt } from '../../core/util.js';
import { confetti } from '../../core/confetti.js';
import { tone } from '../../core/audio.js';
import { COURSE_COLORS } from '../../logic/state.js';

const PRESETS = [
  ['🍽️ Mittagessen', 'Mensa\nDöner\nPizza\nSelbst kochen\nSushi\nNudeln mit Pesto'],
  ['🧹 Wer muss?', 'Lena\nJonas\nMia\nDu'],
  ['📚 Was lerne ich?', ''],
  ['🎲 Ja / Nein', 'Ja\nNein\nJa\nNein\nFrag später nochmal'],
  ['🌙 Abendprogramm', 'Serie\nBar\nSport\nLesen\nZocken\nFrüh schlafen'],
];

function options(state) {
  const raw0 = state.tools.wheel || PRESETS[0][1];
  return raw0.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 24);
}

function wheelSVG(opts, rot) {
  const n = Math.max(opts.length, 1);
  const seg = 360 / n;
  const R = 98;
  const paths = opts.map((o, i) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180, a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const x0 = R * Math.cos(a0), y0 = R * Math.sin(a0), x1 = R * Math.cos(a1), y1 = R * Math.sin(a1);
    const large = seg > 180 ? 1 : 0;
    const mid = i * seg + seg / 2 - 90;
    const fs = Math.max(6, Math.min(11, 120 / n + 3));
    const label = o.length > 16 ? o.slice(0, 15) + '…' : o;
    const color = COURSE_COLORS[(i * 5) % COURSE_COLORS.length];
    const d = n === 1 ? `M -${R} 0 A ${R} ${R} 0 1 1 ${R} 0 A ${R} ${R} 0 1 1 -${R} 0` : `M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    return `<path d="${d}" fill="${color}" stroke="#fff" stroke-width="1.2"/><text x="${R * 0.6}" y="0" transform="rotate(${mid})" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${fs}" font-weight="700" style="font-family:var(--font)">${esc(label)}</text>`;
  }).join('');
  return raw(`<svg viewBox="-100 -100 200 200" role="img" aria-label="Glücksrad"><g class="wheel-rot" style="transform:rotate(${rot}deg);transition:transform 4.2s cubic-bezier(.12,.8,.18,1)">${paths}</g><circle r="13" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/><circle r="5" fill="var(--text)"/></svg>`);
}

export default {
  title: 'Glücksrad',
  render({ state, ui }) {
    const opts = options(state);
    ui.rot ??= 0;
    return html`
      <header class="page-head"><div class="titles"><h1>Glücksrad</h1><p class="page-sub">Wenn du dich nicht entscheiden kannst – lass das Rad entscheiden.</p></div></header>
      <div class="grid grid-2">
        <section class="card center">
          <div class="wheel-wrap"><div class="wheel-pointer"></div>${wheelSVG(opts, ui.rot)}</div>
          <div class="wheel-result mt-8" aria-live="polite">${ui.spinning ? '…' : ui.result ? `🎉 ${ui.result}` : ''}</div>
          <button class="btn btn-primary btn-lg mt-12" data-action="wheel-spin" ${ui.spinning || opts.length < 2 ? 'disabled' : ''}>${icon('dice')} Drehen</button>
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('list')} Optionen (eine pro Zeile)</span></div>
          <div class="chips wrap mb-12">${PRESETS.map(([l], i) => html`<button class="chip sm" data-action="wheel-preset" data-i="${i}">${l}</button>`)}</div>
          <textarea class="textarea" rows="10" data-input="wheel-opts" aria-label="Optionen">${state.tools.wheel || PRESETS[0][1]}</textarea>
          <p class="tiny muted mt-8">${opts.length} Optionen · max. 24</p>
        </section>
      </div>`;
  },
  actions: {
    'wheel-opts': (c, el) => {
      clearTimeout(c.ui._t);
      c.ui._t = setTimeout(() => store.update((s) => { s.tools.wheel = el.value; }), 300);
    },
    'wheel-preset': (c, el) => {
      const i = Number(el.dataset.i);
      let text = PRESETS[i][1];
      if (i === 1) {
        const g = store.state.groups[0];
        if (g) text = g.members.map((m) => (m.id === g.meId ? 'Du' : m.name)).join('\n');
      }
      if (i === 2) text = store.state.courses.map((x) => x.name).join('\n') || 'Mathe\nProgrammieren\nBWL\nStatistik';
      store.update((s) => { s.tools.wheel = text; });
      const ta = document.querySelector('[data-input="wheel-opts"]');
      if (ta) ta.value = text;
      c.ui.result = null;
    },
    'wheel-spin': (c) => {
      const opts = options(store.state);
      if (opts.length < 2 || c.ui.spinning) return;
      const n = opts.length, seg = 360 / n;
      const win = randInt(n);
      const theta = win * seg + seg * (0.15 + Math.random() * 0.7);
      const desired = (360 - theta) % 360;
      const cur = c.ui.rot ?? 0;
      c.ui.rot = cur + 360 * 6 + ((desired - (cur % 360)) + 360) % 360;
      c.ui.spinning = true;
      c.ui.result = null;
      c.rerender();
      let ticks = 0;
      const tick = setInterval(() => { if (++ticks > 22) clearInterval(tick); else tone(900 + Math.random() * 200, 0.05, 0.04); }, 60 + ticks * 8);
      setTimeout(() => {
        clearInterval(tick);
        c.ui.spinning = false;
        c.ui.result = opts[win];
        c.rerender();
        confetti({ count: 110, origin: { x: 0.5, y: 0.4 } });
      }, 4300);
    },
  },
};
