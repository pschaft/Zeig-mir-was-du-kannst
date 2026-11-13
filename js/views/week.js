// Woche: Stundenplan, Kurse, Termine & Prüfungen, ICS-Import/-Export.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { form, toast, confirm, menu, sheet } from '../core/ui.js';
import { uid, download, pickFile, sortBy } from '../core/util.js';
import { today, addDays, startOfWeek, weekday, isoWeek, fmtDate, WD, WEEKDAYS, timeToMin, nowMinutes, relDay, diffDays, MONTHS_SHORT, parseDate } from '../core/date.js';
import { plural } from '../core/format.js';
import { removeWithUndo, withUndo } from '../core/undo.js';
import { agendaFor, lectureWeek, courseMap, upcomingExams, WEEKS_LABEL, breakOn, inLecturePeriod, weeklyMinutes } from '../logic/timetable.js';
import { parseICS, analyzeICS, exportICS } from '../logic/ics.js';
import { COURSE_COLORS, SESSION_TYPES } from '../logic/state.js';
import { courseOptions } from './tasks.js';

/* ------------------------------ Formulare ------------------------------ */

function nextColor(state) {
  const used = new Set(state.courses.map((c) => c.color));
  return COURSE_COLORS.find((c) => !used.has(c)) ?? COURSE_COLORS[state.courses.length % COURSE_COLORS.length];
}

function shortFrom(name) {
  const words = name.replace(/[^\p{L}\d\s&]/gu, '').split(/\s+/).filter((w) => w.length > 2 || /\d|^[IVX]+$/.test(w));
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => (/^[IVX]+$|\d/.test(w) ? w : w[0])).join('').toUpperCase().slice(0, 5);
}

export async function courseForm(id, preset = {}) {
  const s = store.state;
  const c = id ? s.courses.find((x) => x.id === id) : null;
  const v = await form({
    title: c ? 'Kurs bearbeiten' : 'Neuer Kurs',
    fields: [
      { name: 'name', label: 'Name', value: c?.name ?? preset.name ?? '', required: true, autofocus: !c, placeholder: 'z. B. Analysis I' },
      { type: 'row', fields: [
        { name: 'short', label: 'Kürzel', value: c?.short ?? '', placeholder: 'automatisch', maxlength: 8 },
        { name: 'ects', label: 'ECTS', type: 'number', value: c?.ects ?? '', min: 0, max: 60 },
      ] },
      { name: 'color', label: 'Farbe', type: 'color', value: c?.color ?? nextColor(s) },
      { name: 'lecturer', label: 'Dozent:in', value: c?.lecturer ?? '', placeholder: 'optional' },
      { name: 'link', label: 'Link (Moodle, ILIAS …)', type: 'url', value: c?.link ?? '', placeholder: 'https://' },
      { name: 'notes', label: 'Notizen', type: 'textarea', rows: 2, value: c?.notes ?? '' },
    ],
    danger: c ? 'Kurs löschen' : null,
    submitLabel: c ? 'Speichern' : 'Kurs anlegen',
  });
  if (v === 'delete') return deleteCourse(id);
  if (!v) return null;
  const data = { ...v, short: v.short || shortFrom(v.name), ects: v.ects ?? null };
  let newId = id;
  store.update((st) => {
    if (c) Object.assign(st.courses.find((x) => x.id === id), data);
    else { newId = uid('c'); st.courses.push({ id: newId, ...data, createdAt: Date.now() }); }
  });
  toast(c ? 'Kurs gespeichert' : 'Kurs angelegt', { type: 'success' });
  return newId;
}

