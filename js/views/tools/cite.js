// Quellen zitieren: Formular + DOI/ISBN-Abruf + Literaturliste.
import { store } from '../../core/store.js';
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { form, toast } from '../../core/ui.js';
import { uid, copyText, sortBy } from '../../core/util.js';
import { today } from '../../core/date.js';
import { removeWithUndo } from '../../core/undo.js';
import { formatCitation, STYLES, TYPES, parseAuthors, authorsToText, sortKey, fromCrossref, fromOpenLibrary, fromGoogleBooks, extractDOI, looksLikeDOI, looksLikeISBN } from '../../logic/citation.js';

export async function lookup(q) {
  const s = String(q ?? '').trim();
  if (looksLikeDOI(s)) {
    const doi = extractDOI(s);
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!r.ok) throw new Error('DOI nicht gefunden');
    return fromCrossref((await r.json()).message);
  }
  if (looksLikeISBN(s)) {
    const isbn = s.replace(/[^0-9Xx]/g, '');
    try {
      const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const d = (await r.json())[`ISBN:${isbn}`];
      if (d) return fromOpenLibrary(d);
    } catch { /* weiter mit Google Books */ }
    const r2 = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const item = (await r2.json()).items?.[0];
    if (item) return fromGoogleBooks(item);
    throw new Error('ISBN nicht gefunden');
  }
  throw new Error('Bitte eine DOI (10.xxxx/…) oder ISBN eingeben');
}

const is = (...types) => (x) => types.includes(x.type);

function toSource(v) {
  return {
    type: v.type,
    fields: {
      authors: parseAuthors(v.authors), editors: parseAuthors(v.editors), year: v.year, title: v.title, subtitle: v.subtitle,
      edition: v.edition, place: v.place, publisher: v.publisher, journal: v.journal, volume: v.volume, issue: v.issue,
      pages: v.pages, doi: v.doi, url: v.url, site: v.site, accessed: v.accessed, bookTitle: v.bookTitle,
    },
  };
}

