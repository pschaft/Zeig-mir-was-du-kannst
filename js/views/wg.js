// WG-Kasse: gemeinsame Ausgaben, Salden, Ausgleich, Putzplan – teilbar per Link.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { form, toast, confirm, menu, sheet } from '../core/ui.js';
import { uid, copyText, encodeShare, decodeShare, groupBy, sortBy } from '../core/util.js';
import { navigate } from '../core/router.js';
import { today, fmtDate, relDay, startOfWeek, addDays, diffDays, isoWeek } from '../core/date.js';
import { fmtMoney, plural, initials } from '../core/format.js';
import { confetti } from '../core/confetti.js';
import { withUndo, removeWithUndo } from '../core/undo.js';
import { shares, balances, settle, groupTotal, choreAssignments } from '../logic/split.js';
import { COURSE_COLORS } from '../logic/state.js';
import { EMBED } from '../core/env.js';

const EMOJIS = ['🏠', '🏡', '✈️', '🏕️', '🍕', '🎉', '🚗', '⛷️', '🏖️', '📚'];
const colorOf = (g, id) => COURSE_COLORS[Math.max(0, g.members.findIndex((m) => m.id === id)) % COURSE_COLORS.length];
const nameOf = (g, id) => (id === g.meId ? 'Du' : g.members.find((m) => m.id === id)?.name ?? '?');
const avatar = (g, id, cls = '') => html`<span class="avatar ${cls}" style="--c:${colorOf(g, id)}" title="${nameOf(g, id)}">${initials(g.members.find((m) => m.id === id)?.name ?? '?')}</span>`;

function getGroup(id) { return store.state.groups.find((g) => g.id === id); }

async function groupForm(id) {
  const g = id ? getGroup(id) : null;
  const v = await form({
    title: g ? 'Gruppe bearbeiten' : 'Neue Gruppe',
    fields: [
      { type: 'row', fields: [
        { name: 'emoji', label: 'Symbol', type: 'select', options: EMOJIS.map((e) => ({ value: e, label: e })), value: g?.emoji ?? '🏠' },
        { name: 'name', label: 'Name', value: g?.name ?? '', required: true, autofocus: !g, placeholder: 'z. B. WG Lindenstraße, Kroatien-Trip' },
      ] },
      !g && { name: 'me', label: 'Dein Name', value: store.state.profile.name || 'Ich', required: true },
      !g && { name: 'others', label: 'Mitbewohner:innen / Mitreisende', type: 'textarea', rows: 4, required: true, placeholder: 'Ein Name pro Zeile\nLena\nJonas\nMia' },
    ].filter(Boolean),
    danger: g ? 'Gruppe löschen' : null,
    submitLabel: g ? 'Speichern' : 'Gruppe anlegen',
  });
  if (v === 'delete') {
    if (!(await confirm({ title: `„${g.name}“ löschen?`, message: 'Alle Ausgaben dieser Gruppe werden gelöscht.', confirmLabel: 'Löschen', danger: true }))) return;
    withUndo((s) => { s.groups = s.groups.filter((x) => x.id !== id); }, 'Gruppe gelöscht');
    navigate('wg');
    return;
  }
  if (!v) return;
  if (g) {
    store.update((s) => Object.assign(s.groups.find((x) => x.id === id), { name: v.name, emoji: v.emoji }));
    return;
  }
  const me = { id: uid('p'), name: v.me };
  const others = v.others.split('\n').map((x) => x.trim()).filter(Boolean).map((name) => ({ id: uid('p'), name }));
  const ng = { id: uid('g'), name: v.name, emoji: v.emoji, meId: me.id, members: [me, ...others], expenses: [], chores: { tasks: [], start: startOfWeek(today()), done: {} }, createdAt: Date.now() };
  store.update((s) => s.groups.push(ng));
  navigate(`wg/${ng.id}`);
}

