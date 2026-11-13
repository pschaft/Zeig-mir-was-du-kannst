// Heute: alles Wichtige auf einen Blick.
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { ring } from '../core/charts.js';
import { today, fmtDate, greeting, nowMinutes, timeToMin, fmtIn, diffDays, monthKey, relDay, addDays } from '../core/date.js';
import { fmtMoney, fmtMinutes, plural, fmtClock } from '../core/format.js';
import { remainingMs } from '../services/timer.js';
import { agendaFor, nextUp, lectureWeek, semesterProgress, upcomingExams, courseMap, breakOn, inLecturePeriod } from '../logic/timetable.js';
import { upcomingTasks } from '../logic/tasks.js';
import { minutesOn, streak as focusStreak } from '../logic/focus.js';
import { dueCounts } from '../logic/srs.js';
import { monthSummary } from '../logic/budget.js';
import { isScheduled, isDone, currentStreak } from '../logic/habits.js';
import { examProgress, KIND_META } from '../logic/planner.js';
import { taskRow, quickAddForm, quickAddActions } from './tasks.js';

const TIPS = [
  ['Active Recall', 'Statt nochmal zu lesen: Buch zu und aufschreiben, was du noch weißt. Das Abrufen selbst festigt das Wissen.'],
  ['Feynman-Methode', 'Erklär das Thema so, als würdest du es einem 12-Jährigen beibringen. Wo du stockst, liegt deine Lücke.'],
  ['Pomodoro', '25 Minuten Fokus, 5 Minuten Pause. Handy in einen anderen Raum – das bringt mehr als jede App.'],
  ['Verteiltes Lernen', '4× 1 Stunde über eine Woche verteilt schlägt 4 Stunden am Stück. Deine Karteikarten erledigen das Timing für dich.'],
  ['Interleaving', 'Misch Aufgabentypen beim Üben. Fühlt sich schwerer an, wirkt aber deutlich besser in der Klausur.'],
  ['Altklausuren', 'Rechne Altklausuren unter echten Bedingungen: Zeit stoppen, nur erlaubte Hilfsmittel.'],
  ['Schlaf', 'Im Schlaf wird Gelerntes gefestigt. Eine Nacht durchlernen kostet mehr, als sie bringt.'],
  ['2-Minuten-Regel', 'Wenn etwas weniger als 2 Minuten dauert (Mail beantworten, Formular abschicken): sofort erledigen.'],
  ['Eat the Frog', 'Die unangenehmste Aufgabe zuerst. Danach fühlt sich der Rest des Tages leicht an.'],
  ['Lerngruppe', 'Gegenseitig abfragen deckt Lücken auf, die man allein nie bemerkt. Und Pizza schmeckt zusammen besser.'],
  ['Mensa-Strategie', 'Wer um 11:30 oder nach 13:30 geht, spart sich die Schlange – und hat mehr Zeit für die Mittagspause.'],
  ['Budget-Trick', 'Rechne Ausgaben in Mensa-Essen um. 15 € Lieferdienst = 5 Mensa-Mittagessen. Wirkt Wunder.'],
  ['Erst Überblick', 'Vor dem Detail-Lernen: 10 Minuten Inhaltsverzeichnis und Zusammenfassungen. Dein Gehirn braucht ein Gerüst.'],
  ['Bewegung', 'Ein 10-minütiger Spaziergang zwischen Lernblöcken steigert die Konzentration messbar.'],
  ['Prokrastination', 'Nimm dir nur 5 Minuten vor. Anfangen ist der schwerste Teil – danach läuft es meistens von allein.'],
];

function semesterLine(state) {
  const sem = state.semester;
  if (!sem?.lectureStart) return '';
  const d = today();
  const lw = lectureWeek(sem, d);
  const p = semesterProgress(sem, d);
  const brk = breakOn(sem, d);
  let label;
  if (brk) label = `${brk.name} 🎄`;
  else if (lw?.week) label = `${sem.name} · Woche ${lw.week} von ${lw.total}`;
  else if (d < sem.lectureStart) label = `${sem.name} · Vorlesungsbeginn ${relDay(sem.lectureStart).toLowerCase().startsWith('in') ? relDay(sem.lectureStart) : 'am ' + fmtDate(sem.lectureStart, 'dm')}`;
  else label = `${sem.name} · vorlesungsfreie Zeit`;
  return html`<div class="sem-progress">${p != null ? html`<div class="progress sm"><div class="progress-bar" style="width:${Math.round(p * 100)}%"></div></div>` : ''}<span>${label}</span></div>`;
}

