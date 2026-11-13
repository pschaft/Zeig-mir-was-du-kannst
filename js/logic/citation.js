// Literaturangaben in APA 7, Harvard (dt.), IEEE, MLA 9 und deutscher Zitierweise.
import { esc } from '../core/html.js';
import { MONTHS, MONTHS_SHORT, parseDate, pad } from '../core/date.js';

export const STYLES = [
  { id: 'apa', name: 'APA 7' },
  { id: 'harvard', name: 'Harvard (dt.)' },
  { id: 'ieee', name: 'IEEE' },
  { id: 'mla', name: 'MLA 9' },
  { id: 'de', name: 'Deutsche Zitierweise' },
];

export const TYPES = [
  { id: 'book', name: 'Buch' },
  { id: 'article', name: 'Zeitschriftenartikel' },
  { id: 'chapter', name: 'Beitrag im Sammelband' },
  { id: 'web', name: 'Webseite' },
];

/** "Müller, Anna; Bernd Schmidt" → [{family:'Müller', given:'Anna'}, {family:'Schmidt', given:'Bernd'}] */
export function parseAuthors(text) {
  return String(text ?? '').split(/\n|;| und | & /).map((s) => s.trim()).filter(Boolean).map((s) => {
    if (s.includes(',')) {
      const [family, ...rest] = s.split(',');
      return { family: family.trim(), given: rest.join(',').trim() };
    }
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { family: parts[0], given: '' };
    return { family: parts.at(-1), given: parts.slice(0, -1).join(' ') };
  });
}

export function authorsToText(authors) {
  return (authors ?? []).map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('\n');
}

function initials(given) {
  return String(given ?? '').split(/\s+/).filter(Boolean).map((part) => part.split('-').map((p) => (p[0] ? p[0].toUpperCase() + '.' : '')).join('-')).join(' ');
}

const i = (s) => `<i>${esc(s)}</i>`;
const e = (s) => esc(s);
const strip = (s) => String(s ?? '').trim().replace(/[.\s]+$/, '');

function fullTitle(f, sep = ': ') {
  return f.subtitle ? `${strip(f.title)}${sep}${strip(f.subtitle)}` : strip(f.title);
}

function doiUrl(doi) {
  if (!doi) return '';
  const d = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  return `https://doi.org/${d}`;
}

function pagesStr(p) { return String(p ?? '').replace(/\s*-\s*/g, '–'); }

function editionStr(ed) {
  if (!ed) return '';
  const n = String(ed).replace(/\D/g, '');
  if (n && n !== '1') return `${n}. Aufl.`;
  return /^\d+$/.test(String(ed)) ? '' : String(ed);
}

