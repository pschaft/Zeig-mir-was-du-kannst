// Budget: Monatsübersicht, Tagesbudget, Kategorien, Fixkosten, Trend.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { bars, donut } from '../core/charts.js';
import { form, toast, menu, sheet, confirm } from '../core/ui.js';
import { uid, download, groupBy, sortBy } from '../core/util.js';
import { today, monthKey, addMonths, monthLabel, fmtDate, relDay, MONTHS_SHORT } from '../core/date.js';
import { fmtMoney, plural, pct } from '../core/format.js';
import { removeWithUndo } from '../core/undo.js';
import { monthSummary, catMap, applyRecurring, trend, fixedMonthly } from '../logic/budget.js';
import { COURSE_COLORS } from '../logic/state.js';

const catOptions = (s, type) => s.budget.categories.filter((c) => c.type === type).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));

export async function txForm(id, preset = {}) {
  const s = store.state;
  const t = id ? s.budget.transactions.find((x) => x.id === id) : null;
  const type = t?.type ?? preset.type ?? 'expense';
  const notes = [...new Set(s.budget.transactions.slice(-200).map((x) => x.note).filter(Boolean))].slice(-30);
  const v = await form({
    title: t ? 'Buchung bearbeiten' : type === 'income' ? 'Neue Einnahme' : 'Neue Ausgabe',
    fields: [
      { name: 'type', type: 'segmented', options: [{ value: 'expense', label: '💸 Ausgabe' }, { value: 'income', label: '💶 Einnahme' }], value: type },
      { name: 'amount', label: 'Betrag', type: 'money', value: t?.amount ?? preset.amount ?? null, required: true, autofocus: true },
      { name: 'catExpense', label: 'Kategorie', type: 'pills', options: catOptions(s, 'expense'), value: t?.type === 'expense' ? t.categoryId : preset.categoryId ?? 'food', show: (x) => x.type === 'expense' },
      { name: 'catIncome', label: 'Kategorie', type: 'pills', options: catOptions(s, 'income'), value: t?.type === 'income' ? t.categoryId : 'job', show: (x) => x.type === 'income' },
      { name: 'note', label: 'Notiz', value: t?.note ?? preset.note ?? '', placeholder: 'z. B. Rewe, Mensa, Kino …', list: notes },
      { name: 'date', label: 'Datum', type: 'date', value: t?.date ?? preset.date ?? today(), required: true },
      t?.recurringId && { type: 'html', html: html`<p class="hint">${icon('repeat', 'xs')} Automatisch gebucht aus deinen Fixkosten.</p>` },
    ].filter(Boolean),
    validate: (x) => (x.amount != null && x.amount <= 0 ? { amount: 'Betrag muss größer als 0 sein' } : null),
    danger: t ? 'Löschen' : null,
    submitLabel: t ? 'Speichern' : 'Eintragen',
  });
  if (v === 'delete') return removeWithUndo((st) => st.budget.transactions, id, 'Buchung gelöscht');
  if (!v) return;
  const data = { type: v.type, amount: v.amount, categoryId: v.type === 'expense' ? v.catExpense || 'other' : v.catIncome || 'income_other', note: v.note, date: v.date };
  store.update((st) => {
    if (t) Object.assign(st.budget.transactions.find((x) => x.id === id), data);
    else st.budget.transactions.push({ id: uid('t'), ...data, createdAt: Date.now() });
  });
  if (!t) {
    const sm = monthSummary(store.state.budget, monthKey(data.date));
    const over = data.type === 'expense' && sm.isCurrent && sm.leftToday < 0;
    toast(`${data.type === 'income' ? '+' : '−'}${fmtMoney(data.amount)} eingetragen${sm.isCurrent && data.type === 'expense' ? ` · heute noch ${fmtMoney(sm.leftToday)}` : ''}`, { type: over ? 'error' : 'success', iconName: over ? 'alert' : 'check' });
  } else toast('Gespeichert', { type: 'success' });
}