async function deleteCourse(id) {
  const s = store.state;
  const c = s.courses.find((x) => x.id === id);
  const n = s.sessions.filter((x) => x.courseId === id).length;
  if (!(await confirm({ title: `„${c.name}“ löschen?`, message: n ? `Auch ${plural(n, 'Termin', 'Termine')} im Stundenplan werden entfernt. Aufgaben, Karteikarten und Noten bleiben erhalten.` : 'Aufgaben, Karteikarten und Noten bleiben erhalten.', confirmLabel: 'Löschen', danger: true }))) return;
  withUndo((st) => {
    st.courses = st.courses.filter((x) => x.id !== id);
    st.sessions = st.sessions.filter((x) => x.courseId !== id);
  }, 'Kurs gelöscht');
}

export async function sessionForm(id, preset = {}) {
  const s = store.state;
  const se = id ? s.sessions.find((x) => x.id === id) : null;
  const opts = [...s.courses.map((c) => ({ value: c.id, label: c.name })), { value: '__new', label: '＋ Neuer Kurs …' }];
  const v = await form({
    title: se ? 'Termin bearbeiten' : 'Veranstaltung hinzufügen',
    fields: [
      { name: 'courseId', label: 'Kurs', type: 'select', options: opts, value: se?.courseId ?? preset.courseId ?? (s.courses[0]?.id ?? '__new') },
      { name: 'newCourse', label: 'Name des neuen Kurses', placeholder: 'z. B. Lineare Algebra', show: (x) => x.courseId === '__new' },
      { name: 'type', label: 'Art', type: 'select', options: SESSION_TYPES.map((t) => ({ value: t, label: t })), value: se?.type ?? 'Vorlesung' },
      { name: 'weekday', label: 'Wochentag', type: 'segmented', options: WD.slice(0, 6).map((d, i) => ({ value: i, label: d })), value: se?.weekday ?? preset.weekday ?? 0 },
      { type: 'row', fields: [
        { name: 'start', label: 'Beginn', type: 'time', value: se?.start ?? preset.start ?? '10:15', required: true },
        { name: 'end', label: 'Ende', type: 'time', value: se?.end ?? preset.end ?? '11:45', required: true },
      ] },
      { name: 'room', label: 'Raum', value: se?.room ?? '', placeholder: 'z. B. HS 1 / Geb. 50.34' },
      { name: 'weeks', label: 'Rhythmus', type: 'segmented', options: Object.entries(WEEKS_LABEL).map(([k, l]) => ({ value: k, label: l })), value: se?.weeks ?? 'all' },
    ],
    validate: (x) => {
      if (x.courseId === '__new' && !x.newCourse) return { newCourse: 'Bitte Kursnamen angeben' };
      if (timeToMin(x.end) <= timeToMin(x.start)) return { end: 'Ende muss nach dem Beginn liegen' };
      return null;
    },
    danger: se ? 'Löschen' : null,
    submitLabel: se ? 'Speichern' : 'Hinzufügen',
  });
  if (v === 'delete') return removeWithUndo((st) => st.sessions, id, 'Termin gelöscht');
  if (!v) return;
  let courseId = v.courseId;
  if (courseId === '__new') {
    courseId = uid('c');
    store.update((st) => st.courses.push({ id: courseId, name: v.newCourse, short: shortFrom(v.newCourse), color: nextColor(st), createdAt: Date.now() }));
  }
  const data = { courseId, type: v.type, weekday: Number(v.weekday), start: v.start, end: v.end, room: v.room, weeks: v.weeks };
  store.update((st) => {
    if (se) Object.assign(st.sessions.find((x) => x.id === id), data);
    else st.sessions.push({ id: uid('s'), ...data, cancelled: [] });
  });
  toast(se ? 'Gespeichert' : 'Zum Stundenplan hinzugefügt', { type: 'success' });
}

