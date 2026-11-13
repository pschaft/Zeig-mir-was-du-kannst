// Karteikarten: Stapel, Karten, Import/Export, Statistik.
import { store } from '../core/store.js';
import { html, md } from '../core/html.js';
import { icon } from '../core/icons.js';
import { bars } from '../core/charts.js';
import { form, toast, confirm, menu } from '../core/ui.js';
import { uid, sortBy, norm, pickFile } from '../core/util.js';
import { saveFile } from '../services/files.js';
import { navigate } from '../core/router.js';
import { today, addDays, tsToDate, WD, weekday, fmtDate, DAY_MS, dayStartTs } from '../core/date.js';
import { plural, fmtInterval, pct } from '../core/format.js';
import { withUndo, removeWithUndo } from '../core/undo.js';
import { newSrs, cardStatus, dueCounts, buildQueue, introducedToday } from '../logic/srs.js';
import { courseMap } from '../logic/timetable.js';
import { courseOptions } from './tasks.js';

const STATUS = {
  new: { label: 'Neu', color: '#0b84e3' },
  learning: { label: 'Lernphase', color: '#ee6b12' },
  due: { label: 'Fällig', color: '#e5484d' },
  young: { label: 'Jung', color: '#8d9a12' },
  mature: { label: 'Gefestigt', color: '#2f9e5b' },
};

export async function deckForm(id, preset = {}) {
  const s = store.state;
  const d = id ? s.decks.find((x) => x.id === id) : null;
  const v = await form({
    title: d ? 'Stapel bearbeiten' : 'Neuer Stapel',
    fields: [
      { name: 'name', label: 'Name', value: d?.name ?? preset.name ?? '', required: true, autofocus: true, placeholder: 'z. B. Englisch Vokabeln, Statistik-Formeln …' },
      { name: 'courseId', label: 'Kurs', type: 'select', options: courseOptions(s), value: d?.courseId ?? preset.courseId ?? '' },
    ],
    danger: d ? 'Stapel löschen' : null,
    submitLabel: d ? 'Speichern' : 'Anlegen',
  });
  if (v === 'delete') return deleteDeck(id);
  if (!v) return null;
  let newId = id;
  store.update((st) => {
    if (d) Object.assign(st.decks.find((x) => x.id === id), v);
    else { newId = uid('d'); st.decks.push({ id: newId, ...v, createdAt: Date.now() }); }
  });
  if (!d) toast('Stapel angelegt – jetzt Karten hinzufügen', { type: 'success' });
  return newId;
}

async function deleteDeck(id) {
  const s = store.state;
  const d = s.decks.find((x) => x.id === id);
  const n = s.cards.filter((c) => c.deckId === id).length;
  if (!(await confirm({ title: `„${d.name}“ löschen?`, message: `Der Stapel und ${plural(n, 'Karte', 'Karten')} werden gelöscht.`, confirmLabel: 'Löschen', danger: true }))) return;
  withUndo((st) => {
    st.decks = st.decks.filter((x) => x.id !== id);
    st.cards = st.cards.filter((c) => c.deckId !== id);
  }, 'Stapel gelöscht');
  navigate('lernen');
}