export async function citeForm(id, prefill) {
  const s = store.state;
  const existing = id ? s.citations.find((x) => x.id === id) : null;
  const src = existing ?? prefill ?? { type: 'book', fields: {} };
  const f = src.fields ?? {};
  const style = s.tools.citeStyle ?? 'apa';
  const v = await form({
    title: existing ? 'Quelle bearbeiten' : 'Neue Quelle',
    wide: true,
    fields: [
      !existing && { type: 'html', html: html`<div class="row"><div class="input-group" style="flex:1">${icon('search')}<input class="input" placeholder="DOI oder ISBN – Daten automatisch abrufen" data-lookup-q></div><button type="button" class="btn btn-soft" data-lookup>Abrufen</button></div><p class="hint mt-4">Abfrage bei Crossref bzw. Open Library/Google Books. Alles andere bleibt auf deinem Gerät.</p>` },
      { name: 'type', label: 'Art der Quelle', type: 'segmented', options: TYPES.map((t) => ({ value: t.id, label: t.name })), value: src.type },
      { name: 'authors', label: 'Autor:innen (Nachname, Vorname – eine Person pro Zeile)', type: 'textarea', rows: 2, value: authorsToText(f.authors), placeholder: 'Müller, Anna\nSchmidt, Bernd' },
      { type: 'row', fields: [
        { name: 'year', label: 'Jahr', value: f.year ?? '', placeholder: 'o. J.' },
        { name: 'edition', label: 'Auflage', value: f.edition ?? '', placeholder: 'z. B. 3', show: is('book') },
      ] },
      { name: 'title', label: 'Titel', value: f.title ?? '', required: true },
      { name: 'subtitle', label: 'Untertitel', value: f.subtitle ?? '', show: is('book', 'article', 'chapter') },
      { name: 'editors', label: 'Herausgeber:innen (eine Person pro Zeile)', type: 'textarea', rows: 2, value: authorsToText(f.editors), show: is('chapter') },
      { name: 'bookTitle', label: 'Titel des Sammelbands', value: f.bookTitle ?? '', show: is('chapter') },
      { name: 'journal', label: 'Zeitschrift', value: f.journal ?? '', show: is('article') },
      { type: 'row', name: 'jrow', show: is('article'), fields: [
        { name: 'volume', label: 'Jahrgang/Band', value: f.volume ?? '' },
        { name: 'issue', label: 'Heft', value: f.issue ?? '' },
      ] },
      { name: 'pages', label: 'Seiten', value: f.pages ?? '', placeholder: 'z. B. 45-67', show: is('article', 'chapter') },
      { type: 'row', name: 'prow', show: is('book', 'chapter'), fields: [
        { name: 'place', label: 'Verlagsort', value: f.place ?? '' },
        { name: 'publisher', label: 'Verlag', value: f.publisher ?? '' },
      ] },
      { name: 'site', label: 'Name der Website', value: f.site ?? '', show: is('web') },
      { name: 'url', label: 'URL', type: 'url', value: f.url ?? '', show: is('web', 'article') },
      { name: 'accessed', label: 'Abgerufen am', type: 'date', value: f.accessed ?? today(), show: is('web') },
      { name: 'doi', label: 'DOI', value: f.doi ?? '', show: is('article', 'book', 'chapter') },
      { type: 'html', html: html`<div class="section-title">Vorschau (${STYLES.find((x) => x.id === style)?.name})</div><div class="citation-out" data-cite-preview></div><p class="tiny muted mt-4" data-cite-intext></p>` },
    ].filter(Boolean),
    danger: existing ? 'Löschen' : null,
    submitLabel: existing ? 'Speichern' : 'Zur Literaturliste',
    onChange: (vals, el) => {
      const out = formatCitation(toSource(vals), style, 1);
      el.querySelector('[data-cite-preview]').innerHTML = vals.title ? out.html : '<span class="muted">Titel eingeben …</span>';
      el.querySelector('[data-cite-intext]').textContent = vals.title ? `Im Text: ${out.inText}` : '';
    },
    onMount: (el, formEl) => {
      const btn = el.querySelector('[data-lookup]');
      const q = el.querySelector('[data-lookup-q]');
      if (!btn) return;
      const run = async () => {
        btn.disabled = true;
        btn.textContent = 'Suche …';
        try {
          const r = await lookup(q.value);
          const F = formEl.elements;
          F.type.value = r.type;
          formEl.querySelector(`input[name=type][value="${r.type}"]`).checked = true;
          const set = (n, val) => { if (F[n] && val != null) F[n].value = val; };
          set('authors', authorsToText(r.fields.authors));
          set('editors', authorsToText(r.fields.editors));
          for (const k of ['year', 'title', 'subtitle', 'journal', 'volume', 'issue', 'pages', 'publisher', 'place', 'doi', 'bookTitle', 'edition']) set(k, r.fields[k]);
          formEl.dispatchEvent(new Event('change', { bubbles: true }));
          toast('Daten übernommen – bitte kurz prüfen', { type: 'success' });
        } catch (e) {
          toast(e.message || 'Abruf fehlgeschlagen', { type: 'error' });
        } finally {
          btn.disabled = false;
          btn.textContent = 'Abrufen';
        }
      };
      btn.addEventListener('click', run);
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      if (prefill?.query) { q.value = prefill.query; run(); }
    },
  });
  if (v === 'delete') return removeWithUndo((st) => st.citations, id, 'Quelle gelöscht');
  if (!v) return;
  const data = toSource(v);
  store.update((st) => {
    if (existing) Object.assign(st.citations.find((x) => x.id === id), data);
    else st.citations.push({ id: uid('q'), ...data, createdAt: Date.now() });
  });
  toast(existing ? 'Gespeichert' : 'Zur Literaturliste hinzugefügt', { type: 'success' });
}

