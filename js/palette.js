// Command Palette (Strg/⌘+K): Navigation, Aktionen und Volltextsuche über alles.
import { store } from './core/store.js';
import { html } from './core/html.js';
import { icon } from './core/icons.js';
import { openDialog, sheet, toast } from './core/ui.js';
import { fuzzyScore, escapeRegExp, norm } from './core/util.js';
import { navigate } from './core/router.js';
import { relDayShort, fmtDate } from './core/date.js';
import { timer } from './services/timer.js';
import { parseQuickAdd } from './logic/tasks.js';

const PAGES = [
  ['Heute', 'heute', 'home'], ['Woche / Stundenplan', 'woche', 'calendar'], ['Aufgaben', 'aufgaben', 'tasks'], ['Fokus-Timer', 'fokus', 'timer'],
  ['Karteikarten', 'lernen', 'cards'], ['Lernplan', 'lernplan', 'route'], ['Noten', 'noten', 'grad'], ['Budget', 'budget', 'wallet'],
  ['WG-Kasse', 'wg', 'users'], ['Gewohnheiten', 'gewohnheiten', 'flame'], ['Werkzeuge', 'werkzeuge', 'toolbox'], ['Einstellungen', 'einstellungen', 'settings'],
  ['Wortzähler', 'werkzeuge/wortzaehler', 'text'], ['Quellen zitieren', 'werkzeuge/zitieren', 'quote'], ['Notenschlüssel', 'werkzeuge/notenschluessel', 'percent'],
  ['Vortrags-Timer', 'werkzeuge/vortrag', 'clock'], ['Glücksrad', 'werkzeuge/gluecksrad', 'dice'], ['Gruppen-Generator', 'werkzeuge/gruppen', 'shuffle'], ['Atemübung', 'werkzeuge/atmen', 'wind'],
];

function actions() {
  const t = store.state.focus.timer;
  return [
    { label: 'Neue Aufgabe', icon: 'plus', kw: 'task todo hinzufügen', run: async () => (await import('./views/tasks.js')).taskForm(null) },
    { label: 'Ausgabe eintragen', icon: 'wallet', kw: 'geld budget kosten', run: async () => (await import('./views/budget.js')).txForm(null) },
    { label: 'Prüfung eintragen', icon: 'flag', kw: 'klausur exam', run: async () => (await import('./views/week.js')).eventForm(null, { kind: 'exam' }) },
    { label: 'Termin eintragen', icon: 'calendarPlus', kw: 'event', run: async () => (await import('./views/week.js')).eventForm(null, { kind: 'event' }) },
    { label: 'Veranstaltung zum Stundenplan', icon: 'calendar', kw: 'vorlesung kurs', run: async () => (await import('./views/week.js')).sessionForm(null) },
    { label: 'Neue Karteikarte', icon: 'cards', kw: 'karte vokabel', run: async () => (await import('./views/cards.js')).cardForm(null, {}) },
    { label: t.status === 'running' ? 'Fokus pausieren' : t.status === 'paused' ? 'Fokus fortsetzen' : 'Fokus-Session starten', icon: t.status === 'running' ? 'pause' : 'play', kw: 'pomodoro timer konzentration', run: () => { if (t.status === 'idle') navigate('fokus'); timer.toggle(); } },
    { label: 'Fällige Karteikarten lernen', icon: 'brain', kw: 'wiederholen lernen', run: () => navigate('lernen/alle/session') },
    { label: 'Hell/Dunkel umschalten', icon: 'moon', kw: 'theme dark mode design', run: () => store.update((s) => { s.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; }) },
    { label: 'Backup exportieren', icon: 'download', kw: 'sichern export json', run: async () => (await import('./views/settings.js')).exportBackup() },
    { label: 'Tastenkürzel anzeigen', icon: 'zap', kw: 'shortcuts hilfe', run: () => showShortcuts() },
  ];
}