function dateLong(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function dateShort(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function dateNum(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* ---------------- Autor:innen je Stil ---------------- */

function apaAuthors(list) {
  const names = list.map((a) => (a.given ? `${a.family}, ${initials(a.given)}` : a.family));
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
  return `${names.slice(0, 19).join(', ')}, … ${names.at(-1)}`;
}
function harvardAuthors(list) {
  return list.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('/');
}
function ieeeAuthors(list) {
  const names = list.map((a) => (a.given ? `${initials(a.given)} ${a.family}` : a.family));
  if (names.length > 6) return `${names[0]} et al.`;
  if (names.length <= 2) return names.join(' und ');
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}
function mlaAuthors(list) {
  if (!list.length) return '';
  const first = list[0].given ? `${list[0].family}, ${list[0].given}` : list[0].family;
  if (list.length === 1) return first;
  if (list.length === 2) return `${first} und ${list[1].given ? `${list[1].given} ${list[1].family}` : list[1].family}`;
  return `${first} et al.`;
}
function editorsStr(list, style) {
  if (!list?.length) return '';
  if (style === 'apa') {
    const n = list.map((a) => (a.given ? `${initials(a.given)} ${a.family}` : a.family));
    return `${n.length > 1 ? n.slice(0, -1).join(', ') + ' & ' + n.at(-1) : n[0]} (Hrsg.)`;
  }
  if (style === 'ieee') return `${list.map((a) => (a.given ? `${initials(a.given)} ${a.family}` : a.family)).join(', ')}, Hrsg.`;
  return `${harvardAuthors(list)} (Hrsg.)`;
}

/* ---------------- Formatierung ---------------- */

/** Liefert { html, text, inText } */
export function formatCitation(src, style = 'apa', index = 1) {
  const f = src.fields ?? src;
  const type = src.type ?? 'book';
  const A = f.authors ?? [];
  const year = f.year ? String(f.year) : 'o. J.';
  const url = f.doi ? doiUrl(f.doi) : f.url;
  const pub = [f.place, f.publisher].filter(Boolean);
  let h = '';

  if (style === 'apa') {
    const who = A.length ? apaAuthors(A) : '';
    const lead = who ? `${e(who)}${who.endsWith('.') ? '' : '.'} (${e(year)}).` : '';
    if (type === 'book') {
      const ed = editionStr(f.edition);
      h = `${lead ? lead + ' ' : ''}${i(fullTitle(f))}${ed ? ` (${e(ed)})` : ''}.${lead ? '' : ` (${e(year)}).`}${f.publisher ? ` ${e(f.publisher)}.` : ''}`;
    } else if (type === 'article') {
      const vol = f.volume ? `, ${i(f.volume)}` : '';
      const iss = f.issue ? `(${e(f.issue)})` : '';
      h = `${lead ? lead + ' ' : ''}${e(fullTitle(f))}.${lead ? '' : ` (${e(year)}).`} ${i(f.journal ?? '')}${vol}${iss}${f.pages ? `, ${e(pagesStr(f.pages))}` : ''}.`;
    } else if (type === 'chapter') {
      h = `${lead ? lead + ' ' : ''}${e(fullTitle(f))}.${lead ? '' : ` (${e(year)}).`} In ${e(editorsStr(f.editors, 'apa'))}${f.editors?.length ? ', ' : ''}${i(f.bookTitle ?? '')}${f.pages ? ` (S. ${e(pagesStr(f.pages))})` : ''}.${f.publisher ? ` ${e(f.publisher)}.` : ''}`;
    } else {
      h = `${lead ? lead + ' ' : ''}${i(fullTitle(f))}.${lead ? '' : ` (${e(year)}).`}${f.site ? ` ${e(f.site)}.` : ''}${f.accessed && f.url ? ` Abgerufen am ${e(dateLong(f.accessed))}, von` : ''}`;
    }
    if (url) h += ` ${e(url)}`;
  } else if (style === 'harvard') {
    const who = A.length ? harvardAuthors(A) : (f.site || 'o. V.');
    const lead = `${e(who)} (${e(year)}): `;
    if (type === 'book') {
      const ed = editionStr(f.edition);
      h = `${lead}${i(fullTitle(f, '. '))}.${ed ? ` ${e(ed)},` : ''}${pub.length ? ` ${e(pub.join(': '))}.` : ''}`;
    } else if (type === 'article') {
      h = `${lead}${e(fullTitle(f, '. '))}. In: ${i(f.journal ?? '')}${f.volume ? `, Jg. ${e(f.volume)}` : ''}${f.issue ? `, Nr. ${e(f.issue)}` : ''}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else if (type === 'chapter') {
      h = `${lead}${e(fullTitle(f, '. '))}. In: ${e(editorsStr(f.editors, 'harvard'))}${f.editors?.length ? ': ' : ''}${i(f.bookTitle ?? '')}.${pub.length ? ` ${e(pub.join(': '))}` : ''}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else {
      h = `${lead}${i(fullTitle(f, '. '))}.${f.url ? ` Online unter: ${e(f.url)}` : ''}${f.accessed ? ` [Zugriff: ${e(dateNum(f.accessed))}]` : ''}.`;
    }
    if (f.doi && type !== 'web') h += ` DOI: ${e(f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))}.`;
  } else if (style === 'ieee') {
    const who = A.length ? ieeeAuthors(A) : '';
    const lead = `[${index}] ${who ? e(who) + ', ' : ''}`;
    if (type === 'book') {
      const ed = editionStr(f.edition);
      h = `${lead}${i(fullTitle(f))}${ed ? `, ${e(ed)}` : ''}. ${pub.length ? `${e(pub.join(': '))}, ` : ''}${e(year)}.`;
    } else if (type === 'article') {
      h = `${lead}„${e(fullTitle(f))},“ ${i(f.journal ?? '')}${f.volume ? `, Bd. ${e(f.volume)}` : ''}${f.issue ? `, Nr. ${e(f.issue)}` : ''}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}, ${e(year)}${f.doi ? `, doi: ${e(f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))}` : ''}.`;
    } else if (type === 'chapter') {
      h = `${lead}„${e(fullTitle(f))},“ in ${i(f.bookTitle ?? '')}${f.editors?.length ? `, ${e(editorsStr(f.editors, 'ieee'))}` : ''} ${pub.length ? `${e(pub.join(': '))}, ` : ''}${e(year)}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else {
      h = `[${index}] ${who ? e(who) + '. ' : ''}„${e(fullTitle(f))}.“ ${f.site ? e(f.site) + '. ' : ''}${f.accessed ? `Zugegriffen: ${e(dateShort(f.accessed))}. ` : ''}[Online]. Verfügbar: ${e(f.url ?? '')}`;
    }
  } else if (style === 'mla') {
    const who = mlaAuthors(A);
    const lead = who ? `${e(who)}${who.endsWith('.') ? '' : '.'} ` : '';
    if (type === 'book') {
      const ed = editionStr(f.edition);
      h = `${lead}${i(fullTitle(f))}.${ed ? ` ${e(ed)},` : ''}${f.publisher ? ` ${e(f.publisher)},` : ''} ${e(year)}.`;
    } else if (type === 'article') {
      h = `${lead}„${e(fullTitle(f))}.“ ${i(f.journal ?? '')}${f.volume ? `, Bd. ${e(f.volume)}` : ''}${f.issue ? `, Nr. ${e(f.issue)}` : ''}, ${e(year)}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}${f.doi ? `, ${e(doiUrl(f.doi))}` : ''}.`;
    } else if (type === 'chapter') {
      h = `${lead}„${e(fullTitle(f))}.“ ${i(f.bookTitle ?? '')}${f.editors?.length ? `, hrsg. von ${e(f.editors.map((a) => `${a.given} ${a.family}`.trim()).join(' und '))}` : ''}${f.publisher ? `, ${e(f.publisher)}` : ''}, ${e(year)}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else {
      h = `${lead}„${e(fullTitle(f))}.“ ${f.site ? `${i(f.site)}, ` : ''}${f.year ? `${e(f.year)}, ` : ''}${e(f.url ?? '')}.${f.accessed ? ` Zugegriffen am ${e(dateShort(f.accessed))}.` : ''}`;
    }
  } else {
    // Deutsche Zitierweise (Vollbeleg)
    const who = A.length ? A.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('/') : 'o. V.';
    if (type === 'book') {
      const ed = editionStr(f.edition);
      h = `${e(who)}: ${e(fullTitle(f, '. '))}${ed ? `, ${e(ed)}` : ''}, ${f.place ? e(f.place) + ' ' : ''}${e(year)}.`;
    } else if (type === 'article') {
      h = `${e(who)}: ${e(fullTitle(f, '. '))}, in: ${e(f.journal ?? '')}${f.volume ? ` ${e(f.volume)}` : ''} (${e(year)})${f.issue ? `, H. ${e(f.issue)}` : ''}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else if (type === 'chapter') {
      h = `${e(who)}: ${e(fullTitle(f, '. '))}, in: ${f.editors?.length ? `${e(f.editors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('/'))} (Hg.): ` : ''}${e(f.bookTitle ?? '')}, ${f.place ? e(f.place) + ' ' : ''}${e(year)}${f.pages ? `, S. ${e(pagesStr(f.pages))}` : ''}.`;
    } else {
      h = `${e(who)}: ${e(fullTitle(f, '. '))}${f.url ? `, ${e(f.url)}` : ''}${f.accessed ? ` (abgerufen am ${e(dateNum(f.accessed))})` : ''}.`;
    }
  }
  h = h.replace(/\s{2,}/g, ' ').replace(/\.\./g, '.').replace(/,\./g, '.').trim();
  const text = h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return { html: h, text, inText: inTextCitation(f, style, index) };
}

export function inTextCitation(f, style, index = 1) {
  const A = f.authors ?? [];
  const year = f.year || 'o. J.';
  const fam = A.map((a) => a.family);
  if (style === 'ieee') return `[${index}]`;
  if (style === 'mla') return `(${fam.length > 2 ? fam[0] + ' et al.' : fam.join(' und ') || '„' + strip(f.title) + '“'} S. x)`;
  if (style === 'apa') {
    const who = fam.length === 0 ? strip(f.title) : fam.length === 1 ? fam[0] : fam.length === 2 ? `${fam[0]} & ${fam[1]}` : `${fam[0]} et al.`;
    return `(${who}, ${year}, S. x)`;
  }
  if (style === 'harvard') {
    const who = fam.length === 0 ? 'o. V.' : fam.length <= 2 ? fam.join('/') : `${fam[0]} et al.`;
    return `(${who} ${year}, S. x)`;
  }
  const who = fam.length ? fam.slice(0, 2).join('/') + (fam.length > 2 ? ' u. a.' : '') : 'o. V.';
  return `Vgl. ${who}: ${strip(f.title).split(/[:.]/)[0]}, S. x.`;
}

export function sortKey(src) {
  const f = src.fields ?? {};
  return `${(f.authors?.[0]?.family ?? f.title ?? '').toLowerCase()}|${f.year ?? ''}|${(f.title ?? '').toLowerCase()}`;
}

/* ---------------- Online-Metadaten ---------------- */

export function fromCrossref(msg) {
  const type = msg.type === 'journal-article' ? 'article' : msg.type === 'book-chapter' ? 'chapter' : msg.type?.startsWith('book') || msg.type === 'monograph' ? 'book' : 'article';
  const year = msg.issued?.['date-parts']?.[0]?.[0] ?? msg.published?.['date-parts']?.[0]?.[0] ?? '';
  const fields = {
    authors: (msg.author ?? []).map((a) => ({ family: a.family ?? a.name ?? '', given: a.given ?? '' })),
    editors: (msg.editor ?? []).map((a) => ({ family: a.family ?? a.name ?? '', given: a.given ?? '' })),
    year: year ? String(year) : '',
    title: (msg.title?.[0] ?? '').replace(/<[^>]+>/g, ''),
    subtitle: (msg.subtitle?.[0] ?? '').replace(/<[^>]+>/g, ''),
    journal: msg['container-title']?.[0] ?? '',
    bookTitle: type === 'chapter' ? (msg['container-title']?.[0] ?? '') : '',
    volume: msg.volume ?? '', issue: msg.issue ?? '', pages: msg.page ?? '',
    publisher: msg.publisher ?? '', place: msg['publisher-location'] ?? '',
    doi: msg.DOI ?? '', url: '',
  };
  return { type, fields };
}

export function fromOpenLibrary(d) {
  return {
    type: 'book',
    fields: {
      authors: (d.authors ?? []).map((a) => parseAuthors(a.name)[0]).filter(Boolean),
      year: (String(d.publish_date ?? '').match(/\d{4}/) ?? [''])[0],
      title: d.title ?? '', subtitle: d.subtitle ?? '',
      publisher: d.publishers?.[0]?.name ?? '', place: d.publish_places?.[0]?.name ?? '',
      edition: '', url: '', doi: '',
    },
  };
}

export function fromGoogleBooks(item) {
  const v = item.volumeInfo ?? {};
  return {
    type: 'book',
    fields: {
      authors: (v.authors ?? []).map((n) => parseAuthors(n)[0]).filter(Boolean),
      year: (String(v.publishedDate ?? '').match(/\d{4}/) ?? [''])[0],
      title: v.title ?? '', subtitle: v.subtitle ?? '', publisher: v.publisher ?? '', place: '', edition: '', url: '', doi: '',
    },
  };
}

export function looksLikeDOI(s) { return /10\.\d{4,9}\/\S+/.test(s); }
export function extractDOI(s) { return (String(s).match(/10\.\d{4,9}\/[^\s"<>]+/) ?? [''])[0].replace(/[.,;]+$/, ''); }
export function looksLikeISBN(s) { const d = String(s).replace(/[^0-9Xx]/g, ''); return d.length === 10 || d.length === 13; }
