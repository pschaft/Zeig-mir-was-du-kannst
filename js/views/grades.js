// Noten: Schnitt, ECTS-Fortschritt, Zielrechner, Prognose.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { bars, ring } from '../core/charts.js';
import { form, toast, gradeColor } from '../core/ui.js';
import { uid } from '../core/util.js';
import { today } from '../core/date.js';
import { fmtGrade, plural, fmtNum } from '../core/format.js';
import { removeWithUndo } from '../core/undo.js';
import { summary, gradeLabel, requiredAverage, requiredVerdict, bySemester, distribution, isPassed } from '../logic/grades.js';

function semesterSuggestions(state) {
  const y = Number(today().slice(0, 4));
  const out = [];
  for (let i = 0; i < 5; i++) {
    const a = y - i;
    out.push(`WiSe ${String(a).slice(2)}/${String(a + 1).slice(2)}`, `SoSe ${a}`);
  }
  for (const m of state.modules) if (m.semester && !out.includes(m.semester)) out.unshift(m.semester);
  return out;
}

function currentSemesterName(state) {
  const n = state.semester?.name ?? '';
  const m = /WiSe (\d{4})\/(\d{2})/.exec(n);
  return m ? `WiSe ${m[1].slice(2)}/${m[2]}` : n;
}

export async function moduleForm(id, preset = {}) {
  const s = store.state;
  const m = id ? s.modules.find((x) => x.id === id) : null;
  const status = m ? (m.planned ? 'planned' : m.graded === false ? 'ungraded' : 'graded') : preset.status ?? 'graded';
  const v = await form({
    title: m ? 'Modul bearbeiten' : 'Modul hinzufügen',
    fields: [
      { name: 'name', label: 'Modul', value: m?.name ?? preset.name ?? '', required: true, autofocus: !m, placeholder: 'z. B. Mathematik I', list: s.courses.map((c) => c.name) },
      { type: 'row', fields: [
        { name: 'ects', label: 'ECTS', type: 'number', min: 0, max: 60, value: m?.ects ?? preset.ects ?? '', required: true },
        { name: 'semester', label: 'Semester', value: m?.semester ?? currentSemesterName(s), list: semesterSuggestions(s) },
      ] },
      { name: 'status', label: 'Status', type: 'segmented', options: [{ value: 'graded', label: 'Benotet' }, { value: 'ungraded', label: 'Unbenotet' }, { value: 'planned', label: 'Geplant' }], value: status },
      { name: 'grade', label: 'Note', type: 'grade', value: m?.grade ?? null, show: (x) => x.status === 'graded', hint: '5,0 = nicht bestanden (zählt nicht zum Schnitt)' },
      { name: 'passed', label: 'Bestanden', type: 'switch', value: m?.passed ?? true, show: (x) => x.status === 'ungraded' },
      { name: 'expected', label: 'Erwartete Note (für die Prognose)', type: 'grade', value: m?.expected ?? null, show: (x) => x.status === 'planned' },
      { type: 'row', name: 'adv', show: (x) => x.status !== 'ungraded', fields: [
        { name: 'weight', label: 'Gewichtung', type: 'number', min: 0, max: 10, value: m?.weight ?? 1, hint: 'z. B. 1,5 für die Abschlussarbeit' },
      ] },
      { name: 'counts', label: 'Zählt zur Endnote', type: 'switch', value: m?.counts ?? true, show: (x) => x.status !== 'ungraded' },
    ],
    danger: m ? 'Löschen' : null,
    submitLabel: m ? 'Speichern' : 'Hinzufügen',
  });
  if (v === 'delete') return removeWithUndo((st) => st.modules, id, 'Modul gelöscht');
  if (!v) return;
  const data = {
    name: v.name, ects: v.ects, semester: v.semester, weight: v.weight ?? 1, counts: v.counts,
    graded: v.status !== 'ungraded', planned: v.status === 'planned',
    grade: v.status === 'graded' ? v.grade : null, passed: v.status === 'ungraded' ? v.passed : null,
    expected: v.status === 'planned' ? v.expected : null,
  };
  store.update((st) => {
    if (m) Object.assign(st.modules.find((x) => x.id === id), data);
    else st.modules.push({ id: uid('m'), ...data, createdAt: Date.now() });
  });
  if (data.grade && data.grade <= 1.3 && (!m || m.grade !== data.grade)) {
    const { confetti } = await import('../core/confetti.js');
    confetti({ count: 140 });
    toast(`${fmtGrade(data.grade)} – stark! 🎉`, { type: 'success', iconName: 'trophy' });
  } else toast(m ? 'Gespeichert' : 'Modul hinzugefügt', { type: 'success' });
}

