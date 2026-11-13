// Gruppen-Generator: faire Zufallsgruppen.
import { store } from '../../core/store.js';
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { shuffle, copyText } from '../../core/util.js';
import { toast } from '../../core/ui.js';
import { COURSE_COLORS } from '../../logic/state.js';

function names(state) {
  return (state.tools.groupNames ?? '').split(/\n|,/).map((s) => s.trim()).filter(Boolean);
}

export function makeGroups(list, mode, n) {
  const shuffled = shuffle(list);
  const count = mode === 'size' ? Math.max(1, Math.ceil(shuffled.length / Math.max(1, n))) : Math.max(1, Math.min(n, shuffled.length));
  const groups = Array.from({ length: count }, () => []);
  shuffled.forEach((x, i) => groups[i % count].push(x));
  return groups;
}

export default {
  title: 'Gruppen-Generator',
  render({ state, ui }) {
    const list = names(state);
    ui.mode ??= 'count';
    ui.n ??= 3;
    return html`
      <header class="page-head"><div class="titles"><h1>Gruppen-Generator</h1><p class="page-sub">Für Referate, Projekte und Lerngruppen – garantiert zufällig.</p></div></header>
      <div class="grid grid-2">
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('users')} Teilnehmende (${list.length})</span></div>
          <textarea class="textarea" rows="10" placeholder="Ein Name pro Zeile (oder mit Komma getrennt)" data-input="grp-names" aria-label="Namen">${state.tools.groupNames ?? ''}</textarea>
          <div class="seg mt-12">${[['count', 'Anzahl Gruppen'], ['size', 'Personen pro Gruppe']].map(([k, l]) => html`<button class="${ui.mode === k ? 'active' : ''}" data-action="grp-mode" data-m="${k}">${l}</button>`)}</div>
          <div class="row mt-12">
            <button class="icon-btn filled" data-action="grp-n" data-d="-1" aria-label="Weniger">${icon('minus')}</button>
            <div class="stat-value sm" style="min-width:48px;text-align:center">${ui.n}</div>
            <button class="icon-btn filled" data-action="grp-n" data-d="1" aria-label="Mehr">${icon('plus')}</button>
            <span class="spacer"></span>
            <button class="btn btn-primary" data-action="grp-go" ${list.length < 2 ? 'disabled' : ''}>${icon('shuffle')} Mischen</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('layers')} Gruppen</span>${ui.groups ? html`<button class="card-link" data-action="grp-copy">${icon('copy')} Kopieren</button>` : ''}</div>
          ${ui.groups ? html`<div class="groups-out">${ui.groups.map((g, i) => html`<div class="group-box" style="--c:${COURSE_COLORS[(i * 5) % COURSE_COLORS.length]}"><h3>Gruppe ${i + 1}</h3><div class="small">${g.join(', ')}</div></div>`)}</div>`
          : html`<div class="empty compact"><div class="empty-icon">🎲</div><p>Namen eintragen und „Mischen“ drücken.</p></div>`}
        </section>
      </div>`;
  },
  actions: {
    'grp-names': (c, el) => { clearTimeout(c.ui._t); c.ui._t = setTimeout(() => store.update((s) => { s.tools.groupNames = el.value; }), 300); },
    'grp-mode': (c, el) => { c.ui.mode = el.dataset.m; c.rerender(); },
    'grp-n': (c, el) => { c.ui.n = Math.max(1, Math.min(50, (c.ui.n ?? 3) + Number(el.dataset.d))); c.rerender(); },
    'grp-go': (c) => {
      const ta = document.querySelector('[data-input="grp-names"]');
      if (ta) store.update((s) => { s.tools.groupNames = ta.value; });
      c.ui.groups = makeGroups(names(store.state), c.ui.mode, c.ui.n);
      c.rerender();
    },
    'grp-copy': async (c) => {
      const text = c.ui.groups.map((g, i) => `Gruppe ${i + 1}: ${g.join(', ')}`).join('\n');
      if (await copyText(text)) toast('Gruppen kopiert', { type: 'success' });
    },
  },
};
