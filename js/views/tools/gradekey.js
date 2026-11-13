// Notenschlüssel: Punkte → Note, Tabelle der Grenzen, bayerische Formel.
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { gradeColor } from '../../core/ui.js';
import { fmtGrade, fmtNum } from '../../core/format.js';
import { percentToGrade, gradeTable, bavarian, gradeLabel } from '../../logic/grades.js';

const num = (v, d) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};

export default {
  title: 'Notenschlüssel',
  render({ ui }) {
    const max = num(ui.max, 60), got = num(ui.got, 45), pass = num(ui.pass, 50), top = num(ui.top, 95);
    const pct = max > 0 ? (got / max) * 100 : 0;
    const g = percentToGrade(pct, pass, top);
    const table = gradeTable(max, pass, top);
    const better = g > 1 && g <= 4 ? table[table.findIndex((x) => x.grade === g) - 1] : null;
    const nmax = num(ui.nmax, 10), nmin = num(ui.nmin, 5), nd = num(ui.nd, 8.5);
    const bav = bavarian(nmax, nmin, nd);
    const field = (name, label, value) => html`<div class="field"><label class="label" for="gk-${name}">${label}</label><input class="input" id="gk-${name}" inputmode="decimal" value="${value}" data-input="gk" data-k="${name}"></div>`;
    return html`
      <header class="page-head"><div class="titles"><h1>Notenschlüssel</h1><p class="page-sub">Wie viele Punkte brauche ich für welche Note?</p></div></header>
      <div class="grid grid-2">
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('percent')} Punkte → Note</span></div>
          <div class="field-row">${field('got', 'Erreichte Punkte', ui.got ?? 45)}${field('max', 'Maximale Punkte', ui.max ?? 60)}</div>
          <div class="field-row mt-12">${field('pass', 'Bestanden ab (%)', ui.pass ?? 50)}${field('top', '1,0 ab (%)', ui.top ?? 95)}</div>
          <div class="row mt-16" style="gap:16px">
            <span class="grade-pill" style="--c:${gradeColor(g)};height:64px;min-width:96px;font-size:30px;border-radius:18px">${fmtGrade(g)}</span>
            <div><div class="semi">${gradeLabel(g)}</div><div class="small muted">${fmtNum(pct, 1)} % der Punkte</div>
              ${better ? html`<div class="tiny muted mt-4">Für die ${fmtGrade(better.grade)} fehlen ${fmtNum(Math.max(0, better.points - got), 1)} Punkte</div>` : ''}
              ${g === 5 ? html`<div class="tiny danger-text mt-4">Zum Bestehen fehlen ${fmtNum(Math.max(0, table.at(-1).points - got), 1)} Punkte</div>` : ''}
            </div>
          </div>
          <p class="tiny muted mt-12">Lineare Skala in 10 Stufen – die genauen Grenzen legt dein:e Prüfer:in fest. Passe die Prozentwerte bei Bedarf an.</p>
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('list')} Notenspiegel für ${fmtNum(max)} Punkte</span></div>
          <table class="grade-table">
            <thead><tr><th>Note</th><th>ab Punkten</th><th>ab %</th></tr></thead>
            <tbody>${table.map((r) => html`<tr class="${r.grade === g ? 'hit' : ''}"><td><span class="grade-pill" style="--c:${gradeColor(r.grade)};height:26px;min-width:44px;font-size:13px">${fmtGrade(r.grade)}</span></td><td class="num semi">${fmtNum(r.points, r.points % 1 ? 1 : 0)}</td><td class="num muted">${fmtNum(r.pct, 1)} %</td></tr>`)}
              <tr class="${g === 5 ? 'hit' : ''}"><td><span class="grade-pill" style="--c:${gradeColor(5)};height:26px;min-width:44px;font-size:13px">5,0</span></td><td class="num muted">darunter</td><td></td></tr></tbody>
          </table>
        </section>
        <section class="card span-2">
          <div class="card-head"><span class="card-title">${icon('map')} Ausländische Noten umrechnen (modifizierte bayerische Formel)</span></div>
          <div class="field-row">${field('nmax', 'Beste Note im System', ui.nmax ?? 10)}${field('nmin', 'Schlechteste Bestehensnote', ui.nmin ?? 5)}${field('nd', 'Deine Note', ui.nd ?? 8.5)}</div>
          <div class="row mt-16" style="gap:16px">
            ${bav != null ? html`<span class="grade-pill" style="--c:${gradeColor(bav)};height:56px;min-width:88px;font-size:26px;border-radius:16px">${fmtGrade(bav)}</span><div class="small"><div>Deutsche Note: <b>${fmtGrade(bav, 2)}</b> (${gradeLabel(bav)})</div><div class="tiny muted mt-4">x = 1 + 3 · (Nmax − Nd) / (Nmax − Nmin)</div></div>` : html`<span class="muted">Beste und schlechteste Note dürfen nicht gleich sein.</span>`}
          </div>
          <p class="tiny muted mt-12">Beispiele: Spanien 10/5 · Italien 30/18 · USA (GPA) 4,0/1,0 · Frankreich 20/10. Maßgeblich ist immer die Umrechnung deiner Hochschule.</p>
        </section>
      </div>`;
  },
  actions: {
    gk: (c, el) => { c.ui[el.dataset.k] = el.value; c.rerender(); },
  },
};
