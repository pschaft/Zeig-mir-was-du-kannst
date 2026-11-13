// Lernplan: Themen pro Prüfung → automatisch verteilte Lernblöcke mit Wiederholungen.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { form, toast, confirm } from '../core/ui.js';
import { uid, groupBy } from '../core/util.js';
import { today, fmtDate, relDay, diffDays, WD, tsToDate } from '../core/date.js';
import { fmtMinutes, fmtHours, plural } from '../core/format.js';
import { confetti } from '../core/confetti.js';
import { upcomingExams, courseMap } from '../logic/timetable.js';
import { generatePlan, examProgress, parseTopics, topicsToText, KIND_META } from '../logic/planner.js';

export function toggleBlock(id) {
  let done = false, dayDone = false;
  store.update((s) => {
    const b = s.plan.blocks.find((x) => x.id === id);
    if (!b) return;
    b.done = !b.done;
    b.doneAt = b.done ? Date.now() : null;
    done = b.done;
    const dayBlocks = s.plan.blocks.filter((x) => x.date === b.date);
    dayDone = done && dayBlocks.every((x) => x.done);
  });
  if (dayDone) { confetti({ count: 120 }); toast('Lernplan für heute geschafft! 🎓', { type: 'success', iconName: 'trophy' }); }
}

export function regenerate({ silent = false } = {}) {
  const s = store.state;
  const d = today();
  const keep = s.plan.blocks.filter((b) => b.done);
  const doneByTopic = new Map();
  for (const b of keep) if (b.kind === 'learn' && b.topicId) doneByTopic.set(b.topicId, (doneByTopic.get(b.topicId) ?? 0) + b.minutes);
  const usedToday = keep.filter((b) => b.date === d).reduce((a, b) => a + b.minutes, 0);
  const exams = upcomingExams(s, d)
    .filter((e) => (s.plan.topics[e.id] ?? []).length)
    .map((e) => ({ id: e.id, title: e.title, date: e.date, topics: s.plan.topics[e.id].map((t) => ({ ...t, doneMinutes: doneByTopic.get(t.id) ?? 0 })) }));
  const gen = generatePlan({ exams, availability: s.plan.availability, start: d, blockMinutes: s.plan.blockMinutes, usedToday });
  store.update((st) => {
    st.plan.blocks = [...keep, ...gen.blocks];
    st.plan.warnings = gen.warnings;
    st.plan.generatedAt = Date.now();
  });
  if (!silent) toast(gen.blocks.length ? `Plan erstellt: ${plural(gen.blocks.length, 'Lernblock', 'Lernblöcke')} 🗺️` : 'Keine Themen zum Verplanen', { type: gen.blocks.length ? 'success' : 'info' });
}

async function topicsForm(examId) {
  const s = store.state;
  const e = s.events.find((x) => x.id === examId);
  const existing = s.plan.topics[examId] ?? [];
  const v = await form({
    title: `Themen: ${e.title}`,
    intro: 'Ein Thema pro Zeile. Optional mit geschätztem Aufwand in Stunden nach einem Semikolon – ohne Angabe werden 2 Stunden angenommen.',
    fields: [
      { name: 'topics', label: 'Themen', type: 'textarea', rows: 9, value: topicsToText(existing), placeholder: 'Kapitel 1: Grundlagen; 3\nKapitel 2: Folgen & Reihen; 4\nAltklausuren rechnen; 5', autofocus: true },
      { type: 'html', html: html`<div class="banner info" data-sum>${icon('info')}<span></span></div>` },
    ],
    submitLabel: 'Speichern & planen',
    onChange: (vals, el) => {
      const t = parseTopics(vals.topics);
      const total = t.reduce((a, x) => a + x.minutes, 0);
      const days = diffDays(today(), e.date);
      el.querySelector('[data-sum] span').textContent = t.length ? `${plural(t.length, 'Thema', 'Themen')} · ${fmtHours(total)} Lernzeit · noch ${plural(days, 'Tag', 'Tage')} bis zur Prüfung` : 'Noch keine Themen.';
    },
  });
  if (!v) return;
  const parsed = parseTopics(v.topics);
  store.update((st) => {
    // IDs bestehender Themen (gleicher Name) behalten, damit Fortschritt erhalten bleibt
    const byName = new Map(existing.map((t) => [t.name, t]));
    st.plan.topics[examId] = parsed.map((t) => ({ id: byName.get(t.name)?.id ?? uid('tp'), name: t.name, minutes: t.minutes }));
  });
  regenerate();
}