function classCard(state) {
  const base = today();
  const { current, next } = nextUp(state);
  const items = agendaFor(state, base);
  const nowM = nowMinutes();
  if (!state.sessions.length && !items.length) {
    return html`<section class="card">
      <div class="card-head"><span class="card-title">${icon('calendar')} Stundenplan</span></div>
      <div class="empty compact"><p>Noch keine Veranstaltungen. Trag sie ein oder importiere eine .ics-Datei aus dem Uni-Portal.</p>
      <button class="btn btn-soft btn-sm" data-action="go" data-to="woche">Stundenplan einrichten</button></div>
    </section>`;
  }
  const hero = current ?? next;
  const isNow = !!current;
  let when = '';
  if (isNow) when = `Läuft gerade · noch ${current.minutesLeft} Min`;
  else if (next) when = next.dayOffset === 0 ? `Heute · ${fmtIn(next.inMinutes)}` : next.dayOffset === 1 ? `Morgen · ${next.start}` : `${relDay(next.date)} · ${next.start}`;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('clock')} ${isNow ? 'Jetzt' : 'Als Nächstes'}</span><a class="card-link" href="#/woche">Woche ${icon('chevronRight')}</a></div>
    ${hero ? html`<div class="next-class" style="--c:${hero.color};--c-text:color-mix(in srgb, ${hero.color} 80%, var(--text))">
      <div class="bar"></div>
      <div style="min-width:0">
        <div class="nc-time">${when}</div>
        <div class="nc-title">${hero.kind === 'exam' ? '📝 ' : ''}${hero.title}</div>
        <div class="nc-meta"><span>${icon('clock')} ${hero.start}–${hero.end}</span>${hero.room ? html`<span>${icon('pin')} ${hero.room}</span>` : ''}<span>${hero.type}</span></div>
      </div>
    </div>` : html`<p class="muted">In den nächsten Wochen steht nichts an. 🌴</p>`}
    ${items.length ? html`<div class="timeline">${items.map((it) => {
      const s = timeToMin(it.start), e = timeToMin(it.end) || s + 90;
      const state2 = it.start && e < nowM ? 'past' : it.start && s <= nowM && nowM < e ? 'now' : '';
      return html`<div class="tl-item ${state2} ${it.cancelled ? 'cancelled' : ''} li-clickable" style="--c:${it.color}" data-action="${it.kind === 'session' ? 'session-menu' : 'edit-event'}" data-id="${it.id}" data-date="${base}">
        <span class="tl-time">${it.start || '–'}</span><span class="tl-bar"></span>
        <div><div class="tl-title">${it.title}</div><div class="tl-sub">${it.cancelled ? 'Fällt aus' : `${it.type}${it.room ? ` · ${it.room}` : ''}`}</div></div>
      </div>`;
    })}</div>` : html`<p class="muted small mt-12">${breakOn(state.semester, base) ? breakOn(state.semester, base).name : !inLecturePeriod(state.semester, base) ? 'Vorlesungsfreie Zeit' : 'Heute keine Veranstaltungen.'}</p>`}
  </section>`;
}

function tasksCard(state) {
  const cm = courseMap(state);
  const list = upcomingTasks(state.tasks, 2).slice(0, 7);
  const noDate = state.tasks.filter((t) => !t.done && !t.due && t.priority > 0).slice(0, 3);
  const doneToday = state.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= new Date().setHours(0, 0, 0, 0)).length;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('tasks')} Aufgaben</span>${doneToday ? html`<span class="badge badge-success">${doneToday} heute erledigt</span>` : ''}<a class="card-link" href="#/aufgaben">Alle ${icon('chevronRight')}</a></div>
    ${quickAddForm('Was steht an? z. B. „Blatt 4 bis Fr“')}
    ${list.length || noDate.length ? html`<div class="list mt-8">${[...list, ...noDate].map((t) => taskRow(t, cm))}</div>`
      : html`<p class="muted small mt-12">Nichts Dringendes in den nächsten Tagen. 👌</p>`}
  </section>`;
}

