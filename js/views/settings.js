// Einstellungen: Profil, Semester, Darstellung, Lernen, Benachrichtigungen, Daten.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { form, toast, confirm } from '../core/ui.js';
import { pickFile } from '../core/util.js';
import { saveFile } from '../services/files.js';
import { sync, syncBadge } from '../services/sync.js';
import { EMBED } from '../core/env.js';
import { navigate } from '../core/router.js';
import { today, fmtDate, tsToDate, diffDays } from '../core/date.js';
import { plural } from '../core/format.js';
import { ACCENTS, semesterPresets, defaultState, migrate } from '../logic/state.js';
import { applyDemo } from '../logic/demo.js';
import { exportICS } from '../logic/ics.js';
import { requestPermission, notificationsSupported } from '../services/notify.js';

export async function exportBackup() {
  const s = store.snapshot();
  s.meta.exportedAt = Date.now();
  const ok = await saveFile(`unikram-backup-${today()}.json`, JSON.stringify(s, null, 1), 'application/json');
  if (!ok) return;
  store.update((st) => { st.meta.lastBackup = Date.now(); });
  if (!EMBED) toast('Backup gespeichert 💾', { type: 'success' });
}

export async function importBackup() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let data;
  try { data = JSON.parse(f.text); } catch { toast('Keine gültige Backup-Datei', { type: 'error' }); return; }
  if (!data || typeof data !== 'object' || !('profile' in data) || !('tasks' in data)) { toast('Das sieht nicht nach einem Unikram-Backup aus', { type: 'error' }); return; }
  const n = (data.tasks?.length ?? 0) + (data.cards?.length ?? 0) + (data.budget?.transactions?.length ?? 0);
  if (!(await confirm({ title: 'Backup wiederherstellen?', message: `Deine aktuellen Daten werden durch das Backup ersetzt (${plural(n, 'Eintrag', 'Einträge')}${data.meta?.exportedAt ? `, vom ${fmtDate(tsToDate(data.meta.exportedAt), 'numeric')}` : ''}).`, confirmLabel: 'Wiederherstellen', danger: true }))) return;
  store.replace(migrate(data));
  toast('Backup wiederhergestellt', { type: 'success' });
  navigate('heute');
}

async function breakForm(i) {
  const s = store.state;
  const b = i != null ? s.semester.breaks[i] : null;
  const v = await form({
    title: b ? 'Vorlesungsfreie Zeit bearbeiten' : 'Vorlesungsfreie Zeit',
    fields: [
      { name: 'name', label: 'Bezeichnung', value: b?.name ?? '', required: true, placeholder: 'z. B. Weihnachtspause, Pfingstferien' },
      { type: 'row', fields: [
        { name: 'start', label: 'Von', type: 'date', value: b?.start ?? '', required: true },
        { name: 'end', label: 'Bis', type: 'date', value: b?.end ?? '', required: true },
      ] },
    ],
    validate: (x) => (x.end < x.start ? { end: 'Ende vor Beginn' } : null),
    danger: b ? 'Entfernen' : null,
  });
  if (v === 'delete') return store.update((st) => st.semester.breaks.splice(i, 1));
  if (!v) return;
  store.update((st) => {
    if (b) st.semester.breaks[i] = v; else st.semester.breaks.push(v);
  });
}

export async function exportCalendar() {
  const ok = await saveFile('unikram.ics', exportICS(store.state), 'text/calendar', { embedNote: 'Kalenderdateien kann diese Ansicht nicht direkt speichern.' });
  if (ok && !EMBED) toast('Kalenderdatei erstellt – öffnen oder in Google/Apple Kalender importieren', { type: 'success' });
}

const row = (title, desc, control) => html`<div class="settings-row"><div class="sr-main"><div class="sr-title">${title}</div>${desc ? html`<div class="sr-desc">${desc}</div>` : ''}</div>${control}</div>`;
const sw = (path, on) => html`<span class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-change="set" data-path="${path}" data-type="bool" aria-label="${path}"><span></span></span>`;