async function recurringForm(id) {
  const s = store.state;
  const r = id ? s.budget.recurring.find((x) => x.id === id) : null;
  const cur = monthKey(today());
  const v = await form({
    title: r ? 'Fixkosten bearbeiten' : 'Neue Fixkosten / festes Einkommen',
    intro: 'Wird jeden Monat am gewählten Tag automatisch gebucht.',
    fields: [
      { name: 'type', type: 'segmented', options: [{ value: 'expense', label: 'Ausgabe' }, { value: 'income', label: 'Einnahme' }], value: r?.type ?? 'expense' },
      { name: 'note', label: 'Bezeichnung', value: r?.note ?? '', required: true, placeholder: 'z. B. Miete, Spotify, BAföG …', autofocus: !r },
      { type: 'row', fields: [
        { name: 'amount', label: 'Betrag pro Monat', type: 'money', value: r?.amount ?? null, required: true },
        { name: 'day', label: 'Am Tag', type: 'number', integer: true, min: 1, max: 28, value: r?.day ?? 1, required: true },
      ] },
      { name: 'catExpense', label: 'Kategorie', type: 'pills', options: catOptions(s, 'expense'), value: r?.type !== 'income' ? r?.categoryId ?? 'subs' : 'subs', show: (x) => x.type === 'expense' },
      { name: 'catIncome', label: 'Kategorie', type: 'pills', options: catOptions(s, 'income'), value: r?.type === 'income' ? r.categoryId : 'job', show: (x) => x.type === 'income' },
      { name: 'active', label: 'Aktiv', type: 'switch', value: r?.active ?? true },
      !r && { name: 'thisMonth', label: 'Auch für diesen Monat buchen (falls schon fällig)', type: 'switch', value: true },
    ].filter(Boolean),
    danger: r ? 'Löschen' : null,
  });
  if (v === 'delete') return removeWithUndo((st) => st.budget.recurring, id, 'Fixkosten gelöscht');
  if (!v) return;
  const data = { type: v.type, note: v.note, amount: v.amount, day: v.day, categoryId: v.type === 'expense' ? v.catExpense : v.catIncome, active: v.active };
  store.update((st) => {
    if (r) Object.assign(st.budget.recurring.find((x) => x.id === id), data);
    else st.budget.recurring.push({ id: uid('r'), ...data, startMonth: v.thisMonth ? cur : addMonths(cur, 1), lastApplied: null, createdAt: Date.now() });
    applyRecurring(st.budget);
  });
  toast('Gespeichert', { type: 'success' });
}

async function limitsForm() {
  const s = store.state;
  const cats = s.budget.categories.filter((c) => c.type === 'expense');
  const v = await form({
    title: 'Budget festlegen',
    fields: [
      { name: 'limit', label: 'Monatsbudget (alle Ausgaben inkl. Miete)', type: 'money', value: s.budget.limit, required: true },
      { type: 'section', label: 'Limits pro Kategorie (optional)' },
      ...cats.map((c) => ({ name: `l_${c.id}`, label: `${c.emoji} ${c.name}`, type: 'money', value: c.limit, placeholder: 'kein Limit' })),
    ],
  });
  if (!v) return;
  store.update((st) => {
    st.budget.limit = v.limit;
    for (const c of st.budget.categories) if (`l_${c.id}` in v) c.limit = v[`l_${c.id}`] || null;
  });
  toast('Budget gespeichert', { type: 'success' });
}

async function categoryForm(id) {
  const s = store.state;
  const c = id ? s.budget.categories.find((x) => x.id === id) : null;
  const v = await form({
    title: c ? 'Kategorie bearbeiten' : 'Neue Kategorie',
    fields: [
      { type: 'row', fields: [
        { name: 'emoji', label: 'Emoji', value: c?.emoji ?? '🏷️', maxlength: 4, required: true },
        { name: 'name', label: 'Name', value: c?.name ?? '', required: true, autofocus: !c },
      ] },
      !c && { name: 'type', label: 'Art', type: 'segmented', options: [{ value: 'expense', label: 'Ausgaben' }, { value: 'income', label: 'Einnahmen' }], value: 'expense' },
      { name: 'color', label: 'Farbe', type: 'color', value: c?.color ?? COURSE_COLORS[s.budget.categories.length % COURSE_COLORS.length] },
    ].filter(Boolean),
    danger: c && !['other', 'income_other'].includes(c.id) ? 'Löschen' : null,
  });
  if (v === 'delete') {
    if (!(await confirm({ title: `„${c.name}“ löschen?`, message: 'Buchungen dieser Kategorie werden „Sonstiges“ zugeordnet.', confirmLabel: 'Löschen', danger: true }))) return;
    store.update((st) => {
      st.budget.categories = st.budget.categories.filter((x) => x.id !== id);
      const fallback = c.type === 'income' ? 'income_other' : 'other';
      for (const t of st.budget.transactions) if (t.categoryId === id) t.categoryId = fallback;
      for (const r of st.budget.recurring) if (r.categoryId === id) r.categoryId = fallback;
    });
    return;
  }
  if (!v) return;
  store.update((st) => {
    if (c) Object.assign(st.budget.categories.find((x) => x.id === id), { emoji: v.emoji, name: v.name, color: v.color });
    else st.budget.categories.push({ id: uid('cat'), emoji: v.emoji, name: v.name, color: v.color, type: v.type, limit: null });
  });
}