export async function cardForm(id, preset = {}) {
  const s = store.state;
  const card = id ? s.cards.find((x) => x.id === id) : null;
  let deckId = card?.deckId ?? preset.deckId;
  if (!s.decks.length) {
    deckId = await deckForm(null);
    if (!deckId) return;
  }
  const decks = store.state.decks;
  const v = await form({
    title: card ? 'Karte bearbeiten' : 'Neue Karte',
    fields: [
      { name: 'deckId', label: 'Stapel', type: 'select', options: decks.map((d) => ({ value: d.id, label: d.name })), value: deckId ?? decks[0]?.id },
      { name: 'front', label: 'Vorderseite (Frage)', type: 'textarea', rows: 3, value: card?.front ?? '', required: true, autofocus: true, placeholder: 'z. B. Was besagt das Master-Theorem?' },
      { name: 'back', label: 'Rückseite (Antwort)', type: 'textarea', rows: 4, value: card?.back ?? '', required: true },
      { type: 'html', html: html`<p class="hint">Formatierung: **fett**, *kursiv*, \`code\`, Zeilenumbrüche.</p>` },
      !card && { name: 'another', label: 'Danach direkt die nächste Karte', type: 'switch', value: preset.another ?? true },
      card && { type: 'html', html: html`<div class="row wrap small muted"><span class="badge" style="background:color-mix(in srgb, ${STATUS[cardStatus(card)].color} 15%, var(--surface));color:${STATUS[cardStatus(card)].color}">${STATUS[cardStatus(card)].label}</span>${card.srs.reps ? html`<span>${plural(card.srs.reps, 'Wiederholung', 'Wiederholungen')}</span>` : ''}${card.srs.state === 'review' ? html`<span>nächste: ${fmtDate(tsToDate(card.srs.due))}</span>` : ''}${card.srs.lapses ? html`<span>${card.srs.lapses}× vergessen</span>` : ''}</div>` },
    ].filter(Boolean),
    danger: card ? 'Löschen' : null,
    submitLabel: card ? 'Speichern' : 'Hinzufügen',
  });
  if (v === 'delete') return removeWithUndo((st) => st.cards, id, 'Karte gelöscht');
  if (!v) return;
  store.update((st) => {
    if (card) Object.assign(st.cards.find((x) => x.id === id), { deckId: v.deckId, front: v.front, back: v.back });
    else st.cards.push({ id: uid('k'), deckId: v.deckId, front: v.front, back: v.back, createdAt: Date.now(), srs: newSrs() });
  });
  toast(card ? 'Gespeichert' : 'Karte hinzugefügt', { type: 'success' });
  if (!card && v.another) setTimeout(() => cardForm(null, { deckId: v.deckId, another: true }), 220);
}

/** Zeile "Vorderseite<TRENNER>Rückseite" zerlegen. */
export function splitLine(line, sep = 'auto') {
  const seps = sep === 'auto' ? ['\t', ' ;; ', ';', ' – ', ' - ', ' = ', ' : '] : [sep === 'tab' ? '\t' : sep];
  for (const s of seps) {
    const i = line.indexOf(s);
    if (i > 0) return [line.slice(0, i).trim(), line.slice(i + s.length).trim()];
  }
  return null;
}

