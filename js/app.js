// Unikram – App-Einstieg: Shell, Router, Event-Delegation, Tastenkürzel, Hintergrunddienste.
import { store } from './core/store.js';
import { morph } from './core/morph.js';
import { html, raw } from './core/html.js';
import { icon, LOGO_SVG } from './core/icons.js';
import { parseHash, matchRoute, navigate } from './core/router.js';
import { toast, menu, anyDialogOpen } from './core/ui.js';
import { today } from './core/date.js';
import { fmtClock } from './core/format.js';
import { timer, initTimer, onTick, remainingMs } from './services/timer.js';
import { initReminders } from './services/reminders.js';
import { dueCount } from './logic/tasks.js';
import { dueCounts } from './logic/srs.js';
import { applyRecurring } from './logic/budget.js';

const ROUTES = [
  { path: '', load: () => import('./views/dashboard.js'), nav: 'heute' },
  { path: 'heute', load: () => import('./views/dashboard.js'), nav: 'heute' },
  { path: 'woche', load: () => import('./views/week.js'), nav: 'woche' },
  { path: 'aufgaben', load: () => import('./views/tasks.js'), nav: 'aufgaben' },
  { path: 'fokus', load: () => import('./views/focus.js'), nav: 'fokus' },
  { path: 'lernen', load: () => import('./views/cards.js'), nav: 'lernen' },
  { path: 'lernen/:deck', load: () => import('./views/cards.js'), nav: 'lernen' },
  { path: 'lernen/:deck/session', load: () => import('./views/study.js'), nav: 'lernen' },
  { path: 'lernplan', load: () => import('./views/planner.js'), nav: 'lernplan' },
  { path: 'noten', load: () => import('./views/grades.js'), nav: 'noten' },
  { path: 'budget', load: () => import('./views/budget.js'), nav: 'budget' },
  { path: 'wg', load: () => import('./views/wg.js'), nav: 'wg' },
  { path: 'wg/:id', load: () => import('./views/wg.js'), nav: 'wg' },
  { path: 'gewohnheiten', load: () => import('./views/habits.js'), nav: 'gewohnheiten' },
  { path: 'werkzeuge', load: () => import('./views/tools.js'), nav: 'werkzeuge' },
  { path: 'werkzeuge/:tool', load: () => import('./views/tools.js'), nav: 'werkzeuge' },
  { path: 'einstellungen', load: () => import('./views/settings.js'), nav: 'einstellungen' },
  { path: 'mehr', load: () => import('./views/more.js'), nav: 'mehr' },
  { path: 'willkommen', load: () => import('./views/onboarding.js'), nav: null },
];

export const NAV = [
  { section: 'Alltag' },
  { id: 'heute', label: 'Heute', icon: 'home' },
  { id: 'woche', label: 'Woche', icon: 'calendar' },
  { id: 'aufgaben', label: 'Aufgaben', icon: 'tasks' },
  { section: 'Lernen' },
  { id: 'fokus', label: 'Fokus', icon: 'timer' },
  { id: 'lernen', label: 'Karteikarten', icon: 'cards' },
  { id: 'lernplan', label: 'Lernplan', icon: 'route' },
  { id: 'noten', label: 'Noten', icon: 'grad' },
  { section: 'Leben' },
  { id: 'budget', label: 'Budget', icon: 'wallet' },
  { id: 'wg', label: 'WG-Kasse', icon: 'users' },
  { id: 'gewohnheiten', label: 'Gewohnheiten', icon: 'flame' },
  { section: 'Extras' },
  { id: 'werkzeuge', label: 'Werkzeuge', icon: 'toolbox' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'settings' },
];

const TABS = [
  { id: 'heute', label: 'Heute', icon: 'home' },
  { id: 'woche', label: 'Woche', icon: 'calendar' },
  { id: 'aufgaben', label: 'Aufgaben', icon: 'tasks' },
  { id: 'fokus', label: 'Fokus', icon: 'timer' },
  { id: 'mehr', label: 'Mehr', icon: 'grid' },
];
const MORE_IDS = new Set(['mehr', 'lernen', 'lernplan', 'noten', 'budget', 'wg', 'gewohnheiten', 'werkzeuge', 'einstellungen']);