export async function eventForm(id, preset = {}) {
  const s = store.state;
  const e = id ? s.events.find((x) => x.id === id) : null;
  const kind = e?.kind ?? preset.kind ?? 'event';
  const v = await form({
    title: e ? (kind === 'exam' ? 'Prüfung bearbeiten' : 'Termin bearbeiten') : kind === 'exam' ? 'Neue Prüfung' : 'Neuer Termin',
    fields: [
      { name: 'kind', label: 'Art', type: 'segmented', options: [{ value: 'exam', label: '📝 Prüfung' }, { value: 'event', label: '📅 Termin' }], value: kind },
      { name: 'courseId', label: 'Kurs', type: 'select', options: courseOptions(s, 'Kein Kurs'), value: e?.courseId ?? preset.courseId ?? '' },
      { name: 'title', label: 'Titel', value: e?.title ?? preset.title ?? '', placeholder: kind === 'exam' ? 'leer = Kursname' : 'z. B. Sprechstunde', autofocus: !e },
      { name: 'date', label: 'Datum', type: 'date', value: e?.date ?? preset.date ?? '', required: true },
      { type: 'row', fields: [
        { name: 'start', label: 'Beginn', type: 'time', value: e?.start ?? '' },
        { name: 'end', label: 'Ende', type: 'time', value: e?.end ?? '' },
      ] },
      { name: 'room', label: 'Ort / Raum', value: e?.room ?? '' },
      { name: 'notes', label: 'Notizen', type: 'textarea', rows: 2, value: e?.notes ?? '', placeholder: 'z. B. erlaubte Hilfsmittel, Anmeldefrist …' },
    ],
    validate: (x) => (!x.title && !x.courseId ? { title: 'Titel oder Kurs angeben' } : null),
    danger: e ? 'Löschen' : null,
    submitLabel: e ? 'Speichern' : 'Hinzufügen',
  });
  if (v === 'delete') return removeWithUndo((st) => st.events, id, 'Termin gelöscht');
  if (!v) return;
  const title = v.title || s.courses.find((c) => c.id === v.courseId)?.name || 'Termin';
  const data = { kind: v.kind, courseId: v.courseId, title, date: v.date, start: v.start, end: v.end, room: v.room, notes: v.notes };
  store.update((st) => {
    if (e) Object.assign(st.events.find((x) => x.id === id), data);
    else st.events.push({ id: uid('e'), ...data, createdAt: Date.now() });
  });
  toast(e ? 'Gespeichert' : v.kind === 'exam' ? 'Prüfung eingetragen – viel Erfolg! 🍀' : 'Termin eingetragen', { type: 'success' });
}

export function sessionMenu(id, date) {
  const s = store.state;
  const se = s.sessions.find((x) => x.id === id);
  if (!se) return eventForm(id);
  const c = s.courses.find((x) => x.id === se.courseId);
  const cancelled = (se.cancelled ?? []).includes(date);
  menu({
    title: `${c?.name ?? 'Veranstaltung'} · ${se.type}`,
    items: [
      date && {
        icon: cancelled ? 'repeat' : 'x', label: cancelled ? 'Findet doch statt' : `Fällt am ${fmtDate(date)} aus`, color: '#e5484d',
        onClick: () => store.update((st) => {
          const x = st.sessions.find((y) => y.id === id);
          x.cancelled = cancelled ? (x.cancelled ?? []).filter((d) => d !== date) : [...(x.cancelled ?? []), date];
        }),
      },
      { icon: 'tasks', label: 'Aufgabe für diesen Kurs', color: '#5b5bd6', onClick: async () => (await import('./tasks.js')).taskForm(null, { courseId: se.courseId }) },
      { icon: 'timer', label: 'Fokus-Session starten', color: '#12a594', onClick: async () => { (await import('../core/router.js')).navigate('fokus'); (await import('../services/timer.js')).timer.start({ mode: 'work', label: c?.name ?? '', courseId: se.courseId }); } },
      { icon: 'edit', label: 'Termin bearbeiten', color: '#687076', onClick: () => sessionForm(id) },
      c && { icon: 'book', label: 'Kurs bearbeiten', color: c.color, onClick: () => courseForm(c.id) },
      c?.link && { icon: 'external', label: 'Kurs-Link öffnen', color: '#0b84e3', onClick: () => window.open(c.link, '_blank', 'noopener') },
    ],
  });
}

/* ------------------------------ ICS-Import ------------------------------ */