async function bulkImport(deckId, prefill = '') {
  const v = await form({
    title: 'Karten importieren',
    intro: 'Eine Karte pro Zeile: Vorderseite und Rückseite getrennt durch Tab (z. B. Quizlet-/Anki-Export), Semikolon, „ - “ oder „ = “.',
    wide: true,
    fields: [
      { name: 'text', label: 'Karten', type: 'textarea', rows: 10, value: prefill, required: true, placeholder: 'to scrutinize ; genau prüfen\nambiguous ; mehrdeutig\nBinäre Suche - O(log n)' },
      { name: 'sep', label: 'Trennzeichen', type: 'segmented', options: [{ value: 'auto', label: 'Automatisch' }, { value: 'tab', label: 'Tab' }, { value: ';', label: ';' }, { value: ' - ', label: '-' }, { value: ' = ', label: '=' }], value: 'auto' },
      { name: 'reverse', label: 'Zusätzlich umgekehrte Karten anlegen (Rückseite → Vorderseite)', type: 'switch', value: false },
      { type: 'html', html: html`<div class="banner info" data-preview>${icon('info')}<span>Vorschau erscheint beim Tippen.</span></div><button type="button" class="btn btn-ghost btn-sm mt-8" data-file>${icon('upload')} Aus Datei (.txt, .csv, .tsv)</button>` },
    ],
    submitLabel: 'Importieren',
    onChange: (vals, el) => {
      const lines = vals.text.split('\n').map((l) => l.trim()).filter(Boolean);
      const ok = lines.map((l) => splitLine(l, vals.sep)).filter(Boolean);
      const box = el.querySelector('[data-preview]');
      box.className = `banner ${ok.length && ok.length === lines.length ? 'success' : ok.length ? 'warn' : 'info'}`;
      box.innerHTML = String(html`${icon(ok.length ? 'check' : 'info')}<span>${ok.length ? `${plural(ok.length * (vals.reverse ? 2 : 1), 'Karte wird', 'Karten werden')} angelegt${ok.length < lines.length ? ` · ${lines.length - ok.length} Zeilen ohne Trennzeichen werden übersprungen` : ''}` : 'Noch keine gültigen Zeilen erkannt.'}${ok[0] ? html`<br><span class="tiny">Beispiel: „${ok[0][0]}“ → „${ok[0][1]}“</span>` : ''}</span>`);
    },
    onMount: (el, formEl) => {
      el.querySelector('[data-file]').addEventListener('click', async () => {
        const f = await pickFile('.txt,.csv,.tsv,text/plain');
        if (!f) return;
        formEl.elements.text.value = f.text.replace(/\r/g, '');
        formEl.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
  });
  if (!v) return;
  const pairs = v.text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => splitLine(l, v.sep)).filter(Boolean);
  if (!pairs.length) { toast('Keine Karten erkannt', { type: 'error' }); return; }
  store.update((st) => {
    let t = Date.now();
    for (const [front, back] of pairs) {
      st.cards.push({ id: uid('k'), deckId, front, back, createdAt: t++, srs: newSrs() });
      if (v.reverse) st.cards.push({ id: uid('k'), deckId, front: back, back: front, createdAt: t++, srs: newSrs() });
    }
  });
  toast(`${plural(pairs.length * (v.reverse ? 2 : 1), 'Karte', 'Karten')} importiert 🎉`, { type: 'success' });
}

function exportDeck(deck) {
  const cards = store.state.cards.filter((c) => c.deckId === deck.id);
  const clean = (s) => String(s).replace(/\t/g, ' ').replace(/\n/g, '<br>');
  saveFile(`${deck.name.replace(/[^\p{L}\d]+/gu, '_')}.txt`, cards.map((c) => `${clean(c.front)}\t${clean(c.back)}`).join('\n'), 'text/plain');
}

function deckStats(state, deckId) {
  const cards = deckId ? state.cards.filter((c) => c.deckId === deckId) : state.cards;
  const counts = { new: 0, learning: 0, due: 0, young: 0, mature: 0 };
  for (const c of cards) counts[cardStatus(c)]++;
  return { cards, counts };
}

function statusBar(counts, total) {
  if (!total) return '';
  return html`<div class="progress" style="display:flex;height:8px">${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => html`<div style="width:${(n / total) * 100}%;background:${STATUS[k].color}" title="${STATUS[k].label}: ${n}"></div>`)}</div>`;
}

/* ------------------------------ Übersicht ------------------------------ */

function overview(state) {
  const all = dueCounts(state.cards, state.reviews, { newLimit: state.settings.newCardsPerDay });
  const intro = introducedToday(state.reviews, state.cards);
  const cm = courseMap(state);
  const d = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(d, i - 13));
  const perDay = new Map(days.map((x) => [x, 0]));
  let rv = 0, ok = 0;
  const since = Date.now() - 30 * DAY_MS;
  for (const r of state.reviews) {
    const k = tsToDate(r.ts);
    if (perDay.has(k)) perDay.set(k, perDay.get(k) + 1);
    if (r.ts >= since && r.prevState === 'review') { rv++; if (r.rating > 1) ok++; }
  }
  const total = deckStats(state);
  // Prognose: Fälligkeiten der nächsten 7 Tage
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(d, i);
    const end = dayStartTs(addDays(day, 1));
    const start = i === 0 ? 0 : dayStartTs(day);
    return { date: day, n: state.cards.filter((c) => c.srs.state !== 'new' && c.srs.due >= start && c.srs.due < end).length };
  });
  return html`
    <header class="page-head">
      <div class="titles"><h1>Karteikarten</h1><p class="page-sub">${plural(state.cards.length, 'Karte', 'Karten')} in ${plural(state.decks.length, 'Stapel', 'Stapeln')} · Spaced Repetition (FSRS)</p></div>
      <div class="page-actions">
        <button class="btn btn-soft" data-action="new-card">${icon('plus')}Karte</button>
        <button class="btn btn-primary" data-action="new-deck">${icon('plus')}Stapel</button>
      </div>
    </header>
    ${!state.decks.length ? html`<div class="card"><div class="empty">
      <div class="empty-icon">🃏</div><h3>Lernen, ohne zu viel zu lernen</h3>
      <p>Unikram zeigt dir jede Karte genau dann, wenn du sie fast vergessen hättest. Das spart bis zu 50 % Lernzeit.</p>
      <button class="btn btn-primary" data-action="new-deck">${icon('plus')} Ersten Stapel anlegen</button>
    </div></div>` : html`
    ${all.total ? html`<a class="card accent clickable row-between mb-16" href="#/lernen/alle/session" style="text-decoration:none">
      <div><div class="card-title" style="color:rgb(255 255 255 / .8)">Heute fällig</div><div class="stat-value">${all.total} Karten</div><div class="small" style="opacity:.85">${all.review} Wiederholungen · ${all.fresh} neue · ca. ${Math.max(1, Math.round(all.total * 0.2))} Min</div></div>
      <span class="btn btn-white">${icon('play')} Lernen</span></a>`
    : html`<div class="banner success mb-16">${icon('check')}<span><b>Alles erledigt für heute!</b> Morgen sind ${forecast[1].n} Karten fällig.</span></div>`}
    <div class="grid grid-3">
      ${sortBy(state.decks, (x) => x.name.toLowerCase()).map((deck) => {
        const cards = state.cards.filter((c) => c.deckId === deck.id);
        const st = deckStats(state, deck.id);
        const dc = buildQueue(cards, { newLimit: state.settings.newCardsPerDay, introducedToday: intro });
        const due = dc.filter((c) => c.srs.state !== 'new').length, fresh = dc.length - due;
        const c = cm.get(deck.courseId);
        return html`<div class="card deck-card" data-key="${deck.id}">
          <a href="#/lernen/${deck.id}" style="color:inherit;text-decoration:none">
            <div class="row">${c ? html`<i class="dot" style="--c:${c.color}"></i><span class="tiny muted semi">${c.short || c.name}</span>` : ''}</div>
            <div class="deck-name mt-4">${deck.name}</div>
          </a>
          <div class="deck-counts">
            <span class="badge">${plural(cards.length, 'Karte', 'Karten')}</span>
            ${due ? html`<span class="badge badge-danger">${due} fällig</span>` : ''}
            ${fresh ? html`<span class="badge badge-accent">${fresh} neu</span>` : ''}
            ${st.counts.mature ? html`<span class="badge badge-success">${Math.round(pct(st.counts.mature, cards.length))} % gefestigt</span>` : ''}
          </div>
          ${statusBar(st.counts, cards.length)}
          <div class="row mt-4">
            ${dc.length ? html`<a class="btn btn-primary btn-sm" href="#/lernen/${deck.id}/session">${icon('play')} Lernen</a>` : html`<a class="btn btn-soft btn-sm" href="#/lernen/${deck.id}/session?mode=cram">${icon('zap')} Pauken</a>`}
            <a class="btn btn-ghost btn-sm" href="#/lernen/${deck.id}">Karten ${icon('chevronRight', 'xs')}</a>
          </div>
        </div>`;
      })}
    </div>
    <div class="grid grid-2 mt-16">
      <section class="card">
        <div class="card-head"><span class="card-title">${icon('trending')} Wiederholungen (14 Tage)</span></div>
        ${bars({ data: days.map((x) => ({ label: x === d ? 'Heute' : WD[weekday(x)], value: perDay.get(x), highlight: x === d, title: `${fmtDate(x)}: ${perDay.get(x)} Karten` })), height: 90 })}
        <div class="stats mt-12">
          <div class="stat-tile"><div class="stat-value">${rv ? Math.round((ok / rv) * 100) + ' %' : '–'}</div><div class="stat-label">richtig erinnert (30 T)</div></div>
          <div class="stat-tile"><div class="stat-value">${state.reviews.length}</div><div class="stat-label">Wiederholungen gesamt</div></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><span class="card-title">${icon('layers')} Kartenstatus</span></div>
        ${statusBar(total.counts, total.cards.length)}
        <div class="stack-sm mt-12">${Object.entries(total.counts).map(([k, n]) => html`<div class="legend-row"><i class="dot" style="--c:${STATUS[k].color}"></i><span class="lr-name">${STATUS[k].label}</span><span class="num semi">${n}</span></div>`)}</div>
        <div class="section-title">Fällig in den nächsten 7 Tagen</div>
        ${bars({ data: forecast.map((f, i) => ({ label: i === 0 ? 'Heute' : WD[weekday(f.date)], value: f.n, highlight: i === 0 })), height: 70 })}
      </section>
    </div>`}`;
}