function pill(m) {
  if (m.planned) return html`<span class="grade-pill open" title="Geplant">${m.expected ? `~${fmtGrade(m.expected)}` : 'geplant'}</span>`;
  if (m.graded === false) return html`<span class="grade-pill ${m.passed ? '' : 'open'}" style="--c:${m.passed ? '#1f9d55' : 'var(--muted)'}">${m.passed ? 'b.' : 'offen'}</span>`;
  if (m.grade == null) return html`<span class="grade-pill open">offen</span>`;
  return html`<span class="grade-pill" style="--c:${gradeColor(m.grade)}">${fmtGrade(m.grade)}</span>`;
}

export default {
  title: 'Noten',
  render({ state, ui }) {
    const opts = { totalEcts: state.profile.totalEcts, rounding: state.settings.gradeRounding };
    const s = summary(state.modules, opts);
    const proj = summary(state.modules, { ...opts, includePlanned: true });
    const target = ui.target ?? 1.5;
    const remaining = ui.remaining ?? Math.max(0, state.profile.totalEcts - s.doneEcts);
    const verdict = requiredVerdict(requiredAverage(s, remaining, target, state.settings.gradeRounding));
    const groups = bySemester(state.modules);
    const dist = distribution(state.modules);
    const hasPlanned = state.modules.some((m) => m.planned && m.expected != null);
    const semAvgs = groups.map(([sem, list]) => ({ sem, avg: summary(list, opts).avg })).filter((x) => x.avg != null).reverse();

    return html`
      <header class="page-head">
        <div class="titles"><h1>Noten</h1><p class="page-sub">${state.profile.program ? `${state.profile.program} · ` : ''}${plural(state.modules.length, 'Modul', 'Module')}</p></div>
        <div class="page-actions"><button class="btn btn-primary" data-action="new-module">${icon('plus')}<span class="hide-mobile">Modul</span></button></div>
      </header>

      ${!state.modules.length ? html`<div class="card"><div class="empty">
        <div class="empty-icon">🎓</div><h3>Behalte deinen Schnitt im Blick</h3>
        <p>Trag deine Module mit ECTS und Note ein. Unikram rechnet den gewichteten Schnitt und sagt dir, was du für deine Wunschnote noch brauchst.</p>
        <button class="btn btn-primary" data-action="new-module">${icon('plus')} Erstes Modul</button>
      </div></div>` : html`
      <div class="grid grid-3">
        <section class="card accent">
          <div class="card-title">Aktueller Schnitt</div>
          <div class="row-between mt-8" style="align-items:flex-end">
            <div><div class="big-grade">${s.avg != null ? fmtGrade(s.avg, 2) : '–'}</div><div class="small" style="opacity:.85">${s.avg != null ? gradeLabel(s.avg) : 'noch keine Noten'}</div></div>
            ${ring({ value: s.progress, size: 84, thickness: 8, color: '#fff', center: html`<div class="num bold" style="font-size:14px">${Math.round(s.progress * 100)}%</div><div style="font-size:10px;opacity:.8">ECTS</div>` })}
          </div>
          <div class="divider" style="background:rgb(255 255 255 / .25)"></div>
          <div class="row-between small"><span style="opacity:.85">Abschlussnote (${state.settings.gradeRounding === 'round' ? 'gerundet' : 'abgeschnitten'})</span><b>${s.final != null ? fmtGrade(s.final) : '–'}</b></div>
          <div class="row-between small mt-4"><span style="opacity:.85">ECTS geschafft</span><b class="num">${fmtNum(s.doneEcts)} / ${state.profile.totalEcts}</b></div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('target')} Zielrechner</span></div>
          <div class="field-row">
            <div class="field"><label class="label" for="g-target">Wunschnote</label>
              <select class="select" id="g-target" data-change="target">${Array.from({ length: 31 }, (_, i) => 1 + i / 10).map((g) => html`<option value="${g.toFixed(1)}" ${Math.abs(g - target) < 0.01 ? 'selected' : ''}>${fmtGrade(g)}</option>`)}</select></div>
            <div class="field"><label class="label" for="g-rem">Offene ECTS</label>
              <input class="input" id="g-rem" inputmode="numeric" value="${remaining}" data-change="remaining"></div>
          </div>
          <div class="mt-12">
            ${verdict.kind === 'need' ? html`<p>Du brauchst in den restlichen <b>${remaining} ECTS</b> einen Schnitt von <b class="accent-text" style="font-size:20px">${fmtGrade(verdict.value, 2)}</b> oder besser.</p>`
            : verdict.kind === 'safe' ? html`<div class="banner success">${icon('check')}<span>Sicher drin! Selbst mit lauter 4,0ern erreichst du ${fmtGrade(target)}.</span></div>`
            : verdict.kind === 'impossible' ? html`<div class="banner warn">${icon('alert')}<span>Mit ${remaining} offenen ECTS ist ${fmtGrade(target)} rechnerisch nicht mehr erreichbar – selbst mit lauter 1,0ern.</span></div>`
            : html`<p class="muted small">Gib die noch offenen ECTS an.</p>`}
          </div>
          ${hasPlanned ? html`<div class="divider"></div><div class="row-between small"><span class="muted">Prognose inkl. geplanter Module</span><b>${fmtGrade(proj.avg, 2)}</b></div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('trending')} Verteilung</span></div>
          ${bars({ data: dist.filter((x) => x.grade <= 4 || x.count).map((x) => ({ label: fmtGrade(x.grade), value: x.count, color: gradeColor(x.grade) })), height: 90, strong: true })}
          ${semAvgs.length > 1 ? html`<div class="section-title">Schnitt pro Semester</div>
            <div class="stack-sm">${semAvgs.map((x) => html`<div class="row-between small"><span>${x.sem}</span><span class="grade-pill" style="--c:${gradeColor(x.avg)};height:26px;min-width:44px;font-size:13px">${fmtGrade(x.avg, 2)}</span></div>`)}</div>` : ''}
        </section>
      </div>

      ${groups.map(([sem, list]) => {
        const ss = summary(list, opts);
        const ects = list.reduce((a, m) => a + (isPassed(m) || m.planned ? Number(m.ects) || 0 : 0), 0);
        return html`<div class="li-group">${sem} <span class="count">${ects} ECTS${ss.avg != null ? ` · Ø ${fmtGrade(ss.avg, 2)}` : ''}</span></div>
        <div class="card flush"><div class="list">${list.map((m) => html`
          <div class="li li-clickable" data-action="edit-module" data-id="${m.id}" data-key="${m.id}">
            <div class="li-main"><div class="li-title">${m.name}</div>
              <div class="li-sub"><span>${fmtNum(m.ects)} ECTS</span>${m.weight && m.weight !== 1 ? html`<span>×${fmtNum(m.weight, 1)}</span>` : ''}${m.counts === false ? html`<span>zählt nicht</span>` : ''}${m.planned ? html`<span>geplant</span>` : ''}${m.grade === 5 ? html`<span class="danger-text">nicht bestanden</span>` : ''}</div></div>
            ${pill(m)}
          </div>`)}</div></div>`;
      })}
      <p class="tiny muted center mt-24">Gewichtung nach ECTS × Faktor · unbenotete und nicht bestandene Module zählen nicht zum Schnitt · Rundung in den Einstellungen anpassbar · <a href="#/werkzeuge/notenschluessel">Notenschlüssel-Rechner</a></p>`}`;
  },
  actions: {
    'new-module': () => moduleForm(null),
    'edit-module': (c, el) => moduleForm(el.dataset.id),
    target: (c, el) => { c.ui.target = Number(el.value); c.rerender(); },
    remaining: (c, el) => { const n = Number(String(el.value).replace(',', '.')); c.ui.remaining = Number.isFinite(n) ? Math.max(0, n) : null; c.rerender(); },
  },
};

