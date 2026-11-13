// Aufgaben: Schnelleingabe mit Spracherkennung, Gruppen, Filter.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { form, toast, confirm } from '../core/ui.js';
import { uid, vibrate } from '../core/util.js';
import { today, relDayShort } from '../core/date.js';
import { plural } from '../core/format.js';
import { confetti } from '../core/confetti.js';
import { removeWithUndo } from '../core/undo.js';
import { parseQuickAdd, groupTasks, GROUP_LABELS } from '../logic/tasks.js';
import { courseMap } from '../logic/timetable.js';

export function courseOptions(state, empty = 'Kein Kurs') {
  return [{ value: '', label: empty }, ...state.courses.map((c) => ({ value: c.id, label: c.name }))];
}

const PART_ICONS = { date: 'calendar', time: 'clock', course: 'book', prio: 'flag' };

export function previewChips(parts, courses) {
  return html`${parts.map((p) => {
    const c = p.courseId ? courses.find((x) => x.id === p.courseId) : null;
    return html`<span class="badge ${p.kind === 'prio' ? 'badge-danger' : c ? 'badge-course' : 'badge-accent'}" style="${c ? `--c:${c.color}` : ''}">${icon(PART_ICONS[p.kind])} ${p.label}</span>`;
  })}`;
}

export async function taskForm(id, preset = {}) {
  const s = store.state;
  const t = id ? s.tasks.find((x) => x.id === id) : null;
  if (id && !t) return;
  const v = await form({
    title: t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
    fields: [
      {
        name: 'title', label: 'Was ist zu tun?', value: t?.title ?? preset.title ?? '', required: true, autofocus: !t,
        placeholder: 'z. B. Übungsblatt 4 #ana bis Freitag !',
      },
      { type: 'html', name: 'nlp', html: html`<div class="qa-preview" data-nlp></div>` },
      { type: 'row', fields: [
        { name: 'due', label: 'Fällig am', type: 'date', value: t?.due ?? preset.due ?? '' },
        { name: 'dueTime', label: 'Uhrzeit', type: 'time', value: t?.dueTime ?? '' },
      ] },
      { name: 'courseId', label: 'Kurs', type: 'select', options: courseOptions(s), value: t?.courseId ?? preset.courseId ?? '' },
      { name: 'priority', label: 'Priorität', type: 'segmented', options: [{ value: 0, label: 'Normal' }, { value: 1, label: '! Wichtig' }, { value: 2, label: '!! Dringend' }], value: t?.priority ?? 0 },
      { name: 'notes', label: 'Notizen', type: 'textarea', rows: 3, value: t?.notes ?? '', placeholder: 'Links, Details, Teilschritte …' },
    ],
    danger: t ? 'Löschen' : null,
    submitLabel: t ? 'Speichern' : 'Hinzufügen',
    onChange: (vals, el) => {
      if (t) return;
      const box = el.querySelector('[data-nlp]');
      const p = parseQuickAdd(vals.title, { courses: s.courses });
      box.innerHTML = String(previewChips(p.parts, s.courses));
    },
  });
  if (v === 'delete') return deleteTask(id);
  if (!v) return;
  if (!t) {
    const p = parseQuickAdd(v.title, { courses: s.courses });
    v.title = p.title || v.title;
    v.due ||= p.due ?? '';
    v.dueTime ||= p.dueTime ?? '';
    v.courseId ||= p.courseId ?? '';
    if (!Number(v.priority)) v.priority = p.priority;
  }
  const data = { title: v.title, due: v.due || null, dueTime: v.dueTime || null, courseId: v.courseId || '', priority: Number(v.priority) || 0, notes: v.notes };
  store.update((st) => {
    if (t) Object.assign(st.tasks.find((x) => x.id === id), data);
    else st.tasks.push({ id: uid('t'), ...data, done: false, createdAt: Date.now() });
  });
  toast(t ? 'Gespeichert' : 'Aufgabe hinzugefügt', { type: 'success' });
}