/* ------------------------------ Stapel-Detail ------------------------------ */

function deckView(state, deck, ui) {
  const cm = courseMap(state);
  const c = cm.get(deck.courseId);
  const q = norm(ui.q ?? '');
  const cards = state.cards.filter((x) => x.deckId === deck.id);
  const shown = (q ? cards.filter((x) => norm(x.front + ' ' + x.back).includes(q)) : cards).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const st = deckStats(state, deck.id);
  const queue = buildQueue(cards, { newLimit: state.settings.newCardsPerDay, introducedToday: introducedToday(state.reviews, state.cards) });
  const now = Date.now();
  return html`
    <a class="back-link" href="#/lernen">${icon('chevronLeft', 'sm')} Karteikarten</a>
    <header class="page-head">
      <div class="titles"><h1>${deck.name}</h1>
        <p class="page-sub">${c ? html`<i class="dot" style="--c:${c.color}"></i> ${c.name} · ` : ''}${plural(cards.length, 'Karte', 'Karten')} · ${queue.length} heute fällig</p></div>
      <div class="page-actions">
        <button class="icon-btn filled" data-action="deck-menu" aria-label="Mehr">${icon('more')}</button>
        <button class="btn btn-primary" data-action="new-card">${icon('plus')}<span class="hide-mobile">Karte</span></button>
      </div>
    </header>
    <div class="row wrap mb-16">
      ${queue.length ? html`<a class="btn btn-primary" href="#/lernen/${deck.id}/session">${icon('play')} ${queue.length} Karten lernen</a>` : ''}
      ${cards.length ? html`<a class="btn btn-soft" href="#/lernen/${deck.id}/session?mode=cram">${icon('zap')} Alle pauken</a>` : ''}
      <button class="btn btn-ghost" data-action="bulk">${icon('upload')} Importieren</button>
    </div>
    ${cards.length ? html`
      ${statusBar(st.counts, cards.length)}
      <div class="row wrap tiny muted mt-8 mb-16">${Object.entries(st.counts).filter(([, n]) => n).map(([k, n]) => html`<span class="row" style="gap:4px"><i class="dot" style="--c:${STATUS[k].color};width:8px;height:8px"></i>${STATUS[k].label} ${n}</span>`)}</div>
      <div class="input-group mb-12">${icon('search')}<input class="input" placeholder="Karten durchsuchen …" value="${ui.q ?? ''}" data-input="search" aria-label="Suchen"></div>
      <div class="card flush"><div class="list">${shown.slice(0, ui.limit ?? 100).map((x) => {
        const status = cardStatus(x, now);
        const nextIn = x.srs.state === 'review' && x.srs.due > now ? fmtInterval((x.srs.due - now) / DAY_MS) : null;
        return html`<div class="li li-clickable card-preview" data-action="edit-card" data-id="${x.id}" data-key="${x.id}">
          <i class="state-dot" style="background:${STATUS[status].color}" title="${STATUS[status].label}"></i>
          <div class="li-main"><div class="cp-front md">${md(x.front)}</div><div class="cp-back md">${md(x.back)}</div></div>
          <span class="tiny muted" style="flex:none">${nextIn ? `in ${nextIn}` : STATUS[status].label}</span>
        </div>`;
      })}</div></div>
      ${shown.length > (ui.limit ?? 100) ? html`<button class="btn btn-ghost btn-block mt-8" data-action="more-cards">Mehr anzeigen (${shown.length - (ui.limit ?? 100)})</button>` : ''}
      ${q && !shown.length ? html`<p class="muted center mt-16">Keine Treffer für „${ui.q}“.</p>` : ''}`
    : html`<div class="card"><div class="empty">
        <div class="empty-icon">✍️</div><h3>Noch keine Karten</h3>
        <p>Leg einzeln Karten an oder füge eine ganze Vokabelliste auf einmal ein.</p>
        <div class="row wrap" style="justify-content:center"><button class="btn btn-primary" data-action="new-card">${icon('plus')} Karte</button><button class="btn btn-soft" data-action="bulk">${icon('upload')} Liste importieren</button></div>
      </div></div>`}`;
}