function collect(q) {
  const s = store.state;
  const groups = [];
  const score = (text) => (q ? fuzzyScore(q, text) : 0);
  const top = (items, n) => items.map((x) => ({ ...x, score: score(x.text ?? x.label) })).filter((x) => !q || x.score >= 0).sort((a, b) => b.score - a.score).slice(0, n);

  if (q.trim().length > 2) {
    const p = parseQuickAdd(q, { courses: s.courses });
    if (p.parts.length || /^(neu|aufgabe|todo)\b/i.test(q)) {
      groups.push({ name: 'Schnell anlegen', items: [{ label: `Aufgabe „${p.title || q}“${p.parts.length ? ` · ${p.parts.map((x) => x.label).join(' · ')}` : ''}`, icon: 'plus', run: async () => (await import('./views/tasks.js')).addTaskFromText(q.replace(/^(neu|aufgabe|todo):?\s*/i, '')) }] });
    }
  }
  groups.push({ name: 'Aktionen', items: top(actions().map((a) => ({ ...a, text: `${a.label} ${a.kw}` })), q ? 4 : 6) });
  groups.push({ name: 'Seiten', items: top(PAGES.map(([label, to, ic]) => ({ label, icon: ic, run: () => navigate(to) })), q ? 4 : 5) });
  if (q) {
    const tasks = top(s.tasks.filter((t) => !t.done).map((t) => ({ label: t.title, text: `${t.title} ${t.notes ?? ''}`, icon: 'tasks', sub: t.due ? relDayShort(t.due) : '', run: async () => (await import('./views/tasks.js')).taskForm(t.id) })), 5);
    if (tasks.length) groups.push({ name: 'Aufgaben', items: tasks });
    const courses = top(s.courses.map((c) => ({ label: c.name, text: `${c.name} ${c.short} ${c.lecturer ?? ''}`, icon: 'book', sub: c.short, run: async () => (await import('./views/week.js')).courseForm(c.id) })), 4);
    if (courses.length) groups.push({ name: 'Kurse', items: courses });
    const events = top(s.events.map((e) => ({ label: e.title, icon: e.kind === 'exam' ? 'flag' : 'calendar', sub: fmtDate(e.date), run: async () => (await import('./views/week.js')).eventForm(e.id) })), 4);
    if (events.length) groups.push({ name: 'Termine & Prüfungen', items: events });
    const decks = top(s.decks.map((d) => ({ label: d.name, icon: 'cards', run: () => navigate(`lernen/${d.id}`) })), 3);
    if (decks.length) groups.push({ name: 'Stapel', items: decks });
    const nq = norm(q);
    const cards = s.cards.filter((c) => norm(c.front + ' ' + c.back).includes(nq)).slice(0, 4).map((c) => ({ label: c.front.replace(/[*`_]/g, ''), icon: 'layers', sub: 'Karte', score: 500, run: async () => (await import('./views/cards.js')).cardForm(c.id) }));
    if (cards.length) groups.push({ name: 'Karteikarten', items: cards });
    const other = top([
      ...s.habits.map((h) => ({ label: `${h.emoji} ${h.name}`, icon: 'flame', sub: 'Gewohnheit', run: () => navigate('gewohnheiten') })),
      ...s.modules.map((m) => ({ label: m.name, icon: 'grad', sub: m.grade ? String(m.grade).replace('.', ',') : 'Modul', run: async () => (await import('./views/grades.js')).moduleForm(m.id) })),
      ...s.groups.map((g) => ({ label: g.name, icon: 'users', sub: 'WG-Kasse', run: () => navigate(`wg/${g.id}`) })),
    ], 4);
    if (other.length) groups.push({ name: 'Weitere', items: other });
  }
  const nonEmpty = groups.filter((g) => g.items.length);
  if (!q) return nonEmpty;
  // Bei Suche: Gruppen nach bestem Treffer sortieren ("Schnell anlegen" bleibt oben)
  const best = (g) => (g.name === 'Schnell anlegen' ? Infinity : Math.max(...g.items.map((i) => i.score ?? 0)));
  return nonEmpty.sort((a, b) => best(b) - best(a));
}

function highlight(label, q) {
  if (!q) return label;
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1).map(escapeRegExp);
  if (!words.length) return label;
  const re = new RegExp(`(${words.join('|')})`, 'ig');
  const parts = String(label).split(re);
  return html`${parts.map((p, i) => (i % 2 ? html`<mark>${p}</mark>` : p))}`;
}

export function openPalette() {
  if (document.querySelector('dialog.palette')) return;
  const content = html`
    <div class="palette-input-wrap">${icon('search')}<input class="palette-input" placeholder="Suchen oder Befehl … z. B. „Blatt 5 morgen“" aria-label="Suche" autocomplete="off"><span class="kbd">Esc</span></div>
    <div class="palette-list" role="listbox"></div>
    <div class="palette-foot"><span><span class="kbd">↑↓</span> auswählen</span><span><span class="kbd">↵</span> öffnen</span><span class="hide-mobile"><span class="kbd">Strg K</span> öffnen/schließen</span></div>`;
  const { el, close } = openDialog({ content, className: 'palette', label: 'Suche' });
  const input = el.querySelector('input');
  const list = el.querySelector('.palette-list');
  let flat = [], active = 0;
  const render = () => {
    const q = input.value;
    const groups = collect(q);
    flat = groups.flatMap((g) => g.items);
    active = Math.min(active, Math.max(0, flat.length - 1));
    let i = 0;
    list.innerHTML = String(groups.length ? html`${groups.map((g) => html`<div class="palette-group">${g.name}</div>${g.items.map((it) => {
      const idx = i++;
      return html`<div class="palette-item ${idx === active ? 'active' : ''}" data-i="${idx}" role="option">${icon(it.icon)}<span class="truncate">${highlight(it.label, q)}</span>${it.sub ? html`<span class="pi-sub">${it.sub}</span>` : ''}</div>`;
    })}`)}` : html`<div class="empty compact"><p>Nichts gefunden für „${q}“.</p></div>`);
    list.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => {
    const it = flat[i];
    if (!it) return;
    close();
    setTimeout(() => Promise.resolve(it.run()).catch((e) => toast(e.message, { type: 'error' })), 60);
  };
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, flat.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + flat.length) % Math.max(1, flat.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (item) run(Number(item.dataset.i));
  });
  list.addEventListener('mousemove', (e) => {
    const item = e.target.closest('.palette-item');
    if (item && Number(item.dataset.i) !== active) {
      list.querySelector('.palette-item.active')?.classList.remove('active');
      item.classList.add('active');
      active = Number(item.dataset.i);
    }
  });
  render();
  setTimeout(() => input.focus(), 30);
}

export function showShortcuts() {
  const keys = [
    ['Strg/⌘ + K oder /', 'Suche & Befehle'], ['N', 'Neue Aufgabe'], ['A', 'Neue Ausgabe'], ['H', 'Heute'], ['W', 'Woche'], ['T', 'Aufgaben'], ['F', 'Fokus'], ['L', 'Karteikarten'],
    ['Leertaste', 'Fokus: Start/Pause · Karten: umdrehen'], ['1 – 4', 'Karte bewerten'], ['R / S / Z', 'Fokus: Reset / Überspringen / Zen-Modus'], ['Esc', 'Schließen / Beenden'], ['?', 'Diese Übersicht'],
  ];
  sheet({
    title: 'Tastenkürzel',
    body: html`<div class="list">${keys.map(([k, d]) => html`<div class="li" style="min-height:44px"><span class="li-main">${d}</span><span class="kbd" style="font-size:13px">${k}</span></div>`)}</div>`,
    foot: html`<span class="spacer"></span><button class="btn btn-primary" data-close>Alles klar</button>`,
  });
}