async function importICS() {
  const f = await pickFile('.ics,text/calendar');
  if (!f) return;
  let result;
  try { result = analyzeICS(parseICS(f.text)); } catch (e) { toast('Datei konnte nicht gelesen werden', { type: 'error' }); return; }
  if (!result.sessions.length && !result.singles.length) { toast('Keine Termine in der Datei gefunden', { type: 'error' }); return; }
  const s = store.state;
  const body = html`
    <p class="muted small mb-12">Gefunden in <b>${f.name}</b>: ${plural(result.sessions.length, 'regelmäßige Veranstaltung', 'regelmäßige Veranstaltungen')}, ${plural(result.singles.length, 'Einzeltermin', 'Einzeltermine')}. Wähle aus, was übernommen werden soll.</p>
    ${result.sessions.length ? html`<div class="section-title">Stundenplan</div>
      <div class="list">${result.sessions.map((x, i) => html`<label class="li" style="cursor:pointer">
        <input type="checkbox" name="s" value="${i}" checked style="width:20px;height:20px;accent-color:var(--accent)">
        <div class="li-main"><div class="li-title">${x.course}</div><div class="li-sub"><span>${x.type}</span><span>${WD[x.weekday]} ${x.start}–${x.end}</span>${x.room ? html`<span>${x.room}</span>` : ''}${x.weeks !== 'all' ? html`<span>14-tägig</span>` : ''}</div></div>
      </label>`)}</div>` : ''}
    ${result.singles.length ? html`<div class="section-title">Einzeltermine & Prüfungen</div>
      <div class="list">${result.singles.slice(0, 80).map((x, i) => html`<label class="li" style="cursor:pointer">
        <input type="checkbox" name="e" value="${i}" ${x.date >= today() ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">
        <div class="li-main"><div class="li-title">${x.kind === 'exam' ? '📝 ' : ''}${x.title}</div><div class="li-sub"><span>${fmtDate(x.date, 'numeric')}${x.start ? ` · ${x.start}` : ''}</span>${x.room ? html`<span>${x.room}</span>` : ''}</div></div>
      </label>`)}</div>` : ''}
    ${s.sessions.length ? html`<div class="banner info mt-16">${icon('info')}<span>Bestehende Termine bleiben erhalten. Kurse mit gleichem Namen werden zusammengeführt.</span></div>` : ''}`;
  const foot = html`<span class="spacer"></span><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-import>Übernehmen</button>`;
  sheet({
    title: 'Kalender importieren', body, foot, wide: true,
    onMount: (el, close) => {
      el.querySelector('[data-import]').addEventListener('click', () => {
        const si = [...el.querySelectorAll('input[name=s]:checked')].map((x) => result.sessions[Number(x.value)]);
        const ei = [...el.querySelectorAll('input[name=e]:checked')].map((x) => result.singles[Number(x.value)]);
        let nc = 0;
        store.update((st) => {
          const byName = new Map(st.courses.map((c) => [c.name.toLowerCase(), c]));
          const ensure = (name) => {
            if (!name) return '';
            const k = name.toLowerCase();
            if (!byName.has(k)) {
              const c = { id: uid('c'), name, short: shortFrom(name), color: nextColor(st), createdAt: Date.now() };
              st.courses.push(c);
              byName.set(k, c);
              nc++;
            }
            return byName.get(k).id;
          };
          for (const x of si) st.sessions.push({ id: uid('s'), courseId: ensure(x.course), type: x.type, weekday: x.weekday, start: x.start, end: x.end, room: x.room, weeks: x.weeks, cancelled: [] });
          for (const x of ei) st.events.push({ id: uid('e'), kind: x.kind, title: x.title, date: x.date, start: x.start ?? '', end: x.end ?? '', room: x.room, notes: x.notes, courseId: x.course ? ensure(x.course) : '', createdAt: Date.now() });
        });
        close();
        toast(`Importiert: ${si.length} Veranstaltungen, ${ei.length} Termine${nc ? `, ${nc} neue Kurse` : ''}`, { type: 'success' });
      });
    },
  });
}