const viewEl = document.getElementById('view');
const sidebarEl = document.getElementById('sidebar');
const tabbarEl = document.getElementById('tabbar');
const uiStates = new Map();
let current = null;
let routeToken = 0;

/* ------------------------------ Theme ------------------------------ */

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const { theme, accent } = store.state.settings;
  const dark = theme === 'dark' || (theme === 'system' && darkMQ.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', accent || '#5b5bd6');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0d0e12' : '#f4f5f9'));
}
darkMQ.addEventListener?.('change', applyTheme);

/* ------------------------------ Kontext ------------------------------ */

function ctx() {
  return {
    state: store.state,
    params: current?.params ?? {},
    query: current?.query ?? {},
    path: current?.path ?? '',
    ui: uiStates.get(current?.key) ?? {},
    rerender: renderView,
  };
}

/* ------------------------------ Shell ------------------------------ */

function badges(s) {
  const tasks = dueCount(s.tasks);
  let cards = 0;
  try { cards = dueCounts(s.cards, s.reviews, { newLimit: s.settings.newCardsPerDay }).total; } catch { /* */ }
  return { aufgaben: tasks, lernen: cards };
}

function timerText() {
  const t = store.state.focus.timer;
  if (t.status === 'idle') return '';
  return fmtClock(remainingMs());
}

function renderShell() {
  const s = store.state;
  const active = current?.route.nav;
  const b = badges(s);
  const tt = timerText();
  const sidebar = html`
    <a class="brand" href="#/heute">${raw(LOGO_SVG.replace('<svg', '<svg class="brand-logo"'))}<span>Unikram</span></a>
    <button class="sidebar-search" type="button" data-action="palette">${icon('search', 'sm')}<span>Suchen …</span><span class="kbd">${/Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘K' : 'Strg K'}</span></button>
    ${NAV.map((n) => n.section
      ? html`<div class="nav-section">${n.section}</div>`
      : html`<a class="nav-item ${active === n.id ? 'active' : ''}" href="#/${n.id}">${icon(n.icon)}<span>${n.label}</span>${
        n.id === 'fokus' && tt ? html`<span class="nav-end num" data-timer-text>${tt}</span>`
        : b[n.id] ? html`<span class="nav-end">${b[n.id]}</span>` : ''}</a>`)}
    <div class="sidebar-foot">
      <button class="btn btn-primary btn-block" type="button" data-action="quick-add">${icon('plus')} Neu</button>
    </div>`;
  morph(sidebarEl, String(sidebar));

  const activeTab = active && MORE_IDS.has(active) ? 'mehr' : active;
  const tabs = html`${TABS.map((t) => html`
    <a class="tab ${activeTab === t.id ? 'active' : ''}" href="#/${t.id}" aria-label="${t.label}">
      ${icon(t.icon)}
      ${t.id === 'fokus' && tt ? html`<span class="tab-label tab-timer" data-timer-text>${tt}</span>` : html`<span class="tab-label">${t.label}</span>`}
      ${t.id === 'aufgaben' && b.aufgaben ? html`<span class="tab-badge">${b.aufgaben}</span>` : ''}
      ${t.id === 'mehr' && b.lernen ? html`<span class="tab-badge" style="background:var(--accent)">${b.lernen > 99 ? '99+' : b.lernen}</span>` : ''}
    </a>`)}`;
  morph(tabbarEl, String(tabs));
}

/* ------------------------------ Router ------------------------------ */

async function handleRoute() {
  const token = ++routeToken;
  const { path, query } = parseHash();
  const s = store.state;
  if (!s.profile.onboarded && path !== 'willkommen' && !path.startsWith('wg')) {
    navigate('willkommen', { replace: true });
    return;
  }
  const m = matchRoute(ROUTES, path) ?? matchRoute(ROUTES, 'heute');
  let mod;
  try {
    mod = (await m.route.load()).default;
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = String(html`<div class="empty"><div class="empty-icon">${icon('alert')}</div><h3>Seite konnte nicht geladen werden</h3><p>${e.message}</p></div>`);
    return;
  }
  if (token !== routeToken) return;
  try { current?.cleanup?.(); } catch (e) { console.error(e); }
  const key = m.route.path + '|' + JSON.stringify(m.params);
  if (!uiStates.has(key)) uiStates.set(key, {});
  current = { mod, route: m.route, params: m.params, query, path, key, cleanup: null };
  viewEl.innerHTML = '';
  viewEl.classList.remove('enter');
  void viewEl.offsetWidth;
  viewEl.classList.add('enter');
  renderView();
  try { current.cleanup = mod.mount?.(viewEl, ctx()) ?? null; } catch (e) { console.error(e); }
  window.scrollTo(0, 0);
  renderShell();
}