export default {
  title: 'Einstellungen',
  render({ state }) {
    const s = state;
    const sem = s.semester;
    const backupAge = s.meta.lastBackup ? diffDays(tsToDate(s.meta.lastBackup), today()) : null;
    const hasData = s.tasks.length + s.cards.length + s.budget.transactions.length + s.sessions.length > 0;
    const notif = notificationsSupported() ? Notification.permission : 'unsupported';
    const kb = Math.round(store.sizeBytes() / 1024);
    return html`
      <header class="page-head"><div class="titles"><h1>Einstellungen</h1><p class="page-sub">${EMBED ? 'Profil, Semester, Design & Daten' : 'Alles bleibt lokal auf diesem Gerät'}</p></div></header>
      ${!EMBED && hasData && (backupAge == null || backupAge > 30) ? html`<div class="banner warn mb-16">${icon('alert')}<span>${backupAge == null ? 'Du hast noch kein Backup erstellt.' : `Dein letztes Backup ist ${backupAge} Tage alt.`} Da alles nur auf diesem Gerät liegt, lohnt sich ein Export ab und zu. <button class="btn btn-xs btn-outline" data-action="backup" style="margin-left:4px">Jetzt sichern</button></span></div>` : ''}
      <div class="grid grid-2">
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('smile')} Profil</span></div>
          <div class="field"><label class="label" for="s-name">Vorname</label><input class="input" id="s-name" value="${s.profile.name}" data-change="set" data-path="profile.name"></div>
          <div class="field"><label class="label" for="s-uni">Hochschule</label><input class="input" id="s-uni" value="${s.profile.uni}" placeholder="optional" data-change="set" data-path="profile.uni"></div>
          <div class="field-row mt-12">
            <div class="field"><label class="label" for="s-prog">Studiengang</label><input class="input" id="s-prog" value="${s.profile.program}" placeholder="z. B. Informatik (B.Sc.)" data-change="set" data-path="profile.program"></div>
            <div class="field"><label class="label" for="s-ects">ECTS gesamt</label><input class="input" id="s-ects" inputmode="numeric" value="${s.profile.totalEcts}" data-change="set" data-path="profile.totalEcts" data-type="number"></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('calendar')} Semester</span></div>
          <div class="chips wrap mb-12">${semesterPresets(today()).map((p, i) => html`<button class="chip sm ${sem.name === p.name ? 'active' : ''}" data-action="sem-preset" data-i="${i}">${p.name}</button>`)}</div>
          <div class="field"><label class="label" for="s-sem">Bezeichnung</label><input class="input" id="s-sem" value="${sem.name}" placeholder="z. B. WiSe 2026/27" data-change="set" data-path="semester.name"></div>
          <div class="field-row mt-12">
            <div class="field"><label class="label" for="s-ls">Vorlesungsbeginn</label><input class="input" type="date" id="s-ls" value="${sem.lectureStart}" data-change="set" data-path="semester.lectureStart"></div>
            <div class="field"><label class="label" for="s-le">Vorlesungsende</label><input class="input" type="date" id="s-le" value="${sem.lectureEnd}" data-change="set" data-path="semester.lectureEnd"></div>
          </div>
          <div class="section-title">Vorlesungsfreie Zeiten <button class="card-link" data-action="add-break" style="margin-left:auto">${icon('plus')} Neu</button></div>
          ${sem.breaks?.length ? html`<div class="list">${sem.breaks.map((b, i) => html`<div class="li li-clickable" data-action="edit-break" data-i="${i}"><div class="li-main"><div class="li-title">${b.name}</div><div class="li-sub">${fmtDate(b.start, 'numeric')} – ${fmtDate(b.end, 'numeric')}</div></div>${icon('chevronRight', 'sm faint')}</div>`)}</div>` : html`<p class="tiny muted">Keine eingetragen. In diesen Zeiten werden keine Vorlesungen angezeigt.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('eye')} Darstellung</span></div>
          <div class="field"><span class="label">Design</span>
            <div class="seg">${[['system', 'monitor', 'System'], ['light', 'sun', 'Hell'], ['dark', 'moon', 'Dunkel']].map(([k, ic, l]) => html`<button class="${s.settings.theme === k ? 'active' : ''}" data-action="theme" data-t="${k}">${icon(ic, 'sm')} ${l}</button>`)}</div></div>
          <div class="field mt-16"><span class="label">Akzentfarbe</span>
            <div class="accent-dots">${ACCENTS.map((a) => html`<button class="accent-dot ${s.settings.accent === a.value ? 'active' : ''}" style="--c:${a.value}" data-action="accent" data-c="${a.value}" aria-label="${a.name}" title="${a.name}"></button>`)}</div></div>
          <div class="mt-12">
            ${row('Wochenende im Stundenplan', 'Sa & So immer anzeigen', sw('settings.showWeekend', s.settings.showWeekend))}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('brain')} Lernen & Noten</span></div>
          ${row('Neue Karteikarten pro Tag', 'pro Stapel – mehr heißt mehr Wiederholungen in den Folgetagen', html`<input class="input sm" style="width:80px;text-align:center" inputmode="numeric" value="${s.settings.newCardsPerDay}" data-change="set" data-path="settings.newCardsPerDay" data-type="number" aria-label="Neue Karten pro Tag">`)}
          ${row('Abschlussnote', 'Die meisten Prüfungsordnungen schneiden nach der 1. Nachkommastelle ab', html`<div class="seg sm">${[['truncate', 'Abschneiden'], ['round', 'Runden']].map(([k, l]) => html`<button class="${s.settings.gradeRounding === k ? 'active' : ''}" data-action="rounding" data-r="${k}">${l}</button>`)}</div>`)}
          ${row('Fokus-Tagesziel', `${s.focus.settings.dailyGoal} Minuten`, html`<a class="btn btn-sm btn-ghost" href="#/fokus">Ändern</a>`)}
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('bell')} Benachrichtigungen & Töne</span></div>
          ${row('Erinnerungen', notif === 'granted' ? '10 Min vor Vorlesungen, 30 Min vor fälligen Aufgaben (solange Unikram offen ist)' : notif === 'unsupported' ? 'Von diesem Browser nicht unterstützt' : 'Benötigt deine Erlaubnis', notif === 'granted' ? sw('settings.reminders', s.settings.reminders) : notif === 'unsupported' ? '' : html`<button class="btn btn-sm btn-soft" data-action="notif">Erlauben</button>`)}
          ${row('Töne', 'Gong am Ende von Fokus-Sessions', sw('settings.sound', s.settings.sound))}
          ${row('Vibration', 'Kurzes Feedback beim Abhaken (Android)', sw('settings.haptics', s.settings.haptics))}
        </section>

        <section class="card">
          <div class="card-head"><span class="card-title">${icon('lock')} Daten & Backup</span>${EMBED ? syncBadge() : ''}</div>
          ${EMBED ? html`<p class="small muted mb-12">${sync.available ? html`Deine Daten werden in deinem privaten Bereich synchronisiert – öffne diese Seite auf Handy und Laptop und alles ist überall gleich.${sync.lastSyncAt ? ` Zuletzt: ${fmtDate(tsToDate(sync.lastSyncAt), 'numeric')}, ${new Date(sync.lastSyncAt).toTimeString().slice(0, 5)} Uhr.` : ''}` : 'Synchronisierung ist in dieser Ansicht nicht verfügbar – Daten bleiben in diesem Browser.'} ${sync.message}</p>
            ${sync.available ? html`<button class="btn btn-sm btn-soft mb-12" data-action="sync-now">${icon('repeat')} Jetzt synchronisieren</button>` : ''}`
          : html`<p class="small muted mb-12">Unikram speichert alles nur in diesem Browser (${kb} KB). Kein Konto, keine Cloud, kein Tracking.${s.meta.lastBackup ? ` Letztes Backup: ${fmtDate(tsToDate(s.meta.lastBackup), 'numeric')}.` : ''}</p>`}
          <div class="list-actions">
            <button class="btn btn-soft" data-action="backup">${icon('download')} Backup exportieren</button>
            <button class="btn btn-outline" data-action="restore">${icon('upload')} Backup laden</button>
            <button class="btn btn-outline" data-action="ics">${icon('calendar')} Kalender (.ics)</button>
          </div>
          <div class="divider"></div>
          <div class="list-actions">
            <button class="btn btn-ghost" data-action="demo">${icon('sparkles')} Beispieldaten laden</button>
            <button class="btn btn-danger-ghost" data-action="reset">${icon('trash')} Alles löschen</button>
          </div>
        </section>
      </div>
      <section class="card mt-16">
        <div class="card-head"><span class="card-title">${icon('info')} Über Unikram</span></div>
        <p class="small">Unikram ist eine Progressive Web App: Über „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Menü in Safari, Android: Menü in Chrome) wird sie wie eine echte App installiert und funktioniert offline.</p>
        <div class="row wrap mt-12"><button class="btn btn-sm btn-ghost" data-action="shortcuts">${icon('zap')} Tastenkürzel</button><span class="tiny muted">Version 1.0 · ${today()}</span></div>
      </section>`;
  },
  actions: {
    set: (c, el) => {
      const path = el.dataset.path.split('.');
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.type === 'number') { v = Number(String(v).replace(',', '.')); if (!Number.isFinite(v)) return; }
      if (el.dataset.type === 'bool') v = !!el.checked;
      store.update((s) => {
        let o = s;
        for (const k of path.slice(0, -1)) o = o[k];
        o[path.at(-1)] = typeof v === 'string' ? v.trim() : v;
      });
    },
    theme: (c, el) => store.update((s) => { s.settings.theme = el.dataset.t; }),
    accent: (c, el) => store.update((s) => { s.settings.accent = el.dataset.c; }),
    rounding: (c, el) => store.update((s) => { s.settings.gradeRounding = el.dataset.r; }),
    'sem-preset': (c, el) => store.update((s) => { s.semester = semesterPresets(today())[Number(el.dataset.i)]; }),
    'add-break': () => breakForm(null),
    'edit-break': (c, el) => breakForm(Number(el.dataset.i)),
    notif: async () => {
      const r = await requestPermission();
      if (r === 'granted') { store.update((s) => { s.settings.reminders = true; }); toast('Erinnerungen aktiviert 🔔', { type: 'success' }); }
      else toast('Benachrichtigungen wurden nicht erlaubt', { type: 'error' });
    },
    backup: () => exportBackup(),
    restore: () => importBackup(),
    ics: () => exportCalendar(),
    'sync-now': () => sync.now(),
    shortcuts: async () => (await import('../palette.js')).showShortcuts(),
    demo: async () => {
      if (!(await confirm({ title: 'Beispieldaten laden?', message: 'Stundenplan, Aufgaben, Karteikarten, Noten, Budget usw. werden durch Beispieldaten ersetzt. Profil und Einstellungen bleiben.', confirmLabel: 'Laden', danger: true }))) return;
      store.update((s) => applyDemo(s));
      toast('Beispieldaten geladen ✨', { type: 'success' });
      navigate('heute');
    },
    reset: async () => {
      if (!(await confirm({ title: 'Wirklich alles löschen?', message: 'Alle Daten in Unikram werden unwiderruflich gelöscht. Tipp: vorher ein Backup exportieren.', confirmLabel: 'Alles löschen', danger: true }))) return;
      store.replace(defaultState());
      toast('Alles gelöscht – frischer Start', { type: 'success' });
      navigate('willkommen');
    },
  },
};