function examsCard(state) {
  const exams = upcomingExams(state, today(), 4);
  if (!exams.length) return '';
  const cm = courseMap(state);
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('flag')} Prüfungs-Countdown</span><a class="card-link" href="#/lernplan">Lernplan ${icon('chevronRight')}</a></div>
    <div class="countdowns">${exams.map((e) => {
      const n = diffDays(today(), e.date);
      const c = cm.get(e.courseId);
      const prog = examProgress(state.plan.blocks, e.id);
      return html`<div class="countdown" style="--c:${c?.color ?? '#e5484d'}" data-action="edit-event" data-id="${e.id}">
        <div><span class="cd-days">${n}</span><span class="cd-unit">${n === 1 ? 'Tag' : 'Tage'}</span></div>
        <div class="cd-title">${e.title}</div>
        <div class="cd-sub">${fmtDate(e.date)}${e.start ? ` · ${e.start}` : ''}</div>
        ${prog.total ? html`<div class="progress sm mt-8" style="--c:${c?.color ?? '#e5484d'}"><div class="progress-bar" style="width:${Math.round(prog.ratio * 100)}%"></div></div>` : ''}
      </div>`;
    })}</div>
  </section>`;
}

function focusCard(state) {
  const goal = state.focus.settings.dailyGoal;
  const m = minutesOn(state.focus.sessions, today());
  const st = focusStreak(state.focus.sessions);
  const t = state.focus.timer;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('timer')} Fokus</span><a class="card-link" href="#/fokus">Statistik ${icon('chevronRight')}</a></div>
    <div class="mini-stat">
      ${ring({ value: m / goal, size: 76, thickness: 8, center: html`<div class="bold num" style="font-size:15px">${Math.round((m / goal) * 100)}%</div>` })}
      <div style="flex:1;min-width:0">
        <div class="stat-value sm">${fmtMinutes(m)}</div>
        <div class="stat-label">von ${fmtMinutes(goal)} Tagesziel${st > 1 ? ` · 🔥 ${st} Tage in Folge` : ''}</div>
      </div>
    </div>
    ${t.status !== 'idle'
      ? html`<a class="btn btn-soft btn-block mt-12" href="#/fokus">${icon(t.status === 'running' ? 'timer' : 'pause')} ${t.mode === 'work' ? 'Fokus' : 'Pause'} läuft · <span class="num" data-timer-text>${fmtClock(remainingMs())}</span></a>`
      : html`<button class="btn btn-primary btn-block mt-12" data-action="start-focus">${icon('play')} ${state.focus.settings.work} Min fokussieren</button>`}
  </section>`;
}

function cardsCard(state) {
  if (!state.cards.length) return '';
  const dc = dueCounts(state.cards, state.reviews, { newLimit: state.settings.newCardsPerDay });
  return html`<section class="card ${dc.total ? 'accent' : ''}">
    <div class="card-head"><span class="card-title">${icon('cards')} Karteikarten</span></div>
    ${dc.total ? html`
      <div class="stat-value">${dc.total} <span style="font-size:16px;font-weight:600">fällig</span></div>
      <div class="muted small">${dc.review} Wiederholungen · ${dc.fresh} neu · ca. ${Math.max(1, Math.round(dc.total * 0.2))} Min</div>
      <a class="btn btn-white btn-block mt-12" href="#/lernen/alle/session">${icon('play')} Jetzt lernen</a>`
    : html`<div class="row"><span style="font-size:28px">✅</span><div><div class="semi">Alles wiederholt!</div><div class="muted small">Morgen geht’s weiter. ${plural(state.cards.length, 'Karte', 'Karten')} im System.</div></div></div>`}
  </section>`;
}

function budgetCard(state) {
  const b = state.budget;
  if (!b.transactions.length && !b.recurring.length) {
    return html`<section class="card">
      <div class="card-head"><span class="card-title">${icon('wallet')} Budget</span></div>
      <p class="muted small mb-12">Behalte dein Geld im Blick: Monatsbudget festlegen, Ausgaben in Sekunden eintragen.</p>
      <button class="btn btn-soft btn-sm" data-action="new-expense">${icon('plus')} Erste Ausgabe</button>
    </section>`;
  }
  const sm = monthSummary(b, monthKey(today()));
  const pct = sm.limit ? Math.min(100, (sm.expenses / sm.limit) * 100) : 0;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('wallet')} Budget</span><a class="card-link" href="#/budget">Details ${icon('chevronRight')}</a></div>
    <div class="row-between">
      <div><div class="stat-value sm ${sm.leftToday < 0 ? 'danger-text' : ''}">${fmtMoney(sm.leftToday)}</div><div class="stat-label">${sm.leftToday >= 0 ? 'heute noch drin' : 'heute über dem Tagesbudget'}</div></div>
      <button class="btn btn-soft btn-sm" data-action="new-expense">${icon('plus')} Ausgabe</button>
    </div>
    <div class="progress mt-12 ${sm.expenses > sm.limit ? 'over' : ''}"><div class="progress-bar" style="width:${pct}%"></div>${sm.limit ? html`<span class="marker" style="left:${Math.min(100, (sm.expectedByNow / sm.limit) * 100)}%" title="Soll-Stand heute"></span>` : ''}</div>
    <div class="row-between tiny muted mt-4"><span>${fmtMoney(sm.expenses)} ausgegeben</span><span>${fmtMoney(sm.remaining)} übrig bis Monatsende</span></div>
  </section>`;
}

function habitsCard(state) {
  const d = today();
  const hs = state.habits.filter((h) => !h.archived && isScheduled(h, d));
  if (!hs.length) return '';
  const done = hs.filter((h) => isDone(h, d)).length;
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('flame')} Gewohnheiten</span><span class="badge ${done === hs.length ? 'badge-success' : ''}">${done}/${hs.length}</span><a class="card-link" href="#/gewohnheiten">Alle ${icon('chevronRight')}</a></div>
    <div class="habit-chips">${hs.map((h) => {
      const st = currentStreak(h, d);
      return html`<button class="habit-chip ${isDone(h, d) ? 'done' : ''}" style="--c:${h.color}" data-action="toggle-habit" data-id="${h.id}" data-date="${d}">
        <span class="emoji">${h.emoji}</span>${h.name}${st > 1 ? html`<span class="streak">🔥${st}</span>` : ''}
      </button>`;
    })}</div>
  </section>`;
}