function categoriesSheet() {
  const s = store.state;
  const body = html`<div class="list">${s.budget.categories.map((c) => html`<div class="li"><span class="cat-icon" style="--c:${c.color}">${c.emoji}</span><div class="li-main"><div class="li-title">${c.name}</div><div class="li-sub">${c.type === 'income' ? 'Einnahmen' : 'Ausgaben'}</div></div><button class="icon-btn sm" data-cat="${c.id}" aria-label="Bearbeiten">${icon('edit')}</button></div>`)}</div>`;
  const foot = html`<button class="btn btn-soft" data-newcat>${icon('plus')} Kategorie</button><span class="spacer"></span><button class="btn btn-primary" data-close>Fertig</button>`;
  sheet({
    title: 'Kategorien', body, foot,
    onMount: (el, close) => {
      el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { close(); setTimeout(() => categoryForm(b.dataset.cat), 220); }));
      el.querySelector('[data-newcat]').addEventListener('click', () => { close(); setTimeout(() => categoryForm(null), 220); });
    },
  });
}

function exportCSV() {
  const s = store.state;
  const cm = catMap(s.budget);
  const rows = [['Datum', 'Typ', 'Kategorie', 'Notiz', 'Betrag'].join(';')];
  for (const t of sortBy(s.budget.transactions, (x) => x.date)) {
    rows.push([t.date, t.type === 'income' ? 'Einnahme' : 'Ausgabe', cm.get(t.categoryId)?.name ?? '', `"${(t.note ?? '').replace(/"/g, '""')}"`, ((t.type === 'income' ? 1 : -1) * t.amount / 100).toFixed(2).replace('.', ',')].join(';'));
  }
  download(`unikram-budget-${today()}.csv`, '﻿' + rows.join('\n'), 'text/csv');
  toast('CSV exportiert (öffnet sich in Excel/Numbers)', { type: 'success' });
}