function ordered(state, style) {
  return style === 'ieee' ? sortBy(state.citations, (c) => c.createdAt || 0) : sortBy(state.citations, sortKey);
}

export default {
  title: 'Quellen zitieren',
  render({ state }) {
    const style = state.tools.citeStyle ?? 'apa';
    const list = ordered(state, style);
    return html`
      <header class="page-head"><div class="titles"><h1>Quellen zitieren</h1><p class="page-sub">Literaturverzeichnis ohne Formatierungsstress</p></div>
        <div class="page-actions"><button class="btn btn-primary" data-action="cite-new">${icon('plus')}<span class="hide-mobile">Quelle</span></button></div></header>
      <div class="chips mb-16">${STYLES.map((s) => html`<button class="chip ${style === s.id ? 'active' : ''}" data-action="cite-style" data-s="${s.id}">${s.name}</button>`)}</div>
      <form class="card mb-16" data-submit="cite-lookup">
        <div class="card-head"><span class="card-title">${icon('zap')} Schnell per DOI oder ISBN</span></div>
        <div class="row"><input class="input" name="q" placeholder="z. B. 10.1037/0033-2909.132.3.354 oder 978-3-…" aria-label="DOI oder ISBN"><button class="btn btn-soft" type="submit">Abrufen</button></div>
      </form>
      <section class="card">
        <div class="card-head"><span class="card-title">${icon('book')} Literaturverzeichnis</span>${list.length ? html`<button class="card-link" data-action="cite-copy-all">${icon('copy')} Alle kopieren</button>` : ''}</div>
        ${list.length ? html`<div class="list cite-list">${list.map((c, i) => {
          const out = formatCitation(c, style, i + 1);
          return html`<div class="li" data-key="${c.id}" style="align-items:flex-start">
            <div class="li-main"><div class="li-title">${raw(out.html)}</div><div class="li-sub"><span>Im Text: ${out.inText}</span></div></div>
            <div class="li-end">
              <button class="icon-btn sm" data-action="cite-copy" data-id="${c.id}" data-i="${i}" aria-label="Kopieren" title="Kopieren">${icon('copy')}</button>
              <button class="icon-btn sm" data-action="cite-edit" data-id="${c.id}" aria-label="Bearbeiten">${icon('edit')}</button>
            </div>
          </div>`;
        })}</div>
        <p class="tiny muted mt-12">Kopieren übernimmt die Kursivschrift beim Einfügen in Word, Pages oder Google Docs.</p>`
        : html`<div class="empty compact"><div class="empty-icon">📚</div><p>Noch keine Quellen. Füge eine hinzu oder hol dir die Daten per DOI/ISBN.</p></div>`}
      </section>`;
  },
  actions: {
    'cite-new': () => citeForm(null),
    'cite-edit': (c, el) => citeForm(el.dataset.id),
    'cite-style': (c, el) => store.update((s) => { s.tools.citeStyle = el.dataset.s; }),
    'cite-lookup': (c, el) => {
      const q = el.querySelector('[name=q]').value.trim();
      if (!q) return;
      citeForm(null, { type: looksLikeISBN(q) && !looksLikeDOI(q) ? 'book' : 'article', fields: {}, query: q });
      el.reset();
    },
    'cite-copy': async (c, el) => {
      const src = c.state.citations.find((x) => x.id === el.dataset.id);
      const out = formatCitation(src, c.state.tools.citeStyle ?? 'apa', Number(el.dataset.i) + 1);
      if (await copyText(out.text, `<p>${out.html}</p>`)) toast('Kopiert', { type: 'success' });
    },
    'cite-copy-all': async (c) => {
      const style = c.state.tools.citeStyle ?? 'apa';
      const outs = ordered(c.state, style).map((src, i) => formatCitation(src, style, i + 1));
      if (await copyText(outs.map((o) => o.text).join('\n'), outs.map((o) => `<p>${o.html}</p>`).join(''))) toast(`${outs.length} Quellen kopiert`, { type: 'success' });
    },
  },
};