async function membersForm(gid) {
  const g = getGroup(gid);
  const bal = balances(g);
  const v = await form({
    title: 'Mitglieder',
    fields: [
      ...g.members.map((m) => ({ name: `m_${m.id}`, label: m.id === g.meId ? 'Du' : 'Name', value: m.name, hint: bal.get(m.id) ? `Saldo ${fmtMoney(bal.get(m.id), { sign: true })} – kann erst nach Ausgleich entfernt werden` : 'Leer lassen zum Entfernen' })),
      { name: 'add', label: 'Neue Mitglieder (eins pro Zeile)', type: 'textarea', rows: 2 },
      { name: 'meId', label: 'Wer bist du?', type: 'select', options: g.members.map((m) => ({ value: m.id, label: m.name })), value: g.meId },
    ],
  });
  if (!v) return;
  let blocked = 0;
  store.update((s) => {
    const x = s.groups.find((y) => y.id === gid);
    x.members = x.members.filter((m) => {
      const name = v[`m_${m.id}`];
      if (!name) {
        if (bal.get(m.id) || x.expenses.some((e) => e.payerId === m.id || shares(e).has(m.id))) { blocked++; return true; }
        return false;
      }
      m.name = name;
      return true;
    });
    for (const name of v.add.split('\n').map((t) => t.trim()).filter(Boolean)) x.members.push({ id: uid('p'), name });
    x.meId = x.members.some((m) => m.id === v.meId) ? v.meId : x.members[0]?.id;
  });
  if (blocked) toast(`${blocked} Mitglied(er) mit Ausgaben können nicht entfernt werden`, { type: 'error' });
  else toast('Mitglieder gespeichert', { type: 'success' });
}

async function expenseForm(gid, id) {
  const g = getGroup(gid);
  const e = id ? g.expenses.find((x) => x.id === id) : null;
  if (e?.kind === 'payment') return paymentForm(gid, id);
  const mode = e?.split?.type ?? 'equal';
  const memberOpts = g.members.map((m) => ({ value: m.id, label: nameOf(g, m.id) }));
  const v = await form({
    title: e ? 'Ausgabe bearbeiten' : 'Neue Ausgabe',
    fields: [
      { name: 'title', label: 'Wofür?', value: e?.title ?? '', required: true, autofocus: !e, placeholder: 'z. B. Rewe-Einkauf, Internet, Pizza', list: [...new Set(g.expenses.map((x) => x.title))].slice(-20) },
      { type: 'row', fields: [
        { name: 'amount', label: 'Betrag', type: 'money', value: e?.amount ?? null, required: true },
        { name: 'date', label: 'Datum', type: 'date', value: e?.date ?? today(), required: true },
      ] },
      { name: 'payerId', label: 'Bezahlt von', type: 'pills', options: memberOpts, value: e?.payerId ?? g.meId },
      { name: 'mode', label: 'Aufteilen', type: 'segmented', options: [{ value: 'equal', label: 'Gleichmäßig' }, { value: 'exact', label: 'Genaue Beträge' }], value: mode },
      { name: 'among', label: 'Für wen?', type: 'checkboxes', options: memberOpts, value: e?.split?.among ?? g.members.map((m) => m.id), show: (x) => x.mode === 'equal' },
      ...g.members.map((m) => ({ name: `x_${m.id}`, label: nameOf(g, m.id), type: 'money', value: e?.split?.shares?.[m.id] ?? null, placeholder: '0,00', show: (x) => x.mode === 'exact' })),
      { type: 'html', name: 'hint', html: html`<p class="hint" data-split-hint></p>` },
    ],
    validate: (x) => {
      if (x.amount != null && x.amount <= 0) return { amount: 'Betrag muss größer als 0 sein' };
      if (x.mode === 'equal' && !x.among.length) return { among: 'Mindestens eine Person auswählen' };
      if (x.mode === 'exact') {
        const sum = g.members.reduce((a, m) => a + (x[`x_${m.id}`] || 0), 0);
        if (sum !== x.amount) return { [`x_${g.members.at(-1).id}`]: `Summe ${fmtMoney(sum)} ≠ Betrag ${fmtMoney(x.amount ?? 0)}` };
      }
      return null;
    },
    onChange: (x, el) => {
      const hint = el.querySelector('[data-split-hint]');
      if (!hint) return;
      if (x.mode === 'equal' && x.amount && x.among.length) hint.textContent = `${fmtMoney(Math.floor(x.amount / x.among.length))} pro Person (${x.among.length} Personen)`;
      else if (x.mode === 'exact' && x.amount) {
        const sum = g.members.reduce((a, m) => a + (x[`x_${m.id}`] || 0), 0);
        hint.textContent = sum === x.amount ? '✓ Beträge gehen auf' : `Noch ${fmtMoney(x.amount - sum)} zu verteilen`;
      } else hint.textContent = '';
    },
    danger: e ? 'Löschen' : null,
    submitLabel: e ? 'Speichern' : 'Hinzufügen',
  });
  if (v === 'delete') return removeWithUndo((s) => s.groups.find((x) => x.id === gid).expenses, id, 'Ausgabe gelöscht');
  if (!v) return;
  const split = v.mode === 'equal'
    ? { type: 'equal', among: v.among }
    : { type: 'exact', shares: Object.fromEntries(g.members.map((m) => [m.id, v[`x_${m.id}`] || 0]).filter(([, a]) => a)) };
  const data = { title: v.title, amount: v.amount, date: v.date, payerId: v.payerId, split, kind: 'expense' };
  store.update((s) => {
    const x = s.groups.find((y) => y.id === gid);
    if (e) Object.assign(x.expenses.find((y) => y.id === id), data);
    else x.expenses.push({ id: uid('x'), ...data, createdAt: Date.now() });
  });
  toast(e ? 'Gespeichert' : `${v.title} hinzugefügt`, { type: 'success' });
}