function renderView() {
  if (!current) return;
  const c = ctx();
  try {
    morph(viewEl, String(current.mod.render(c)));
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = String(html`<div class="empty"><div class="empty-icon">${icon('alert')}</div><h3>Da ist etwas schiefgelaufen</h3><p class="mono tiny">${e.message}</p><button class="btn btn-soft" data-action="go" data-to="heute">Zur Startseite</button></div>`);
  }
  const imm = typeof current.mod.immersive === 'function' ? current.mod.immersive(c) : !!current.mod.immersive;
  document.body.classList.toggle('immersive', imm);
  updateTitle();
  current.mod.afterRender?.(viewEl, c);
}

function updateTitle() {
  if (!current) return;
  const base = current.mod.title ? (typeof current.mod.title === 'function' ? current.mod.title(ctx()) : current.mod.title) : 'Unikram';
  const tt = timerText();
  const t = store.state.focus.timer;
  document.title = `${tt && t.status === 'running' ? `${t.mode === 'work' ? '⏳' : '☕'} ${tt} · ` : ''}${base}${base === 'Unikram' ? '' : ' · Unikram'}`;
}

/* ------------------------------ Aktionen ------------------------------ */

const globalActions = {
  go: (c, el) => navigate(el.dataset.to),
  back: () => (history.length > 1 ? history.back() : navigate('heute')),
  palette: () => import('./palette.js').then((m) => m.openPalette()),
  'quick-add': () => quickAddMenu(),
  'start-focus': async (c, el) => {
    navigate('fokus');
    timer.start({ mode: 'work', label: el.dataset.label ?? '', courseId: el.dataset.course ?? '' });
  },
  'new-task': async (c, el) => (await import('./views/tasks.js')).taskForm(null, { due: el.dataset.due, courseId: el.dataset.course }),
  'edit-task': async (c, el) => (await import('./views/tasks.js')).taskForm(el.dataset.id),
  'toggle-task': async (c, el) => (await import('./views/tasks.js')).toggleTask(el.dataset.id),
  'new-expense': async (c, el) => (await import('./views/budget.js')).txForm(null, { type: el.dataset.type || 'expense' }),
  'new-event': async (c, el) => (await import('./views/week.js')).eventForm(null, { kind: el.dataset.kind || 'event', date: el.dataset.date }),
  'edit-event': async (c, el) => (await import('./views/week.js')).eventForm(el.dataset.id),
  'toggle-habit': async (c, el) => (await import('./views/habits.js')).toggleHabit(el.dataset.id, el.dataset.date),
  'toggle-block': async (c, el) => (await import('./views/planner.js')).toggleBlock(el.dataset.id),
  'session-menu': async (c, el) => (await import('./views/week.js')).sessionMenu(el.dataset.id, el.dataset.date),
};

export async function quickAddMenu() {
  menu({
    title: 'Neu hinzufügen',
    items: [
      { emoji: '✅', label: 'Aufgabe', sub: 'Mit Spracheingabe: „Blatt 3 bis morgen“', color: '#5b5bd6', onClick: () => globalActions['new-task'](ctx(), { dataset: {} }) },
      { emoji: '💸', label: 'Ausgabe', sub: 'Schnell eintragen, Budget im Blick', color: '#ee6b12', onClick: () => globalActions['new-expense'](ctx(), { dataset: {} }) },
      { emoji: '📝', label: 'Prüfung', sub: 'Mit Countdown und Lernplan', color: '#e5484d', onClick: () => globalActions['new-event'](ctx(), { dataset: { kind: 'exam' } }) },
      { emoji: '📅', label: 'Termin', sub: 'Einmaliger Termin im Kalender', color: '#0b84e3', onClick: () => globalActions['new-event'](ctx(), { dataset: { kind: 'event' } }) },
      { emoji: '🃏', label: 'Karteikarte', sub: 'In einen deiner Stapel', color: '#8e4ec6', onClick: async () => (await import('./views/cards.js')).cardForm(null, {}) },
      { emoji: '⏱️', label: 'Fokus starten', sub: `${store.state.focus.settings.work} Minuten konzentriert arbeiten`, color: '#12a594', onClick: () => globalActions['start-focus'](ctx(), { dataset: {} }) },
    ],
  });
}