export default {
  title: (c) => (c.params.deck ? c.state.decks.find((d) => d.id === c.params.deck)?.name ?? 'Karteikarten' : 'Karteikarten'),
  render(c) {
    const { state, params, ui } = c;
    if (params.deck) {
      const deck = state.decks.find((d) => d.id === params.deck);
      if (!deck) return html`<a class="back-link" href="#/lernen">${icon('chevronLeft', 'sm')} Karteikarten</a><div class="empty"><h3>Stapel nicht gefunden</h3></div>`;
      return deckView(state, deck, ui);
    }
    return overview(state);
  },
  actions: {
    'new-deck': () => deckForm(null),
    'new-card': (c) => cardForm(null, { deckId: c.params.deck }),
    'edit-card': (c, el) => cardForm(el.dataset.id),
    bulk: (c) => bulkImport(c.params.deck),
    search: (c, el) => { c.ui.q = el.value; c.rerender(); },
    'more-cards': (c) => { c.ui.limit = (c.ui.limit ?? 100) + 200; c.rerender(); },
    'deck-menu': (c) => {
      const deck = store.state.decks.find((d) => d.id === c.params.deck);
      menu({
        title: deck.name,
        items: [
          { icon: 'edit', label: 'Umbenennen / Kurs ändern', color: '#5b5bd6', onClick: () => deckForm(deck.id) },
          { icon: 'repeat', label: 'Rückwärts pauken', sub: 'Antwort zeigen → Frage erinnern (ohne Wertung)', color: '#8e4ec6', onClick: () => navigate(`lernen/${deck.id}/session?mode=cram&reverse=1`) },
          { icon: 'download', label: 'Exportieren (.txt, tab-getrennt)', sub: 'Für Anki, Quizlet oder als Backup', color: '#2f9e5b', onClick: () => exportDeck(deck) },
          { icon: 'reset', label: 'Lernfortschritt zurücksetzen', color: '#d99a00', onClick: async () => {
            if (!(await confirm({ title: 'Fortschritt zurücksetzen?', message: 'Alle Karten dieses Stapels gelten danach wieder als neu.', confirmLabel: 'Zurücksetzen', danger: true }))) return;
            withUndo((st) => st.cards.forEach((x) => { if (x.deckId === deck.id) x.srs = newSrs(); }), 'Fortschritt zurückgesetzt');
          } },
          { icon: 'trash', label: 'Stapel löschen', danger: true, color: '#e5484d', onClick: () => deleteDeck(deck.id) },
        ],
      });
    },
  },
};