async function paymentForm(gid, id, preset = {}) {
  const g = getGroup(gid);
  const e = id ? g.expenses.find((x) => x.id === id) : null;
  const memberOpts = g.members.map((m) => ({ value: m.id, label: nameOf(g, m.id) }));
  const to0 = e ? Object.keys(e.split.shares)[0] : preset.to;
  const v = await form({
    title: e ? 'Zahlung bearbeiten' : 'Zahlung erfassen',
    fields: [
      { name: 'from', label: 'Von', type: 'pills', options: memberOpts, value: e?.payerId ?? preset.from ?? g.meId },
      { name: 'to', label: 'An', type: 'pills', options: memberOpts, value: to0 ?? g.members.find((m) => m.id !== g.meId)?.id },
      { type: 'row', fields: [
        { name: 'amount', label: 'Betrag', type: 'money', value: e?.amount ?? preset.amount ?? null, required: true },
        { name: 'date', label: 'Datum', type: 'date', value: e?.date ?? today(), required: true },
      ] },
    ],
    validate: (x) => (x.from === x.to ? { to: 'Bitte zwei verschiedene Personen wählen' } : null),
    danger: e ? 'Löschen' : null,
    submitLabel: e ? 'Speichern' : 'Als bezahlt markieren',
  });
  if (v === 'delete') return removeWithUndo((s) => s.groups.find((x) => x.id === gid).expenses, id, 'Zahlung gelöscht');
  if (!v) return;
  const data = { title: 'Ausgleich', amount: v.amount, date: v.date, payerId: v.from, split: { type: 'exact', shares: { [v.to]: v.amount } }, kind: 'payment' };
  store.update((s) => {
    const x = s.groups.find((y) => y.id === gid);
    if (e) Object.assign(x.expenses.find((y) => y.id === id), data);
    else x.expenses.push({ id: uid('x'), ...data, createdAt: Date.now() });
  });
  const allSettled = [...balances(getGroup(gid)).values()].every((b) => b === 0);
  if (allSettled) { confetti(); toast('Alles ausgeglichen! 🤝', { type: 'success', iconName: 'handshake' }); }
  else toast('Zahlung erfasst', { type: 'success' });
}