/* ------------------------------ Darstellung ------------------------------ */

function layoutDay(items) {
  // Überlappende Termine nebeneinander anordnen
  const sorted = [...items].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  const cols = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((x) => x._col)) + 1; cluster.forEach((x) => { x._cols = n; }); cluster = []; };
  for (const it of sorted) {
    const s = timeToMin(it.start), e = timeToMin(it.end) || s + 60;
    if (s >= clusterEnd && cluster.length) { flush(); cols.length = 0; }
    let ci = cols.findIndex((end) => end <= s);
    if (ci < 0) { ci = cols.length; cols.push(e); } else cols[ci] = e;
    it._col = ci;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return sorted;
}

function gridView(state, days, base) {
  const all = days.map((d) => agendaFor(state, d).filter((x) => x.start));
  let minH = 8, maxH = 18;
  for (const list of all) for (const it of list) {
    minH = Math.min(minH, Math.floor(timeToMin(it.start) / 60));
    maxH = Math.max(maxH, Math.ceil((timeToMin(it.end) || timeToMin(it.start) + 60) / 60));
  }
  const HOUR = 52;
  const height = (maxH - minH) * HOUR;
  const nowM = nowMinutes();
  return html`<div class="card flush"><div class="week-grid-wrap"><div class="week-grid" style="--days:${days.length};--hour:${HOUR}px">
    <div class="wg-head" style="background:var(--surface)"></div>
    ${days.map((d) => html`<div class="wg-head ${d === base ? 'today' : ''}"><div class="wgh-name">${WD[weekday(d)]}</div><div class="wgh-num">${parseDate(d).getDate()}</div></div>`)}
    <div class="wg-times" style="height:${height}px">${Array.from({ length: maxH - minH }, (_, i) => html`<span class="wg-time" style="top:${i * HOUR}px">${i ? `${minH + i}:00` : ''}</span>`)}</div>
    ${days.map((d, di) => {
      const items = layoutDay(all[di]);
      const brk = breakOn(state.semester, d);
      return html`<div class="wg-col ${d === base ? 'today' : ''}" style="height:${height}px">
        ${brk && !items.length ? html`<div class="center tiny muted" style="padding-top:12px">${brk.name}</div>` : ''}
        ${items.map((it) => {
          const top = ((timeToMin(it.start) - minH * 60) / 60) * HOUR;
          const h = Math.max(26, (((timeToMin(it.end) || timeToMin(it.start) + 60) - timeToMin(it.start)) / 60) * HOUR - 3);
          const w = 100 / it._cols;
          return html`<div class="wg-slot ${it.kind === 'exam' ? 'exam' : ''} ${it.cancelled ? 'cancelled' : ''}" style="--c:${it.color};top:${top}px;height:${h}px;left:calc(${it._col * w}% + 3px);right:auto;width:calc(${w}% - 6px)"
            data-action="${it.kind === 'session' ? 'session-menu' : 'edit-event'}" data-id="${it.id}" data-date="${d}" title="${it.title} ${it.start}–${it.end}">
            <div class="ws-title">${it.kind === 'exam' ? '📝 ' : ''}${it.short && w < 100 ? it.short : it.title}</div>
            <div class="ws-sub">${it.start}–${it.end}${it.room ? ` · ${it.room}` : ''}</div>
            ${h > 70 && it.kind === 'session' ? html`<div class="ws-sub">${it.type}</div>` : ''}
          </div>`;
        })}
        ${d === base && nowM >= minH * 60 && nowM <= maxH * 60 ? html`<div class="wg-now" style="top:${((nowM - minH * 60) / 60) * HOUR}px"></div>` : ''}
      </div>`;
    })}
  </div></div></div>`;
}