export function addTaskFromText(text) {
  const s = store.state;
  const p = parseQuickAdd(text, { courses: s.courses });
  if (!p.title) return false;
  store.update((st) => {
    st.tasks.push({ id: uid('t'), title: p.title, due: p.due, dueTime: p.dueTime, courseId: p.courseId ?? '', priority: p.priority, notes: '', done: false, createdAt: Date.now() });
  });
  toast(`„${p.title}“ hinzugefügt${p.due ? ` · ${relDayShort(p.due)}` : ''}`, { type: 'success' });
  return true;
}

export function toggleTask(id) {
  let nowDone = false, allDone = false;
  store.update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    nowDone = t.done;
    if (nowDone) {
      const d = today();
      const relevant = s.tasks.filter((x) => x.due && x.due <= d);
      allDone = relevant.length >= 2 && relevant.every((x) => x.done);
    }
  });
  if (!nowDone) return;
  if (store.state.settings.haptics) vibrate(15);
  if (allDone) {
    confetti();
    toast('Alles für heute erledigt! 🎉', { type: 'success', iconName: 'trophy' });
  } else {
    toast('Erledigt', { type: 'success', timeout: 2500, action: { label: 'Rückgängig', onClick: () => toggleTask(id) } });
  }
}

export function deleteTask(id) {
  removeWithUndo((s) => s.tasks, id, 'Aufgabe gelöscht');
}

/** Gemeinsame Zeile für Aufgabenlisten. */
export function taskRow(t, cm, { showDate = true } = {}) {
  const c = cm.get(t.courseId);
  const overdue = !t.done && t.due && t.due < today();
  return html`<div class="li ${t.done ? 'done' : ''}" data-key="${t.id}">
    <button class="check ${t.done ? 'done' : ''} ${t.priority && !t.done ? 'prio' : ''}" style="${c ? `--c:${c.color}` : ''}" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Wieder öffnen' : 'Als erledigt markieren'}">${icon('check')}</button>
    <div class="li-main li-clickable" data-action="edit-task" data-id="${t.id}" role="button" tabindex="0">
      <div class="li-title">${t.priority ? html`<span class="danger-text bold">${'!'.repeat(t.priority)} </span>` : ''}${t.title}</div>
      ${(showDate && t.due) || c || t.notes ? html`<div class="li-sub">
        ${showDate && t.due ? html`<span class="${overdue ? 'danger-text semi' : ''}">${icon('calendar')} ${relDayShort(t.due)}${t.dueTime ? ` · ${t.dueTime}` : ''}</span>` : ''}
        ${c ? html`<span><i class="dot" style="--c:${c.color}"></i> ${c.short || c.name}</span>` : ''}
        ${t.notes ? html`<span title="Hat Notizen">${icon('file')}</span>` : ''}
      </div>` : ''}
    </div>
    ${!t.done ? html`<button class="icon-btn sm" data-action="start-focus" data-label="${t.title}" data-course="${t.courseId ?? ''}" title="Fokus-Session für diese Aufgabe starten" aria-label="Fokus starten">${icon('timer')}</button>` : ''}
  </div>`;
}

export function quickAddForm(placeholder = 'Neue Aufgabe … z. B. „Blatt 4 #ana bis Fr !“') {
  return html`<form class="stack-sm" data-submit="qa-submit" autocomplete="off">
    <div class="quick-add">
      <div class="input-group" style="flex:1">${icon('plus')}<input class="input" name="qa" placeholder="${placeholder}" data-input="qa-preview" aria-label="Neue Aufgabe"></div>
      <button class="btn btn-primary" type="submit" aria-label="Hinzufügen">${icon('arrowRight')}</button>
    </div>
    <div class="qa-preview" data-qa-preview></div>
  </form>`;
}

export const quickAddActions = {
  'qa-preview': (c, el) => {
    const box = el.closest('form').querySelector('[data-qa-preview]');
    const p = parseQuickAdd(el.value, { courses: c.state.courses });
    box.innerHTML = el.value.trim() ? String(previewChips(p.parts, c.state.courses)) : '';
  },
  'qa-submit': (c, el) => {
    const input = el.querySelector('input[name=qa]');
    if (!input.value.trim()) { input.focus(); return; }
    if (addTaskFromText(input.value)) {
      input.value = '';
      el.querySelector('[data-qa-preview]').innerHTML = '';
    }
  },
};

/* ------------------------------ View ------------------------------ */