async function shareGroup(gid) {
  const g = getGroup(gid);
  const code = await encodeShare({ v: 1, group: g });
  // Eingebettet gibt es keine teilbare Adresse → nur den Code teilen
  const url = EMBED ? code : `${location.origin}${location.pathname}#/wg/import?d=${code}`;
  const body = html`
    <p class="muted small mb-12">${EMBED
      ? 'Schick diesen Code deinen Mitbewohner:innen. Sie fügen ihn in Unikram unter WG-Kasse → „Importieren“ ein und haben die Gruppe mit allen Ausgaben – ganz ohne Server.'
      : 'Schick den Link deinen Mitbewohner:innen. Beim Öffnen können sie die Gruppe mit allen Ausgaben in ihr Unikram übernehmen – ganz ohne Server oder Account. Neue Ausgaben teilt ihr einfach mit einem neuen Link.'}</p>
    <textarea class="textarea mono" rows="4" readonly style="font-size:12px" data-link>${url}</textarea>
    <p class="tiny muted mt-8">${plural(g.expenses.length, 'Ausgabe', 'Ausgaben')} · ${url.length.toLocaleString('de-DE')} Zeichen</p>`;
  const foot = html`${navigator.share && !EMBED ? html`<button class="btn btn-soft" data-native>${icon('share')} Teilen …</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-copy>${icon('copy')} ${EMBED ? 'Code' : 'Link'} kopieren</button>`;
  sheet({
    title: `„${g.name}“ teilen`, body, foot,
    onMount: (el, close) => {
      el.querySelector('[data-copy]').addEventListener('click', async () => { if (await copyText(url)) { toast(EMBED ? 'Code kopiert' : 'Link kopiert', { type: 'success' }); close(); } else el.querySelector('[data-link]').select(); });
      el.querySelector('[data-native]')?.addEventListener('click', async () => { try { await navigator.share({ title: `WG-Kasse: ${g.name}`, text: `Unsere WG-Kasse „${g.name}“ in Unikram`, url }); close(); } catch { /* abgebrochen */ } });
      el.querySelector('[data-link]').addEventListener('focus', (e) => e.target.select());
    },
  });
}

async function importFromLink(code) {
  let data;
  try { data = await decodeShare(code); } catch { toast('Link ist ungültig oder beschädigt', { type: 'error' }); navigate('wg', { replace: true }); return; }
  const g = data?.group;
  if (!g?.members?.length) { toast('Keine Gruppe im Link gefunden', { type: 'error' }); return; }
  const exists = store.state.groups.some((x) => x.id === g.id);
  const v = await form({
    title: `${g.emoji ?? '🏠'} ${g.name} übernehmen`,
    intro: `${plural(g.members.length, 'Mitglied', 'Mitglieder')}, ${plural(g.expenses.length, 'Ausgabe', 'Ausgaben')}.${exists ? ' Die Gruppe existiert schon bei dir – sie wird mit dem Stand aus dem Link aktualisiert.' : ''}`,
    fields: [{ name: 'me', label: 'Wer bist du?', type: 'pills', options: g.members.map((m) => ({ value: m.id, label: m.name })), value: g.members.find((m) => m.id !== g.meId)?.id ?? g.members[0].id }],
    submitLabel: exists ? 'Aktualisieren' : 'Übernehmen',
  });
  if (!v) { navigate('wg', { replace: true }); return; }
  store.update((s) => {
    const copy = { ...g, meId: v.me, chores: g.chores ?? { tasks: [], start: startOfWeek(today()), done: {} } };
    const i = s.groups.findIndex((x) => x.id === g.id);
    if (i >= 0) s.groups[i] = copy; else s.groups.push(copy);
  });
  toast('Gruppe übernommen 🎉', { type: 'success' });
  navigate(`wg/${g.id}`, { replace: true });
}

async function importDialog() {
  const v = await form({
    title: 'Gruppe importieren',
    intro: 'Füge den Link oder Code ein, den dir jemand aus deiner WG geschickt hat.',
    fields: [{ name: 'code', label: 'Link oder Code', type: 'textarea', rows: 4, required: true, autofocus: true, placeholder: 'https://…#/wg/import?d=… oder z…' }],
    submitLabel: 'Weiter',
  });
  if (!v) return;
  const m = /[?&]d=([^&\s]+)/.exec(v.code);
  importFromLink((m ? m[1] : v.code).trim());
}

/* ------------------------------ Putzplan ------------------------------ */

function weekIndex(g, date = today()) {
  return Math.floor(diffDays(startOfWeek(g.chores?.start ?? date), startOfWeek(date)) / 7);
}

async function choresForm(gid) {
  const g = getGroup(gid);
  const v = await form({
    title: 'Putzplan einrichten',
    intro: 'Die Aufgaben rotieren jede Woche automatisch durch alle Mitglieder.',
    fields: [
      { name: 'tasks', label: 'Aufgaben (eine pro Zeile)', type: 'textarea', rows: 5, value: (g.chores?.tasks ?? []).join('\n'), placeholder: 'Bad putzen\nKüche\nMüll & Altglas\nStaubsaugen', required: true },
      { name: 'first', label: 'Wer fängt diese Woche mit der ersten Aufgabe an?', type: 'pills', options: g.members.map((m) => ({ value: m.id, label: nameOf(g, m.id) })), value: choreAssignments(g.chores?.tasks?.length ? g.chores.tasks : ['x'], g.members, weekIndex(g))[0]?.member.id ?? g.members[0].id },
    ],
  });
  if (!v) return;
  store.update((s) => {
    const x = s.groups.find((y) => y.id === gid);
    const idx = x.members.findIndex((m) => m.id === v.first);
    // Start so wählen, dass in dieser Woche "first" die erste Aufgabe hat
    x.chores = { tasks: v.tasks.split('\n').map((t) => t.trim()).filter(Boolean), start: addDays(startOfWeek(today()), -7 * idx), done: x.chores?.done ?? {} };
  });
}

function choresView(g) {
  const tasks = g.chores?.tasks ?? [];
  if (!tasks.length) {
    return html`<div class="card"><div class="empty"><div class="empty-icon">🧽</div><h3>Putzplan ohne Diskussionen</h3><p>Aufgaben eintragen – Unikram rotiert sie jede Woche fair durch.</p><button class="btn btn-primary" data-action="chores" data-id="${g.id}">${icon('plus')} Putzplan einrichten</button></div></div>`;
  }
  const d = today();
  const wi = weekIndex(g, d);
  const key = `${d.slice(0, 4)}-W${isoWeek(startOfWeek(d))}`;
  const done = g.chores.done?.[key] ?? [];
  const now = choreAssignments(tasks, g.members, wi);
  const next = choreAssignments(tasks, g.members, wi + 1);
  return html`<div class="grid grid-2">
    <section class="card">
      <div class="card-head"><span class="card-title">${icon('sparkles')} Diese Woche</span><span class="badge">${done.length}/${tasks.length}</span><button class="card-link" data-action="chores" data-id="${g.id}">${icon('edit')} Bearbeiten</button></div>
      <div class="chore-grid">${now.map((a, i) => html`<div class="chore ${done.includes(i) ? 'done' : ''}">
        <button class="check ${done.includes(i) ? 'done' : ''}" style="--c:${colorOf(g, a.member.id)}" data-action="chore-done" data-id="${g.id}" data-i="${i}" data-key="${key}" aria-label="Erledigt">${icon('check')}</button>
        <div style="flex:1"><div class="semi chore-task">${a.task}</div><div class="tiny muted">${nameOf(g, a.member.id)}</div></div>
        ${avatar(g, a.member.id, 'sm')}
      </div>`)}</div>
    </section>
    <section class="card">
      <div class="card-head"><span class="card-title">${icon('calendar')} Nächste Woche</span></div>
      <div class="list">${next.map((a) => html`<div class="li">${avatar(g, a.member.id, 'sm')}<div class="li-main"><div class="li-title">${a.task}</div><div class="li-sub">${nameOf(g, a.member.id)}</div></div></div>`)}</div>
      ${g.members.length > tasks.length ? html`<p class="tiny muted mt-8">Wer keine Aufgabe hat, hat diese Woche frei 😎</p>` : ''}
    </section>
  </div>`;
}

/* ------------------------------ Ansichten ------------------------------ */

function listView(state) {
  return html`
    <header class="page-head">
      <div class="titles"><h1>WG-Kasse</h1><p class="page-sub">Gemeinsame Kosten fair teilen – für WG, Urlaub oder Projektgruppe</p></div>
      <div class="page-actions"><button class="btn btn-outline" data-action="import-group">${icon('download')}<span class="hide-mobile">Importieren</span></button><button class="btn btn-primary" data-action="new-group">${icon('plus')}<span class="hide-mobile">Gruppe</span></button></div>
    </header>
    ${state.groups.length ? html`<div class="grid grid-2">${state.groups.map((g) => {
      const bal = balances(g).get(g.meId) ?? 0;
      return html`<a class="card clickable" href="#/wg/${g.id}" style="text-decoration:none;color:inherit">
        <div class="row-between"><span style="font-size:30px">${g.emoji ?? '🏠'}</span><div class="avatars">${g.members.slice(0, 5).map((m) => avatar(g, m.id, 'sm'))}</div></div>
        <h3 class="mt-8">${g.name}</h3>
        <p class="small muted">${plural(g.members.length, 'Person', 'Personen')} · ${fmtMoney(groupTotal(g))} gesamt</p>
        <div class="mt-12 semi ${bal > 0 ? 'success-text' : bal < 0 ? 'danger-text' : 'muted'}">${bal === 0 ? 'Alles ausgeglichen ✓' : bal > 0 ? `Du bekommst ${fmtMoney(bal)}` : `Du schuldest ${fmtMoney(-bal)}`}</div>
      </a>`;
    })}</div>` : html`<div class="card"><div class="empty">
      <div class="empty-icon">🏠</div><h3>Nie wieder „Wer schuldet wem was?“</h3>
      <p>Ausgaben eintragen, Unikram rechnet aus, wer wem wie viel zahlen muss – mit so wenigen Überweisungen wie möglich.</p>
      <button class="btn btn-primary" data-action="new-group">${icon('plus')} Gruppe anlegen</button>
    </div></div>`}`;
}

function groupView(state, g, ui) {
  const bal = balances(g);
  const my = bal.get(g.meId) ?? 0;
  const tx = settle(bal);
  const maxAbs = Math.max(1, ...[...bal.values()].map(Math.abs));
  const tab = ui.tab ?? 'overview';
  const exps = sortBy(g.expenses, (e) => e.date, (e) => e.createdAt || 0).reverse();
  const byDate = groupBy(exps, (e) => e.date);
  const total = groupTotal(g);
  const myShare = g.expenses.filter((e) => e.kind !== 'payment').reduce((a, e) => a + (shares(e).get(g.meId) ?? 0), 0);
  return html`
    <a class="back-link" href="#/wg">${icon('chevronLeft', 'sm')} WG-Kasse</a>
    <header class="page-head">
      <div class="titles"><h1>${g.emoji ?? '🏠'} ${g.name}</h1><p class="page-sub">${g.members.map((m) => nameOf(g, m.id)).join(', ')}</p></div>
      <div class="page-actions">
        <button class="icon-btn filled" data-action="group-menu" data-id="${g.id}" aria-label="Mehr">${icon('more')}</button>
        <button class="btn btn-primary" data-action="new-gexp" data-id="${g.id}">${icon('plus')}<span class="hide-mobile">Ausgabe</span></button>
      </div>
    </header>
    <div class="tabs">${[['overview', 'Übersicht'], ['expenses', `Ausgaben (${g.expenses.length})`], ['chores', 'Putzplan']].map(([k, l]) => html`<button class="tab-btn ${tab === k ? 'active' : ''}" data-action="tab" data-t="${k}">${l}</button>`)}</div>

    ${tab === 'overview' ? html`<div class="grid grid-2">
      <section class="card ${my === 0 ? '' : 'accent'}">
        <div class="card-title">Dein Saldo</div>
        <div class="stat-value xl mt-4">${my === 0 ? '0,00 €' : fmtMoney(Math.abs(my))}</div>
        <div class="small" style="opacity:.85">${my === 0 ? 'Alles ausgeglichen 🤝' : my > 0 ? 'bekommst du insgesamt zurück' : 'schuldest du insgesamt'}</div>
        <div class="divider" style="${my === 0 ? '' : 'background:rgb(255 255 255 / .25)'}"></div>
        <div class="row-between small"><span style="opacity:.85">Gesamtausgaben</span><b>${fmtMoney(total)}</b></div>
        <div class="row-between small mt-4"><span style="opacity:.85">Dein Anteil</span><b>${fmtMoney(myShare)}</b></div>
      </section>
      <section class="card">
        <div class="card-head"><span class="card-title">${icon('handshake')} So gleicht ihr aus</span></div>
        ${tx.length ? html`<div class="stack-sm">${tx.map((t) => html`<div class="settle">
          ${avatar(g, t.from, 'sm')}<span class="small"><b>${nameOf(g, t.from)}</b> → <b>${nameOf(g, t.to)}</b></span><span class="spacer"></span>
          <span class="money">${fmtMoney(t.amount)}</span>
          <button class="btn btn-xs btn-soft" data-action="settle" data-id="${g.id}" data-from="${t.from}" data-to="${t.to}" data-amount="${t.amount}">Bezahlt</button>
        </div>`)}</div><p class="tiny muted mt-8">Nur ${plural(tx.length, 'Überweisung', 'Überweisungen')} nötig.</p>`
        : html`<div class="empty compact"><div class="empty-icon">🤝</div><p>Niemand schuldet niemandem etwas.</p></div>`}
      </section>
      <section class="card span-2">
        <div class="card-head"><span class="card-title">${icon('users')} Salden</span></div>
        ${g.members.map((m) => {
          const v = bal.get(m.id) ?? 0;
          const w = (Math.abs(v) / maxAbs) * 100;
          return html`<div class="balance-row">
            <div class="br-name">${avatar(g, m.id, 'sm')} ${nameOf(g, m.id)}<span class="br-amount money ${v > 0 ? 'pos' : v < 0 ? 'danger-text' : 'muted'}">${fmtMoney(v, { sign: true })}</span></div>
            <div class="br-neg">${v < 0 ? html`<i style="width:${w}%"></i>` : ''}</div>
            <div class="br-pos">${v > 0 ? html`<i style="width:${w}%"></i>` : ''}</div>
          </div>`;
        })}
      </section>
    </div>` : ''}

    ${tab === 'expenses' ? (exps.length ? html`<div class="card flush"><div class="list">${[...byDate.keys()].map((d) => html`
      <div class="li" style="min-height:auto;padding-top:12px;padding-bottom:6px;background:var(--surface-2)"><span class="tiny semi muted">${relDay(d)} · ${fmtDate(d)}</span></div>
      ${byDate.get(d).map((e) => {
        const sh = shares(e);
        const isPay = e.kind === 'payment';
        const toId = isPay ? [...sh.keys()][0] : null;
        const mine = sh.get(g.meId) ?? 0;
        const forWhom = e.split.type === 'equal' && e.split.among.length === g.members.length ? 'für alle' : `für ${[...sh.keys()].map((id) => nameOf(g, id)).join(', ')}`;
        return html`<div class="li li-clickable" data-action="edit-gexp" data-id="${g.id}" data-x="${e.id}" data-key="${e.id}">
          ${avatar(g, e.payerId, 'sm')}
          <div class="li-main"><div class="li-title">${isPay ? html`${icon('handshake', 'xs')} ${nameOf(g, e.payerId)} → ${nameOf(g, toId)}` : e.title}</div>
            <div class="li-sub">${isPay ? html`<span>Ausgleichszahlung</span>` : html`<span>${nameOf(g, e.payerId)} hat bezahlt</span><span>${forWhom}</span>`}</div></div>
          <div class="right"><div class="money">${fmtMoney(e.amount)}</div>${!isPay && mine ? html`<div class="tiny muted">dein Anteil ${fmtMoney(mine)}</div>` : ''}</div>
        </div>`;
      })}`)}</div></div>`
      : html`<div class="card"><div class="empty compact"><div class="empty-icon">🧾</div><p>Noch keine Ausgaben.</p><button class="btn btn-soft btn-sm" data-action="new-gexp" data-id="${g.id}">${icon('plus')} Erste Ausgabe</button></div></div>`) : ''}

    ${tab === 'chores' ? choresView(g) : ''}`;
}

export default {
  title: (c) => (c.params.id && c.params.id !== 'import' ? getGroup(c.params.id)?.name ?? 'WG-Kasse' : 'WG-Kasse'),
  render(c) {
    const { state, params, ui } = c;
    if (params.id === 'import') return html`<div class="empty"><div class="empty-icon">${icon('download')}</div><h3>Gruppe wird geladen …</h3></div>`;
    if (params.id) {
      const g = getGroup(params.id);
      if (!g) return html`<a class="back-link" href="#/wg">${icon('chevronLeft', 'sm')} WG-Kasse</a><div class="empty"><h3>Gruppe nicht gefunden</h3></div>`;
      return groupView(state, g, ui);
    }
    return listView(state);
  },
  mount(el, c) {
    if (c.params.id === 'import' && c.query.d) importFromLink(c.query.d);
  },
  actions: {
    'new-group': () => groupForm(null),
    'import-group': () => importDialog(),
    tab: (c, el) => { c.ui.tab = el.dataset.t; c.rerender(); },
    'new-gexp': (c, el) => expenseForm(el.dataset.id, null),
    'edit-gexp': (c, el) => expenseForm(el.dataset.id, el.dataset.x),
    settle: (c, el) => paymentForm(el.dataset.id, null, { from: el.dataset.from, to: el.dataset.to, amount: Number(el.dataset.amount) }),
    chores: (c, el) => choresForm(el.dataset.id),
    'chore-done': (c, el) => store.update((s) => {
      const g = s.groups.find((x) => x.id === el.dataset.id);
      g.chores.done ??= {};
      const list = g.chores.done[el.dataset.key] ?? [];
      const i = Number(el.dataset.i);
      g.chores.done[el.dataset.key] = list.includes(i) ? list.filter((x) => x !== i) : [...list, i];
    }),
    'group-menu': (c, el) => {
      const id = el.dataset.id;
      menu({
        title: getGroup(id).name,
        items: [
          { icon: 'share', label: 'Per Link teilen', sub: 'Gruppe an Mitbewohner:innen schicken', color: '#0b84e3', onClick: () => shareGroup(id) },
          { icon: 'handshake', label: 'Zahlung erfassen', color: '#2f9e5b', onClick: () => paymentForm(id, null) },
          { icon: 'users', label: 'Mitglieder verwalten', color: '#d6409f', onClick: () => membersForm(id) },
          { icon: 'sparkles', label: 'Putzplan bearbeiten', color: '#12a594', onClick: () => choresForm(id) },
          { icon: 'edit', label: 'Name & Symbol', color: '#5b5bd6', onClick: () => groupForm(id) },
        ],
      });
    },
  },
};