function dayList(state, d) {
  const items = agendaFor(state, d);
  const brk = breakOn(state.semester, d);
  const outside = !inLecturePeriod(state.semester, d);
  const base = today();
  const nowM = nowMinutes();
  if (!items.length) {
    return html`<div class="card"><div class="empty compact">
      <div class="empty-icon">${brk ? '🎄' : outside ? '🏖️' : '☀️'}</div>
      <h3>${brk ? brk.name : outside ? 'Vorlesungsfreie Zeit' : 'Nichts geplant'}</h3>
      <p>${brk || outside ? 'Keine Lehrveranstaltungen an diesem Tag.' : 'Frei! Zeit für Selbststudium, Sport oder Mensa-Marathon.'}</p>
    </div></div>`;
  }
  return html`<div class="card flush"><div class="list session-list">${items.map((it) => {
    const past = d < base || (d === base && it.end && timeToMin(it.end) < nowM);
    return html`<div class="li li-clickable ${past ? 'faint' : ''}" style="opacity:${past ? 0.55 : 1}" data-key="${it.id}" data-action="${it.kind === 'session' ? 'session-menu' : 'edit-event'}" data-id="${it.id}" data-date="${d}">
      <div class="num semi small" style="width:46px;text-align:right;flex:none">${it.start || 'ganztags'}<div class="tiny muted">${it.end}</div></div>
      <span class="li-bar" style="--c:${it.color}"></span>
      <div class="li-main">
        <div class="li-title" style="${it.cancelled ? 'text-decoration:line-through;color:var(--muted)' : ''}">${it.kind === 'exam' ? '📝 ' : ''}${it.title}</div>
        <div class="li-sub"><span class="type-tag">${it.cancelled ? 'Fällt aus' : it.type}</span>${it.room ? html`<span>${icon('pin')} ${it.room}</span>` : ''}</div>
      </div>
      ${icon('chevronRight', 'sm faint')}
    </div>`;
  })}</div></div>`;
}

