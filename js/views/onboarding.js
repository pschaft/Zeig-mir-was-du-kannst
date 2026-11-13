// Willkommen: drei kurze Schritte zum Start.
import { store } from '../core/store.js';
import { html, raw } from '../core/html.js';
import { icon, LOGO_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { today, fmtDate } from '../core/date.js';
import { confetti } from '../core/confetti.js';
import { semesterPresets } from '../logic/state.js';
import { applyDemo } from '../logic/demo.js';

const FEATURES = [
  ['📅', 'Stundenplan'], ['✅', 'Aufgaben'], ['⏱️', 'Fokus-Timer'], ['🃏', 'Karteikarten'],
  ['🎓', 'Notenrechner'], ['💸', 'Budget'], ['🏠', 'WG-Kasse'], ['🗺️', 'Lernplan'],
];

export default {
  title: 'Willkommen',
  immersive: true,
  render({ state, ui }) {
    ui.step ??= 0;
    const presets = semesterPresets(today());
    const steps = html`<div class="steps">${[0, 1, 2].map((i) => html`<i class="${i <= ui.step ? 'on' : ''}"></i>`)}</div>`;
    if (ui.step === 0) {
      return html`<div class="onboard">
        ${raw(LOGO_SVG.replace('<svg', '<svg class="logo-big"'))}
        <div><h1>Willkommen bei Unikram</h1>
        <p class="muted mt-8" style="font-size:17px">Dein ganzer Unikram in einer App – Stundenplan, Aufgaben, Lernen, Geld und WG. Alles bleibt privat auf deinem Gerät.</p></div>
        <div class="feature-list">${FEATURES.map(([e, t]) => html`<div class="feature"><span class="emoji">${e}</span>${t}</div>`)}</div>
        <form class="stack" data-submit="ob-name">
          <div class="field"><label class="label" for="ob-name">Wie dürfen wir dich nennen?</label>
          <input class="input" id="ob-name" name="name" placeholder="Dein Vorname (optional)" value="${state.profile.name}" autocomplete="given-name"></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Los geht’s ${icon('arrowRight')}</button>
        </form>
        ${steps}
      </div>`;
    }
    if (ui.step === 1) {
      return html`<div class="onboard">
        <div><h1>Welches Semester?</h1><p class="muted mt-8">Damit Unikram Vorlesungswochen, Ferien und Countdowns kennt. Die Daten kannst du später anpassen.</p></div>
        <div class="stack">
          ${presets.map((p, i) => html`<button class="choice" data-action="ob-sem" data-i="${i}">
            <span class="emoji">${p.name.startsWith('WiSe') ? '❄️' : '☀️'}</span>
            <span><div class="ch-title">${p.name}</div><div class="ch-desc">Vorlesungen ${fmtDate(p.lectureStart, 'dm')} – ${fmtDate(p.lectureEnd, 'dm')}</div></span>
          </button>`)}
          <button class="choice" data-action="ob-sem" data-i="-1"><span class="emoji">🤷</span><span><div class="ch-title">Später einrichten</div><div class="ch-desc">z. B. für Fachhochschulen mit abweichenden Zeiten</div></span></button>
        </div>
        <div class="field"><label class="label">Wie viele ECTS hat dein Studium?</label>
          <div class="seg">${[180, 210, 120, 240, 300].map((n) => html`<button class="${state.profile.totalEcts === n ? 'active' : ''}" data-action="ob-ects" data-n="${n}">${n}</button>`)}</div>
        </div>
        <div class="row"><button class="btn btn-ghost" data-action="ob-back">${icon('chevronLeft')} Zurück</button></div>
        ${steps}
      </div>`;
    }
    return html`<div class="onboard">
      <div><h1>Wie möchtest du starten?</h1><p class="muted mt-8">Mit Beispieldaten siehst du sofort, was alles geht. Du kannst sie jederzeit in den Einstellungen löschen.</p></div>
      <div class="stack">
        <button class="choice" data-action="ob-finish" data-demo="1"><span class="emoji">✨</span><span><div class="ch-title">Mit Beispieldaten erkunden</div><div class="ch-desc">Ein volles Semester: Stundenplan, Aufgaben, Karteikarten, Budget, WG …</div></span></button>
        <button class="choice" data-action="ob-finish" data-demo="0"><span class="emoji">🧹</span><span><div class="ch-title">Leer starten</div><div class="ch-desc">Direkt mit deinen eigenen Sachen loslegen</div></span></button>
      </div>
      <div class="banner info">${icon('lock')}<span>Keine Anmeldung, kein Tracking, keine Cloud. Für Backups gibt es Export & Import in den Einstellungen.</span></div>
      <div class="row"><button class="btn btn-ghost" data-action="ob-back">${icon('chevronLeft')} Zurück</button></div>
      ${steps}
    </div>`;
  },
  actions: {
    'ob-name': (c, el) => {
      const name = el.querySelector('[name=name]').value.trim();
      store.update((s) => { s.profile.name = name; });
      c.ui.step = 1;
      c.rerender();
    },
    'ob-sem': (c, el) => {
      const i = Number(el.dataset.i);
      if (i >= 0) {
        const p = semesterPresets(today())[i];
        store.update((s) => { s.semester = p; });
      }
      c.ui.step = 2;
      c.rerender();
    },
    'ob-ects': (c, el) => store.update((s) => { s.profile.totalEcts = Number(el.dataset.n); }),
    'ob-back': (c) => { c.ui.step = Math.max(0, c.ui.step - 1); c.rerender(); },
    'ob-finish': (c, el) => {
      const demo = el.dataset.demo === '1';
      store.update((s) => {
        if (demo) applyDemo(s);
        if (!s.semester.lectureStart && demo) s.semester = semesterPresets(today())[0];
        s.profile.onboarded = true;
      });
      navigate('heute');
      setTimeout(() => confetti({ count: 160 }), 250);
    },
  },
};
