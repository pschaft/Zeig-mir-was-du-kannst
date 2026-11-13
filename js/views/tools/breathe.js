// Atemübung gegen Prüfungsstress: Box Breathing, 4-7-8, ruhiges Atmen.
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { tone } from '../../core/audio.js';
import { store } from '../../core/store.js';

const PATTERNS = {
  box: { name: 'Box Breathing', desc: '4 ein · 4 halten · 4 aus · 4 halten – von Navy SEALs genutzt, um ruhig zu bleiben.', phases: [['Einatmen', 4, 1], ['Halten', 4, 1], ['Ausatmen', 4, 0.55], ['Halten', 4, 0.55]] },
  478: { name: '4-7-8', desc: '4 ein · 7 halten · 8 aus – hilft beim Runterkommen und Einschlafen.', phases: [['Einatmen', 4, 1], ['Halten', 7, 1], ['Ausatmen', 8, 0.55]] },
  calm: { name: 'Ruhig (4-6)', desc: '4 ein · 6 aus – längeres Ausatmen aktiviert den Entspannungsnerv.', phases: [['Einatmen', 4, 1], ['Ausatmen', 6, 0.55]] },
};

const B = { pattern: 'box', minutes: 3, running: false, timer: null, phase: 0, left: 0, endAt: 0 };

function stop(root) {
  clearTimeout(B.timer);
  B.running = false;
  const circle = root?.querySelector('[data-breath]');
  if (circle) {
    circle.style.transitionDuration = '1.2s';
    circle.style.transform = 'scale(.55)';
    circle.querySelector('[data-phase]').textContent = 'Bereit';
    circle.querySelector('[data-count]').textContent = '';
  }
}

function step(root) {
  const p = PATTERNS[B.pattern];
  const circle = root.querySelector('[data-breath]');
  if (!circle || !B.running) return;
  if (Date.now() > B.endAt && B.phase === 0 && B.left === 0) {
    stop(root);
    circle.querySelector('[data-phase]').textContent = 'Geschafft 🌿';
    root.querySelector('[data-breath-btn]')?.replaceChildren(document.createTextNode('Nochmal'));
    return;
  }
  if (B.left === 0) {
    const [name, secs, scale] = p.phases[B.phase];
    B.left = secs;
    circle.style.transitionDuration = `${secs}s`;
    circle.style.transform = `scale(${scale})`;
    circle.querySelector('[data-phase]').textContent = name;
    if (store.state.settings.sound) tone(name === 'Einatmen' ? 523 : name === 'Ausatmen' ? 392 : 440, 0.35, 0.05);
  }
  circle.querySelector('[data-count]').textContent = String(B.left);
  B.timer = setTimeout(() => {
    B.left--;
    if (B.left === 0) B.phase = (B.phase + 1) % p.phases.length;
    step(root);
  }, 1000);
}

export default {
  title: 'Atemübung',
  render() {
    const p = PATTERNS[B.pattern];
    return html`
      <header class="page-head"><div class="titles"><h1>Atemübung</h1><p class="page-sub">Ein paar Minuten vor der Klausur – der Puls geht runter, der Kopf wird klar.</p></div></header>
      <div class="grid grid-2">
        <section class="card"><div class="breath-stage" data-morph-skip>
          <div class="breath-circle" data-breath><div><div class="bc-phase" data-phase>Bereit</div><div class="bc-count" data-count></div></div></div>
        </div></section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('wind')} Technik</span></div>
          <div class="stack-sm">${Object.entries(PATTERNS).map(([k, x]) => html`<button class="choice" style="padding:12px 14px;${B.pattern === k ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}" data-action="br-pattern" data-p="${k}"><span><div class="ch-title" style="font-size:15px">${x.name}</div><div class="ch-desc">${x.desc}</div></span></button>`)}</div>
          <div class="field mt-16"><span class="label">Dauer</span><div class="seg">${[1, 3, 5, 10].map((m) => html`<button class="${B.minutes === m ? 'active' : ''}" data-action="br-min" data-m="${m}">${m} Min</button>`)}</div></div>
          <button class="btn btn-primary btn-lg btn-block mt-16" data-action="br-toggle" data-breath-btn>${B.running ? 'Stopp' : `${p.name} starten`}</button>
        </section>
      </div>`;
  },
  mount(el) {
    return () => stop(null);
  },
  actions: {
    'br-pattern': (c, el) => { stop(document); B.pattern = el.dataset.p; c.rerender(); },
    'br-min': (c, el) => { B.minutes = Number(el.dataset.m); c.rerender(); },
    'br-toggle': (c) => {
      if (B.running) { stop(document); c.rerender(); return; }
      Object.assign(B, { running: true, phase: 0, left: 0, endAt: Date.now() + B.minutes * 60000 });
      c.rerender();
      step(document);
    },
  },
};