export default {
  title: 'Budget',
  render({ state, ui }) {
    const b = state.budget;
    const cur = monthKey(today());
    ui.month ??= cur;
    const sm = monthSummary(b, ui.month);
    const cm = catMap(b);
    const spentPct = sm.limit ? (sm.expenses / sm.limit) * 100 : 0;
    const catRows = sortBy([...sm.byCat.entries()], ([, v]) => -v);
    const limited = b.categories.filter((c) => c.type === 'expense' && c.limit);
    const txByDay = groupBy(sortBy(sm.txs, (t) => t.date, (t) => t.createdAt || 0).reverse(), (t) => t.date);
    const days = [...txByDay.keys()].sort().reverse();
    const tr = trend(b, 6);
    const fixed = fixedMonthly(b);
    const isCur = ui.month === cur;

    return html`
      <header class="page-head">
        <div class="titles"><h1>Budget</h1><p class="page-sub">${fmtMoney(b.limit)} pro Monat · Fixkosten ${fmtMoney(fixed.expenses)}</p></div>
        <div class="page-actions">
          <button class="icon-btn filled" data-action="budget-menu" aria-label="Mehr">${icon('more')}</button>
          <button class="btn btn-primary" data-action="new-expense">${icon('plus')}<span class="hide-mobile">Ausgabe</span></button>
        </div>
      </header>

      <div class="week-nav">
        <button class="icon-btn filled" data-action="month" data-d="-1" aria-label="Vorheriger Monat">${icon('chevronLeft')}</button>
        <div class="wn-title">${monthLabel(ui.month)}${isCur ? html`<span class="wn-sub">noch ${plural(sm.daysLeft, 'Tag', 'Tage')}</span>` : ''}</div>
        ${!isCur ? html`<button class="btn btn-sm btn-soft" data-action="month-now">Heute</button>` : ''}
        <button class="icon-btn filled" data-action="month" data-d="1" aria-label="Nächster Monat">${icon('chevronRight')}</button>
      </div>

      <div class="grid grid-3">
        <section class="card ${isCur ? 'accent' : ''} span-2">
          <div class="row-between" style="align-items:flex-start">
            <div>
              <div class="card-title">${sm.remaining >= 0 ? 'Noch übrig' : 'Überzogen'}</div>
              <div class="stat-value xl mt-4">${fmtMoney(Math.abs(sm.remaining))}</div>
              <div class="small" style="opacity:.85">von ${fmtMoney(sm.limit)} · ${fmtMoney(sm.expenses)} ausgegeben</div>
            </div>
            ${isCur ? html`<div class="right"><div class="card-title">Pro Tag</div><div class="stat-value mt-4">${fmtMoney(Math.max(0, sm.perDay))}</div><div class="small" style="opacity:.85">heute noch ${fmtMoney(sm.leftToday)}</div></div>` : ''}
          </div>
          <div class="progress lg mt-16 ${sm.expenses > sm.limit ? 'over' : ''}"><div class="progress-bar" style="width:${Math.min(100, spentPct)}%"></div>${isCur && sm.limit ? html`<span class="marker" style="left:${Math.min(100, (sm.expectedByNow / sm.limit) * 100)}%" title="Soll-Stand heute"></span>` : ''}</div>
          <div class="row-between tiny mt-8" style="opacity:.85">
            <span>${Math.round(spentPct)} % verbraucht${isCur ? ` · Strich = Soll-Stand heute` : ''}</span>
            ${sm.fixedAhead ? html`<span>${fmtMoney(sm.fixedAhead)} Fixkosten stehen noch an</span>` : ''}
          </div>
          ${sm.tooFast ? html`<div class="banner mt-12" style="background:rgb(255 255 255 / .16);color:#fff">${icon('alert')}<span>Du gibst gerade schneller aus als geplant. Mit ${fmtMoney(Math.max(0, sm.perDay))} am Tag kommst du bis Monatsende hin.</span></div>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('cash')} Bilanz</span></div>
          <div class="stack-sm">
            <div class="row-between"><span class="muted">Einnahmen</span><span class="money pos">${fmtMoney(sm.income, { sign: true })}</span></div>
            <div class="row-between"><span class="muted">Ausgaben</span><span class="money">${fmtMoney(-sm.expenses)}</span></div>
            <div class="divider" style="margin:6px 0"></div>
            <div class="row-between"><b>Saldo</b><span class="money ${sm.balance >= 0 ? 'pos' : 'danger-text'}" style="font-size:18px">${fmtMoney(sm.balance, { sign: true })}</span></div>
          </div>
          ${sm.income ? html`<p class="tiny muted mt-12">${sm.balance >= 0 ? `Du sparst diesen Monat ${Math.round(pct(sm.balance, sm.income))} % deiner Einnahmen. 💪` : 'Mehr ausgegeben als eingenommen – check die Kategorien.'}</p>` : ''}
        </section>
      </div>

      <div class="grid grid-2 mt-16">
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('layers')} Kategorien</span><button class="card-link" data-action="limits">Limits</button></div>
          ${catRows.length ? html`<div class="donut-wrap">
            ${donut({ segments: catRows.map(([id, v]) => ({ value: v, color: cm.get(id)?.color ?? '#888', label: cm.get(id)?.name })), center: html`<div class="tiny muted">Ausgaben</div><div class="bold num">${fmtMoney(sm.expenses, { round: true })}</div>` })}
            <div class="donut-legend">${catRows.slice(0, 7).map(([id, v]) => {
              const c = cm.get(id);
              return html`<div class="legend-row"><i class="dot" style="--c:${c?.color}"></i><span class="lr-name truncate">${c?.emoji} ${c?.name ?? id}</span><span class="num semi">${fmtMoney(v, { round: true })}</span></div>`;
            })}</div>
          </div>` : html`<p class="muted small">Noch keine Ausgaben in diesem Monat.</p>`}
          ${limited.length ? html`<div class="section-title">Limits</div><div class="stack">${limited.map((c) => {
            const v = sm.byCat.get(c.id) ?? 0;
            return html`<div><div class="row-between small"><span>${c.emoji} ${c.name}</span><span class="num ${v > c.limit ? 'danger-text semi' : 'muted'}">${fmtMoney(v, { round: true })} / ${fmtMoney(c.limit, { round: true })}</span></div>
              <div class="progress sm mt-4 ${v > c.limit ? 'over' : ''}" style="--c:${c.color}"><div class="progress-bar" style="width:${Math.min(100, pct(v, c.limit))}%"></div>${isCur ? html`<span class="marker" style="left:${sm.pace * 100}%"></span>` : ''}</div></div>`;
          })}</div>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${icon('trending')} Letzte 6 Monate</span></div>
          ${bars({ data: tr.map((x) => ({ label: MONTHS_SHORT[Number(x.key.slice(5)) - 1].replace('.', ''), value: x.expenses / 100, highlight: x.key === ui.month, title: `${monthLabel(x.key)}: ${fmtMoney(x.expenses)} Ausgaben, ${fmtMoney(x.income)} Einnahmen` })), goal: b.limit / 100, format: (v) => `${Math.round(v)}€`, height: 110 })}
          <div class="section-title">Fixkosten & festes Einkommen <button class="card-link" data-action="new-recurring" style="margin-left:auto">${icon('plus')} Neu</button></div>
          ${b.recurring.length ? html`<div class="list">${sortBy(b.recurring, (r) => r.type, (r) => r.day).map((r) => {
            const c = cm.get(r.categoryId);
            return html`<div class="li li-clickable" data-action="edit-recurring" data-id="${r.id}" data-key="${r.id}" style="${r.active ? '' : 'opacity:.5'}">
              <span class="cat-icon" style="--c:${c?.color}">${c?.emoji ?? '🔁'}</span>
              <div class="li-main"><div class="li-title">${r.note}</div><div class="li-sub"><span>am ${r.day}. jeden Monats</span>${!r.active ? html`<span>pausiert</span>` : ''}</div></div>
              <span class="money ${r.type === 'income' ? 'pos' : ''}">${r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount)}</span>
            </div>`;
          })}</div>` : html`<p class="muted small">Miete, Handy, Abos, BAföG … einmal eintragen, jeden Monat automatisch gebucht.</p>`}
        </section>
      </div>

      <div class="li-group">Buchungen <span class="count">${sm.txs.length}</span></div>
      ${days.length ? html`<div class="card flush"><div class="list">${days.slice(0, ui.allTx ? 999 : 12).map((d) => {
        const list = txByDay.get(d);
        const daySum = list.reduce((a, t) => a + (t.type === 'expense' ? t.amount : 0), 0);
        return html`<div class="li" style="min-height:auto;padding-top:12px;padding-bottom:6px;background:var(--surface-2)"><span class="tiny semi muted" style="flex:1">${relDay(d)} · ${fmtDate(d)}</span>${daySum ? html`<span class="tiny muted num">−${fmtMoney(daySum)}</span>` : ''}</div>
          ${list.map((t) => {
            const c = cm.get(t.categoryId);
            return html`<div class="li li-clickable" data-action="edit-tx" data-id="${t.id}" data-key="${t.id}">
              <span class="cat-icon" style="--c:${c?.color}">${c?.emoji ?? '💸'}</span>
              <div class="li-main"><div class="li-title">${t.note || c?.name}</div><div class="li-sub"><span>${c?.name ?? ''}</span>${t.recurringId ? html`<span>${icon('repeat')} fix</span>` : ''}</div></div>
              <span class="money ${t.type === 'income' ? 'pos' : ''}">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</span>
            </div>`;
          })}`;
      })}</div></div>
      ${days.length > 12 && !ui.allTx ? html`<button class="btn btn-ghost btn-block mt-8" data-action="all-tx">Alle Buchungen anzeigen</button>` : ''}`
      : html`<div class="card"><div class="empty compact"><div class="empty-icon">🧾</div><p>Keine Buchungen in ${monthLabel(ui.month)}.</p><button class="btn btn-soft btn-sm" data-action="new-expense">${icon('plus')} Ausgabe eintragen</button></div></div>`}`;
  },
  actions: {
    month: (c, el) => { c.ui.month = addMonths(c.ui.month ?? monthKey(today()), Number(el.dataset.d)); c.ui.allTx = false; c.rerender(); },
    'month-now': (c) => { c.ui.month = monthKey(today()); c.rerender(); },
    'edit-tx': (c, el) => txForm(el.dataset.id),
    'new-recurring': () => recurringForm(null),
    'edit-recurring': (c, el) => recurringForm(el.dataset.id),
    limits: () => limitsForm(),
    'all-tx': (c) => { c.ui.allTx = true; c.rerender(); },
    'budget-menu': () => menu({
      title: 'Budget',
      items: [
        { icon: 'target', label: 'Monatsbudget & Limits', color: '#5b5bd6', onClick: limitsForm },
        { icon: 'plus', label: 'Einnahme eintragen', color: '#2f9e5b', onClick: () => txForm(null, { type: 'income' }) },
        { icon: 'repeat', label: 'Fixkosten hinzufügen', color: '#0b84e3', onClick: () => recurringForm(null) },
        { icon: 'tag', label: 'Kategorien verwalten', color: '#d6409f', onClick: categoriesSheet },
        { icon: 'download', label: 'Als CSV exportieren', color: '#687076', onClick: exportCSV },
      ],
    }),
  },
};