function filtered(state, f) {
  const t = state.tasks;
  if (f === 'today') return t.filter((x) => x.done ? false : x.due && x.due <= today());
  if (f === 'prio') return t.filter((x) => !x.done && x.priority > 0);
  if (f?.startsWith('c:')) return t.filter((x) => x.courseId === f.slice(2));
  return t;
}

export default {
  title: 'Aufgaben',
  render({ state, ui }) {
    const f = ui.filter ?? 'all';
    const cm = courseMap(state);
    const list = filtered(state, f);
    const g = groupTasks(list);
    const open = state.tasks.filter((t) => !t.done).length;
    const overdue = state.tasks.filter((t) => !t.done && t.due && t.due < today()).length;
    const usedCourses = state.courses.filter((c) => state.tasks.some((t) => t.courseId === c.id && !t.done));
    const order = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate'];
    const anyOpen = order.some((k) => g[k].length);
    return html`
      <header class="page-head">
        <div class="titles">
          <h1>Aufgaben</h1>
          <p class="page-sub">${plural(open, 'offene Aufgabe', 'offene Aufgaben')}${overdue ? html` · <span class="danger-text semi">${overdue} überfällig</span>` : ''}</p>
        </div>
        <div class="page-actions"><button class="btn btn-primary" data-action="new-task">${icon('plus')}<span class="hide-mobile">Aufgabe</span></button></div>
      </header>
      <div class="stack-lg">
        <div class="card">${quickAddForm()}</div>
        <div class="chips">
          ${[['all', 'Alle'], ['today', 'Heute fällig'], ['prio', 'Wichtig']].map(([k, l]) => html`<button class="chip ${f === k ? 'active' : ''}" data-action="filter" data-f="${k}">${l}</button>`)}
          ${usedCourses.map((c) => html`<button class="chip ${f === 'c:' + c.id ? 'active' : ''}" data-action="filter" data-f="c:${c.id}"><i class="dot" style="--c:${c.color}"></i>${c.short || c.name}</button>`)}
        </div>
        <div>
          ${!anyOpen ? html`<div class="card"><div class="empty">
              <div class="empty-icon">🎉</div>
              <h3>${state.tasks.length ? 'Alles erledigt!' : 'Noch keine Aufgaben'}</h3>
              <p>${state.tasks.length ? 'Gönn dir was. Oder plan schon mal das Nächste.' : 'Tipp oben einfach los – Datum, #Kurs und ! für wichtig werden automatisch erkannt.'}</p>
            </div></div>` : ''}
          ${order.filter((k) => g[k].length).map((k) => html`
            <div class="li-group ${k === 'overdue' ? 'danger' : ''}">${GROUP_LABELS[k]} <span class="count">${g[k].length}</span></div>
            <div class="card flush"><div class="list">${g[k].map((t) => taskRow(t, cm, { showDate: !['today', 'tomorrow'].includes(k) || !!t.dueTime }))}</div></div>`)}
          ${g.done.length ? html`
            <div class="li-group row-between"><span>Erledigt <span class="count">${g.done.length}</span></span>
              <span class="row"><button class="btn btn-xs btn-ghost" data-action="toggle-done">${ui.showDone ? 'Ausblenden' : 'Anzeigen'}</button>
              ${ui.showDone ? html`<button class="btn btn-xs btn-danger-ghost" data-action="clear-done">Aufräumen</button>` : ''}</span></div>
            ${ui.showDone ? html`<div class="card flush"><div class="list">${g.done.slice(0, 50).map((t) => taskRow(t, cm))}</div></div>` : ''}` : ''}
        </div>
      </div>`;
  },
  actions: {
    ...quickAddActions,
    filter: (c, el) => { c.ui.filter = el.dataset.f; c.rerender(); },
    'toggle-done': (c) => { c.ui.showDone = !c.ui.showDone; c.rerender(); },
    'clear-done': async (c) => {
      const n = c.state.tasks.filter((t) => t.done).length;
      if (!(await confirm({ title: 'Erledigte Aufgaben löschen?', message: `${n} erledigte Aufgaben werden endgültig entfernt.`, confirmLabel: 'Löschen', danger: true }))) return;
      store.update((s) => { s.tasks = s.tasks.filter((t) => !t.done); });
      toast('Aufgeräumt ✨', { type: 'success' });
    },
  },
};