function planCard(state) {
  const d = today();
  const blocks = state.plan.blocks.filter((b) => b.date === d);
  if (!blocks.length) return '';
  const exams = new Map(state.events.map((e) => [e.id, e]));
  const cm = courseMap(state);
  const total = blocks.reduce((s, b) => s + b.minutes, 0);
  const done = blocks.filter((b) => b.done).reduce((s, b) => s + b.minutes, 0);
  return html`<section class="card">
    <div class="card-head"><span class="card-title">${icon('route')} Lernplan heute</span><span class="badge">${fmtMinutes(done)} / ${fmtMinutes(total)}</span><a class="card-link" href="#/lernplan">Plan ${icon('chevronRight')}</a></div>
    ${blocks.map((b) => {
      const e = exams.get(b.examId);
      const color = cm.get(e?.courseId)?.color ?? '#5b5bd6';
      return html`<div class="block ${b.done ? 'done' : ''}" style="--c:${color}" data-key="${b.id}">
        <button class="check ${b.done ? 'done' : ''}" style="--c:${color}" data-action="toggle-block" data-id="${b.id}" aria-label="Erledigt">${icon('check')}</button>
        <div style="flex:1;min-width:0"><div class="bl-title">${KIND_META[b.kind].emoji} ${b.title}</div><div class="bl-sub">${e?.title ?? ''} · ${fmtMinutes(b.minutes)}</div></div>
        ${!b.done ? html`<button class="icon-btn sm" data-action="start-focus" data-label="${b.title}" data-course="${e?.courseId ?? ''}" aria-label="Fokus starten">${icon('play')}</button>` : ''}
      </div>`;
    })}
  </section>`;
}

function tipCard() {
  const d = today();
  const idx = Math.abs(diffDays('2026-01-01', d)) % TIPS.length;
  const [t, text] = TIPS[idx];
  return html`<section class="card tinted">
    <div class="card-head"><span class="card-title" style="color:var(--accent-text)">${icon('sparkles')} Tipp des Tages</span></div>
    <h3>${t}</h3><p class="small mt-4" style="color:var(--text-2)">${text}</p>
  </section>`;
}

export default {
  title: 'Heute',
  render({ state }) {
    const name = state.profile.name?.trim().split(/\s+/)[0];
    const d = today();
    const tomorrowExam = upcomingExams(state, d, 1).find((e) => e.date === addDays(d, 1) || e.date === d);
    return html`
      <header class="hero">
        <div class="titles">
          <div class="hero-date">${fmtDate(d, 'long')}</div>
          <h1>${greeting()}${name ? `, ${name}` : ''} 👋</h1>
          ${semesterLine(state)}
        </div>
        <button class="icon-btn filled hide-desktop" data-action="palette" aria-label="Suche">${icon('search')}</button>
      </header>
      ${tomorrowExam ? html`<div class="banner danger mb-16">${icon('alert')}<span><b>${tomorrowExam.date === d ? 'Heute' : 'Morgen'}: ${tomorrowExam.title}</b>${tomorrowExam.start ? ` um ${tomorrowExam.start}` : ''}${tomorrowExam.room ? ` · ${tomorrowExam.room}` : ''}. Du schaffst das! 🍀</span></div>` : ''}
      <div class="masonry three">
        ${classCard(state)}
        ${tasksCard(state)}
        ${planCard(state)}
        ${examsCard(state)}
        ${focusCard(state)}
        ${cardsCard(state)}
        ${habitsCard(state)}
        ${budgetCard(state)}
        ${tipCard()}
      </div>`;
  },
  mount(el, c) {
    const iv = setInterval(() => c.rerender(), 30000);
    return () => clearInterval(iv);
  },
  actions: { ...quickAddActions },
};