function findHandler(name) {
  return current?.mod.actions?.[name] ?? globalActions[name];
}

function dispatch(el, e, attr) {
  const name = el.getAttribute(attr);
  const fn = findHandler(name);
  if (!fn) { console.warn('Unbekannte Aktion:', name); return; }
  try {
    const r = fn(ctx(), el, e);
    if (r?.catch) r.catch((err) => { console.error(err); toast('Fehler: ' + err.message, { type: 'error' }); });
  } catch (err) {
    console.error(err);
    toast('Fehler: ' + err.message, { type: 'error' });
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog:not(.palette)') && !el.closest('[data-delegate]')) return;
  if (el.tagName === 'A' || el.type === 'submit') e.preventDefault();
  dispatch(el, e, 'data-action');
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || el.closest('dialog')) return;
  dispatch(el, e, 'data-change');
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el || el.closest('dialog')) return;
  dispatch(el, e, 'data-input');
});
document.addEventListener('submit', (e) => {
  const el = e.target.closest('[data-submit]');
  if (!el || el.closest('dialog')) return;
  e.preventDefault();
  dispatch(el, e, 'data-submit');
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('[data-enter]');
  if (el && e.key === 'Enter' && !e.shiftKey && !el.closest('dialog')) {
    e.preventDefault();
    dispatch(el, e, 'data-enter');
  }
});

/* ------------------------------ Tastenkürzel ------------------------------ */

function isTyping(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!document.querySelector('dialog.palette')) globalActions.palette();
    return;
  }
  if (anyDialogOpen() || document.querySelector('dialog[open]') || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (current?.mod.onKey?.(e, ctx())) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); globalActions.palette(); }
  else if (k === 'n') { e.preventDefault(); globalActions['new-task'](ctx(), { dataset: {} }); }
  else if (k === 'a') { e.preventDefault(); globalActions['new-expense'](ctx(), { dataset: {} }); }
  else if (k === 'f') navigate('fokus');
  else if (k === 'h') navigate('heute');
  else if (k === 'w') navigate('woche');
  else if (k === 't') navigate('aufgaben');
  else if (k === 'l') navigate('lernen');
  else if (k === '?') import('./palette.js').then((m) => m.showShortcuts());
});

/* ------------------------------ Start ------------------------------ */

function maintenance() {
  const s = store.state;
  if (s.budget.recurring.some((r) => r.active)) {
    let added = 0;
    store.update((st) => { added = applyRecurring(st.budget); });
    if (added) console.info(`[Unikram] ${added} Fixkosten gebucht`);
  }
}

let lastDay = today();
setInterval(() => {
  const d = today();
  if (d !== lastDay) {
    lastDay = d;
    maintenance();
    renderView();
    renderShell();
  }
}, 30000);

store.subscribe(() => {
  applyTheme();
  renderView();
  renderShell();
});

onTick(() => {
  const tt = timerText();
  document.querySelectorAll('[data-timer-text]').forEach((el) => { if (el.textContent !== tt) el.textContent = tt; });
  updateTitle();
});

addEventListener('hashchange', handleRoute);

function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version verfügbar', { action: { label: 'Neu laden', onClick: () => { nw.postMessage('skipWaiting'); } }, timeout: 15000 });
        }
      });
    });
  }).catch((e) => console.warn('SW nicht registriert', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

applyTheme();
maintenance();
initTimer();
initReminders();
renderShell();
handleRoute();
registerSW();

if (!store.persistent) {
  setTimeout(() => toast('Speichern nicht möglich (privater Modus?) – Daten gehen beim Schließen verloren.', { type: 'error', timeout: 8000 }), 800);
}

// Fab (nur mobil sichtbar)
const fab = document.createElement('button');
fab.className = 'fab';
fab.type = 'button';
fab.setAttribute('aria-label', 'Neu hinzufügen');
fab.dataset.action = 'quick-add';
fab.innerHTML = String(icon('plus'));
document.getElementById('app').append(fab);

window.unikram = { store, navigate, timer };
