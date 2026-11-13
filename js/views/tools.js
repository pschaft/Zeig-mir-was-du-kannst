// Werkzeuge: Übersicht + Routing zu den einzelnen Tools.
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import wordcount from './tools/wordcount.js';
import cite from './tools/cite.js';
import gradekey from './tools/gradekey.js';
import talk from './tools/talk.js';
import wheel from './tools/wheel.js';
import groups from './tools/groups.js';
import breathe from './tools/breathe.js';

export const TOOLS = [
  { id: 'wortzaehler', mod: wordcount, icon: 'text', color: '#5b5bd6', title: 'Wortzähler', desc: 'Wörter, Zeichen, Normseiten, Lesezeit – plus Füllwort-Check für Hausarbeiten' },
  { id: 'zitieren', mod: cite, icon: 'quote', color: '#8e4ec6', title: 'Quellen zitieren', desc: 'APA, Harvard, IEEE, MLA & deutsche Zitierweise – per DOI oder ISBN' },
  { id: 'notenschluessel', mod: gradekey, icon: 'percent', color: '#2f9e5b', title: 'Notenschlüssel', desc: 'Punkte → Note, Bestehensgrenzen, bayerische Formel' },
  { id: 'vortrag', mod: talk, icon: 'clock', color: '#ee6b12', title: 'Vortrags-Timer', desc: 'Großer Countdown fürs Referat – wird gelb und rot' },
  { id: 'gluecksrad', mod: wheel, icon: 'dice', color: '#d6409f', title: 'Glücksrad', desc: 'Mensa oder Döner? Wer bringt den Müll raus? Das Rad entscheidet.' },
  { id: 'gruppen', mod: groups, icon: 'shuffle', color: '#0b84e3', title: 'Gruppen-Generator', desc: 'Faire Zufallsgruppen für Projekte und Referate' },
  { id: 'atmen', mod: breathe, icon: 'wind', color: '#12a594', title: 'Atemübung', desc: 'Box Breathing & 4-7-8 gegen Prüfungsstress' },
];

const byId = new Map(TOOLS.map((t) => [t.id, t]));

function sub(c) { return byId.get(c.params.tool); }

export default {
  title: (c) => sub(c)?.title ?? 'Werkzeuge',
  immersive: (c) => (sub(c)?.mod.immersive ? sub(c).mod.immersive(c) : false),
  render(c) {
    const t = sub(c);
    if (c.params.tool && t) {
      return html`<a class="back-link" href="#/werkzeuge">${icon('chevronLeft', 'sm')} Werkzeuge</a>${t.mod.render(c)}`;
    }
    return html`
      <header class="page-head"><div class="titles"><h1>Werkzeuge</h1><p class="page-sub">Kleine Helfer für den Uni-Alltag</p></div></header>
      <div class="tool-grid">${TOOLS.map((x) => html`
        <a class="card clickable tool-card" href="#/werkzeuge/${x.id}" style="--c:${x.color}">
          <span class="tc-icon">${icon(x.icon)}</span>
          <span style="min-width:0"><div class="tc-title">${x.title}</div><div class="tc-desc">${x.desc}</div></span>
        </a>`)}</div>`;
  },
  mount(el, c) { return sub(c)?.mod.mount?.(el, c); },
  afterRender(el, c) { sub(c)?.mod.afterRender?.(el, c); },
  onKey(e, c) { return sub(c)?.mod.onKey?.(e, c) ?? false; },
  get actions() {
    const all = {};
    for (const t of TOOLS) Object.assign(all, t.mod.actions ?? {});
    return all;
  },
};
