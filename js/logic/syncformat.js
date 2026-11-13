// Zerlegt den App-Zustand in kleine, stabile Einheiten für die Synchronisation.
// Jede Einheit wird als JSON-String gespeichert (≤ MAX_CHARS je Dokument, Dokumentlimit 256 KiB).
// Arrays werden in Blöcke à ITEMS_PER_CHUNK geteilt: Anhängen ändert nur den letzten Block,
// eine bearbeitete Aufgabe nur ihren eigenen – übertragen wird nur, was sich geändert hat.

export const ITEMS_PER_CHUNK = 100;
export const MAX_CHARS = 80000; // UTF-16-Einheiten → max. ~240 KB UTF-8
const SKIP = new Set(['meta']);
const NAME_RE = /^[A-Za-z0-9_.:-]+$/;

/** Schnelle 32-Bit-Prüfsumme (FNV-1a) + Länge. */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + '-' + str.length.toString(36);
}

/** Zustand → Map<Einheitsname, JSON> */
export function encodeUnits(state) {
  const units = new Map();
  const put = (name, json) => {
    if (!NAME_RE.test(name)) throw new Error(`Ungültiger Einheitsname: ${name}`);
    units.set(name, json);
  };
  const addArray = (name, arr) => {
    const n = Math.max(1, Math.ceil(arr.length / ITEMS_PER_CHUNK));
    for (let i = 0; i < n; i++) put(`${name}:${i}`, JSON.stringify(arr.slice(i * ITEMS_PER_CHUNK, (i + 1) * ITEMS_PER_CHUNK)));
  };
  for (const [k, v] of Object.entries(state)) {
    if (SKIP.has(k) || v === undefined) continue;
    if (Array.isArray(v)) addArray(k, v);
    else if (v && typeof v === 'object') {
      const entries = Object.entries(v).filter(([, pv]) => pv !== undefined);
      if (!entries.length) put(`${k}.`, '{}');
      for (const [p, pv] of entries) {
        if (Array.isArray(pv)) addArray(`${k}.${p}`, pv);
        else put(`${k}.${p}`, JSON.stringify(pv));
      }
    } else put(k, JSON.stringify(v));
  }
  return units;
}

function setPath(obj, name, value) {
  if (name.endsWith('.')) { obj[name.slice(0, -1)] ??= {}; return; }
  const i = name.indexOf('.');
  if (i < 0) { obj[name] = value; return; }
  const k = name.slice(0, i), p = name.slice(i + 1);
  if (!obj[k] || typeof obj[k] !== 'object' || Array.isArray(obj[k])) obj[k] = {};
  obj[k][p] = value;
}

/** Map<Einheitsname, JSON> → Zustand (ohne meta). Wirft bei Lücken in Array-Blöcken. */
export function decodeUnits(units) {
  const state = {};
  const arrays = new Map();
  for (const [name, json] of units) {
    const m = /^(.*):(\d+)$/.exec(name);
    const value = JSON.parse(json);
    if (m) {
      if (!arrays.has(m[1])) arrays.set(m[1], []);
      arrays.get(m[1]).push([Number(m[2]), value]);
    } else {
      setPath(state, name, value);
    }
  }
  for (const [name, parts] of arrays) {
    parts.sort((a, b) => a[0] - b[0]);
    parts.forEach(([idx], i) => { if (idx !== i) throw new Error(`Block ${i} von ${name} fehlt`); });
    setPath(state, name, parts.flatMap(([, a]) => a));
  }
  return state;
}

/** Dokument-IDs einer Einheit (1 Teil → u_name, mehrere → u_name~0 … u_name~n-1). */
export function docIds(name, parts) {
  return parts <= 1 ? [`u_${name}`] : Array.from({ length: parts }, (_, k) => `u_${name}~${k}`);
}

/** JSON einer Einheit in Dokument-Teile zerlegen. */
export function splitJson(json) {
  if (json.length <= MAX_CHARS) return [json];
  const out = [];
  for (let i = 0; i < json.length; i += MAX_CHARS) out.push(json.slice(i, i + MAX_CHARS));
  return out;
}

/** Manifest-Einträge für alle Einheiten: { name: { h, n } } */
export function manifestFor(units) {
  const m = {};
  for (const [name, json] of units) m[name] = { h: fnv(json), n: splitJson(json).length };
  return m;
}

/** Enthält der Zustand eigene Inhalte (oder nur Standard/Onboarding)? */
export function isPristine(s) {
  return !s.tasks?.length && !s.courses?.length && !s.sessions?.length && !s.events?.length && !s.cards?.length
    && !s.decks?.length && !s.modules?.length && !s.habits?.length && !s.groups?.length && !s.citations?.length
    && !s.budget?.transactions?.length && !s.budget?.recurring?.length && !s.focus?.sessions?.length;
}