export default {
  title: 'Woche',
  render({ state, ui }) {
    const base = today();
    ui.offset ??= 0;
    const weekStart = addDays(startOfWeek(base), ui.offset * 7);
    const hasWeekendItems = [5, 6].some((i) => agendaFor(state, addDays(weekStart, i)).length);
    const nDays = state.settings.showWeekend || hasWeekendItems ? 7 : 5;
    const days = Array.from({ length: nDays }, (_, i) => addDays(weekStart, i));
    ui.day ??= days.includes(base) ? base : days[0];
    if (!days.includes(ui.day)) ui.day = days.includes(base) ? base : days[0];
    const lw = lectureWeek(state.semester, weekStart < state.semester.lectureStart ? addDays(weekStart, 4) : weekStart);
    const kw = isoWeek(weekStart);
    const end = days.at(-1);
    const sd = parseDate(weekStart), ed = parseDate(end);
    const range = sd.getMonth() === ed.getMonth() ? `${sd.getDate()}.–${ed.getDate()}. ${MONTHS_SHORT[ed.getMonth()]}` : `${sd.getDate()}. ${MONTHS_SHORT[sd.getMonth()]} – ${ed.getDate()}. ${MONTHS_SHORT[ed.getMonth()]}`;
    const exams = upcomingExams(state, base, 6);
    const otherEvents = state.events.filter((e) => e.kind !== 'exam' && e.date >= base).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const view = ui.view ?? (state.settings.weekView === 'auto' ? null : state.settings.weekView);
    const sessionsByCourse = (id) => state.sessions.filter((x) => x.courseId === id).length;

    return html`
      <header class="page-head">
        <div class="titles"><h1>Woche</h1>
          <p class="page-sub">${state.sessions.length ? `${plural(state.sessions.length, 'Termin', 'Termine')} pro Woche · ${Math.round(weeklyMinutes(state) / 45)} SWS` : 'Dein Stundenplan'}</p></div>
        <div class="page-actions">
          <button class="icon-btn filled" data-action="week-more" aria-label="Mehr">${icon('more')}</button>
          <button class="btn btn-primary" data-action="new-session">${icon('plus')}<span class="hide-mobile">Veranstaltung</span></button>
        </div>
      </header>

      ${!state.sessions.length && !state.events.length ? html`<div class="card mb-16"><div class="empty">
        <div class="empty-icon">${icon('calendar')}</div>
        <h3>Stundenplan einrichten</h3>
        <p>Trag deine Veranstaltungen ein – oder importiere eine .ics-Datei aus deinem Uni-Portal (HISinOne, LSF, TUMonline, Stud.IP …).</p>
        <div class="row wrap" style="justify-content:center"><button class="btn btn-primary" data-action="new-session">${icon('plus')} Veranstaltung</button><button class="btn btn-soft" data-action="import-ics">${icon('upload')} .ics importieren</button></div>
      </div></div>` : ''}

      <div class="week-nav">
        <button class="icon-btn filled" data-action="week-shift" data-d="-1" aria-label="Vorherige Woche">${icon('chevronLeft')}</button>
        <div class="wn-title">${range}<span class="wn-sub">KW ${kw}${lw?.week ? ` · Vorlesungswoche ${lw.week}/${lw.total}` : ''}${ui.offset ? '' : ' · diese Woche'}</span></div>
        ${ui.offset ? html`<button class="btn btn-sm btn-soft" data-action="week-today">Heute</button>` : ''}
        <button class="icon-btn filled" data-action="week-shift" data-d="1" aria-label="Nächste Woche">${icon('chevronRight')}</button>
      </div>

      <div class="${view === 'grid' ? 'hide' : view === 'list' ? '' : 'hide-desktop'}">
        <div class="day-tabs" style="--days:${nDays}">${days.map((d) => {
          const items = agendaFor(state, d).filter((x) => !x.cancelled);
          return html`<button class="day-tab ${d === ui.day ? 'active' : ''} ${d === base ? 'today' : ''}" data-action="pick-day" data-d="${d}">
            <div class="dt-name">${WD[weekday(d)]}</div><div class="dt-num">${parseDate(d).getDate()}</div>
            <div class="dt-dots">${items.slice(0, 4).map((x) => html`<i style="--c:${x.color}"></i>`)}</div>
          </button>`;
        })}</div>
        <div class="row-between mb-8"><h3>${relDay(ui.day) === WEEKDAYS[weekday(ui.day)] ? WEEKDAYS[weekday(ui.day)] : `${relDay(ui.day)}`}, ${fmtDate(ui.day, 'dm')}</h3>
          <button class="btn btn-xs btn-ghost" data-action="new-event" data-date="${ui.day}">${icon('plus')} Termin</button></div>
        ${dayList(state, ui.day)}
      </div>
      <div class="${view === 'list' ? 'hide' : view === 'grid' ? '' : 'hide-mobile'}">${gridView(state, days, base)}</div>

      <div class="grid grid-2 mt-24">
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('flag')} Prüfungen</span><button class="card-link" data-action="new-event" data-kind="exam">${icon('plus')} Neu</button></div>
          ${exams.length ? html`<div class="list">${exams.map((e) => {
            const c = state.courses.find((x) => x.id === e.courseId);
            const n = diffDays(base, e.date);
            return html`<div class="li li-clickable" data-action="edit-event" data-id="${e.id}" data-key="${e.id}">
              <span class="li-bar" style="--c:${c?.color ?? '#e5484d'}"></span>
              <div class="li-main"><div class="li-title">${e.title}</div><div class="li-sub"><span>${fmtDate(e.date)}${e.start ? ` · ${e.start}` : ''}</span>${e.room ? html`<span>${e.room}</span>` : ''}</div></div>
              <span class="badge ${n <= 7 ? 'badge-danger' : n <= 21 ? 'badge-warning' : ''}">${n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} T`}</span>
            </div>`;
          })}</div>` : html`<p class="muted small">Keine anstehenden Prüfungen eingetragen.</p>`}
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('book')} Kurse</span><button class="card-link" data-action="new-course">${icon('plus')} Neu</button></div>
          ${state.courses.length ? html`<div class="list">${sortBy(state.courses, (c) => c.name.toLowerCase()).map((c) => html`
            <div class="li li-clickable course-row" data-action="edit-course" data-id="${c.id}" data-key="${c.id}">
              <i class="dot" style="--c:${c.color}"></i>
              <div class="li-main"><div class="li-title">${c.name}</div><div class="li-sub"><span>${c.short}</span>${c.ects ? html`<span>${c.ects} ECTS</span>` : ''}<span>${plural(sessionsByCourse(c.id), 'Termin', 'Termine')}/Woche</span>${c.lecturer ? html`<span>${c.lecturer}</span>` : ''}</div></div>
              ${icon('chevronRight', 'sm faint')}
            </div>`)}</div>` : html`<p class="muted small">Kurse entstehen automatisch, wenn du Veranstaltungen anlegst.</p>`}
        </section>
        ${otherEvents.length ? html`<section class="card">
          <div class="card-head"><span class="card-title">${icon('calendar')} Weitere Termine</span></div>
          <div class="list">${otherEvents.map((e) => html`<div class="li li-clickable" data-action="edit-event" data-id="${e.id}" data-key="${e.id}">
            <div class="li-main"><div class="li-title">${e.title}</div><div class="li-sub"><span>${relDay(e.date)} · ${fmtDate(e.date)}${e.start ? ` · ${e.start}` : ''}</span>${e.room ? html`<span>${e.room}</span>` : ''}</div></div>
          </div>`)}</div>
        </section>` : ''}
      </div>`;
  },
  actions: {
    'week-shift': (c, el) => { c.ui.offset = (c.ui.offset ?? 0) + Number(el.dataset.d); c.ui.day = null; c.rerender(); },
    'week-today': (c) => { c.ui.offset = 0; c.ui.day = today(); c.rerender(); },
    'pick-day': (c, el) => { c.ui.day = el.dataset.d; c.rerender(); },
    'new-session': (c) => sessionForm(null, { weekday: c.ui.day ? Math.min(5, weekday(c.ui.day)) : 0 }),
    'new-course': () => courseForm(null),
    'edit-course': (c, el) => courseForm(el.dataset.id),
    'import-ics': () => importICS(),
    'week-more': (c) => menu({
      title: 'Stundenplan',
      items: [
        { icon: 'upload', label: 'Kalender importieren (.ics)', sub: 'Aus HISinOne, LSF, TUMonline, Stud.IP, Google …', color: '#0b84e3', onClick: importICS },
        { icon: 'download', label: 'Als Kalender exportieren', sub: 'Stundenplan, Prüfungen & Aufgaben → Handy-Kalender', color: '#2f9e5b', onClick: () => { download('unikram.ics', exportICS(store.state), 'text/calendar'); toast('Kalenderdatei erstellt – einfach öffnen oder importieren', { type: 'success' }); } },
        { icon: 'grid', label: c.ui.view === 'grid' ? 'Automatische Ansicht' : 'Rasteransicht erzwingen', color: '#8e4ec6', onClick: () => { c.ui.view = c.ui.view === 'grid' ? null : 'grid'; c.rerender(); } },
        { icon: 'list', label: c.ui.view === 'list' ? 'Automatische Ansicht' : 'Listenansicht erzwingen', color: '#d99a00', onClick: () => { c.ui.view = c.ui.view === 'list' ? null : 'list'; c.rerender(); } },
        { icon: 'calendar', label: store.state.settings.showWeekend ? 'Wochenende ausblenden' : 'Wochenende anzeigen', color: '#687076', onClick: () => store.update((s) => { s.settings.showWeekend = !s.settings.showWeekend; }) },
        { icon: 'settings', label: 'Semesterdaten & Ferien', color: '#5b5bd6', onClick: async () => (await import('../core/router.js')).navigate('einstellungen') },
      ],
    }),
  },
};