async function availabilityForm() {
  const s = store.state;
  const v = await form({
    title: 'Wann kannst du lernen?',
    intro: 'Stunden pro Wochentag, die du fürs Lernen einplanen willst (zusätzlich zu Vorlesungen). Sei ehrlich – ein realistischer Plan schlägt einen perfekten.',
    fields: [
      { type: 'row', fields: WD.map((d, i) => ({ name: `d${i}`, label: d, type: 'number', min: 0, max: 14, value: String(+(s.plan.availability[i] / 60).toFixed(2)).replace('.', ',') })) },
      { name: 'block', label: 'Länge eines Lernblocks', type: 'segmented', options: [30, 45, 60, 90, 120].map((n) => ({ value: n, label: `${n} Min` })), value: s.plan.blockMinutes },
    ],
    submitLabel: 'Speichern & neu planen',
  });
  if (!v) return;
  store.update((st) => {
    st.plan.availability = WD.map((_, i) => Math.round((v[`d${i}`] || 0) * 60));
    st.plan.blockMinutes = Number(v.block);
  });
  regenerate();
}

export default {
  title: 'Lernplan',
  render({ state, ui }) {
    const d = today();
    const exams = upcomingExams(state, d);
    const cm = courseMap(state);
    const examMap = new Map(state.events.map((e) => [e.id, e]));
    const colorOf = (examId) => cm.get(examMap.get(examId)?.courseId)?.color ?? '#5b5bd6';
    const blocks = state.plan.blocks.filter((b) => examMap.has(b.examId));
    const missed = blocks.filter((b) => b.date < d && !b.done);
    const upcoming = blocks.filter((b) => b.date >= d);
    const byDay = groupBy(upcoming, (b) => b.date);
    const days = [...byDay.keys()].sort();
    const shownDays = ui.all ? days : days.slice(0, 10);
    const weeklyHours = state.plan.availability.reduce((a, b) => a + b, 0) / 60;
    const warnings = (state.plan.warnings ?? []).filter((w) => examMap.has(w.examId) && examMap.get(w.examId).date > d);
    const hasTopics = exams.some((e) => (state.plan.topics[e.id] ?? []).length);

    return html`
      <header class="page-head">
        <div class="titles"><h1>Lernplan</h1><p class="page-sub">${weeklyHours ? `${fmtHours(weeklyHours * 60)} Lernzeit pro Woche eingeplant` : 'Plane deine Prüfungsvorbereitung'}</p></div>
        <div class="page-actions">
          <button class="icon-btn filled" data-action="availability" aria-label="Verfügbarkeit">${icon('clock')}</button>
          ${hasTopics ? html`<button class="btn btn-primary" data-action="regen">${icon('repeat')}<span class="hide-mobile">Neu planen</span></button>` : ''}
        </div>
      </header>

      ${!exams.length ? html`<div class="card"><div class="empty">
        <div class="empty-icon">🗺️</div><h3>Erst die Prüfungen, dann der Plan</h3>
        <p>Trag deine Prüfungen ein und liste die Themen auf. Unikram verteilt alles auf deine freien Tage – inklusive Wiederholungen nach 1, 3 und 7 Tagen und einer Generalprobe am Vortag.</p>
        <button class="btn btn-primary" data-action="new-event" data-kind="exam">${icon('plus')} Prüfung eintragen</button>
      </div></div>` : ''}

      ${warnings.map((w) => html`<div class="banner warn mb-12">${icon('alert')}<span>${w.noTopics ? html`<b>${w.title}:</b> noch keine Themen hinterlegt.` : html`<b>${w.title}:</b> Es fehlen ca. <b>${fmtHours(w.missingMinutes)}</b> bis zur Prüfung. Plane mehr Zeit pro Tag ein oder kürze die Themen.`}</span></div>`)}
      ${missed.length ? html`<div class="banner danger mb-12">${icon('clock')}<span>${plural(missed.length, 'Lernblock', 'Lernblöcke')} (${fmtMinutes(missed.reduce((a, b) => a + b.minutes, 0))}) verpasst – kein Problem. <button class="btn btn-xs btn-danger" data-action="regen" style="margin-left:6px">Neu verteilen</button></span></div>` : ''}

      ${exams.length ? html`<div class="grid grid-3 mb-16">${exams.map((e) => {
        const topics = state.plan.topics[e.id] ?? [];
        const prog = examProgress(blocks, e.id);
        const n = diffDays(d, e.date);
        const c = cm.get(e.courseId);
        const total = topics.reduce((a, t) => a + t.minutes, 0);
        return html`<section class="card" style="border-top:4px solid ${c?.color ?? '#e5484d'}">
          <div class="row-between"><span class="badge ${n <= 7 ? 'badge-danger' : n <= 21 ? 'badge-warning' : ''}">${n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`}</span><button class="icon-btn sm" data-action="edit-event" data-id="${e.id}" aria-label="Prüfung bearbeiten">${icon('edit')}</button></div>
          <h3 class="mt-8">${e.title}</h3>
          <p class="tiny muted">${fmtDate(e.date, 'long')}${e.start ? ` · ${e.start}` : ''}</p>
          ${topics.length ? html`
            <div class="progress mt-12" style="--c:${c?.color ?? 'var(--accent)'}"><div class="progress-bar" style="width:${Math.round(prog.ratio * 100)}%"></div></div>
            <div class="row-between tiny muted mt-4"><span>${Math.round(prog.ratio * 100)} % erledigt</span><span>${plural(topics.length, 'Thema', 'Themen')} · ${fmtHours(total)}</span></div>
            <button class="btn btn-ghost btn-sm mt-8" data-action="topics" data-id="${e.id}">${icon('list')} Themen bearbeiten</button>`
          : html`<button class="btn btn-soft btn-sm mt-12" data-action="topics" data-id="${e.id}">${icon('plus')} Themen hinzufügen</button>`}
        </section>`;
      })}</div>` : ''}

      ${exams.length && !upcoming.length && hasTopics ? html`<div class="card center"><p class="muted mb-12">Noch kein Plan für die kommenden Tage.</p><button class="btn btn-primary" data-action="regen">${icon('route')} Plan erstellen</button></div>` : ''}

      ${shownDays.map((day) => {
        const list = byDay.get(day);
        const sumM = list.reduce((a, b) => a + b.minutes, 0);
        const doneM = list.filter((b) => b.done).reduce((a, b) => a + b.minutes, 0);
        return html`<div class="plan-day ${day === d ? 'today' : ''}">
          <div class="plan-day-head"><span class="pd-date">${relDay(day)} <span class="muted small" style="font-weight:500">· ${fmtDate(day)}</span></span><span class="pd-sum">${doneM ? `${fmtMinutes(doneM, true)} / ` : ''}${fmtMinutes(sumM, true)}</span></div>
          ${list.map((b) => {
            const e = examMap.get(b.examId);
            return html`<div class="block ${b.done ? 'done' : ''}" style="--c:${colorOf(b.examId)}" data-key="${b.id}">
              <button class="check ${b.done ? 'done' : ''}" style="--c:${colorOf(b.examId)}" data-action="toggle-block" data-id="${b.id}" aria-label="Erledigt">${icon('check')}</button>
              <span class="bl-kind" title="${KIND_META[b.kind].label}">${KIND_META[b.kind].emoji}</span>
              <div style="flex:1;min-width:0"><div class="bl-title">${b.title}</div><div class="bl-sub">${KIND_META[b.kind].label} · ${e?.title ?? ''} · ${fmtMinutes(b.minutes)}</div></div>
              ${!b.done && day === d ? html`<button class="icon-btn sm" data-action="start-focus" data-label="${b.title}" data-course="${e?.courseId ?? ''}" aria-label="Fokus starten">${icon('play')}</button>` : ''}
            </div>`;
          })}
        </div>`;
      })}
      ${days.length > shownDays.length ? html`<button class="btn btn-ghost btn-block mt-8" data-action="show-all">Alle ${days.length} Tage anzeigen</button>` : ''}
      ${hasTopics ? html`<p class="tiny muted center mt-24">📖 Lernen · 🔁 Wiederholen (1/3/7 Tage später) · 🎯 Generalprobe am Vortag${state.plan.generatedAt ? ` · zuletzt geplant ${fmtDate(tsToDate(state.plan.generatedAt))}` : ''}</p>` : ''}`;
  },
  actions: {
    regen: () => regenerate(),
    topics: (c, el) => topicsForm(el.dataset.id),
    availability: () => availabilityForm(),
    'show-all': (c) => { c.ui.all = true; c.rerender(); },
  },
};

