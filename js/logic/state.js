// Datenmodell, Standardwerte und Migrationen. Rein funktional → testbar mit node --test.

export const SCHEMA_VERSION = 1;

export const COURSE_COLORS = [
  '#5b5bd6', '#0b84e3', '#12a594', '#2f9e5b', '#8d9a12', '#d99a00',
  '#ee6b12', '#e5484d', '#d6409f', '#8e4ec6', '#9a7b55', '#687076',
];

export const ACCENTS = [
  { name: 'Indigo', value: '#5b5bd6' },
  { name: 'Violett', value: '#8e4ec6' },
  { name: 'Blau', value: '#0b7fdf' },
  { name: 'Petrol', value: '#0f978a' },
  { name: 'Grün', value: '#2b9a5d' },
  { name: 'Orange', value: '#e2620e' },
  { name: 'Pink', value: '#d23d8f' },
  { name: 'Rot', value: '#dc3d43' },
];

export const SESSION_TYPES = ['Vorlesung', 'Übung', 'Tutorium', 'Seminar', 'Praktikum', 'Sonstiges'];

export function defaultCategories() {
  return [
    { id: 'rent', name: 'Miete & Nebenkosten', emoji: '🏠', color: '#5b5bd6', type: 'expense', limit: null },
    { id: 'food', name: 'Lebensmittel', emoji: '🛒', color: '#2f9e5b', type: 'expense', limit: null },
    { id: 'mensa', name: 'Mensa & Essen gehen', emoji: '🍝', color: '#ee6b12', type: 'expense', limit: null },
    { id: 'transport', name: 'Mobilität', emoji: '🚲', color: '#0b84e3', type: 'expense', limit: null },
    { id: 'fun', name: 'Freizeit & Ausgehen', emoji: '🎉', color: '#d6409f', type: 'expense', limit: null },
    { id: 'uni', name: 'Uni & Bücher', emoji: '📚', color: '#8e4ec6', type: 'expense', limit: null },
    { id: 'subs', name: 'Abos & Handy', emoji: '📱', color: '#12a594', type: 'expense', limit: null },
    { id: 'clothes', name: 'Kleidung', emoji: '👕', color: '#d99a00', type: 'expense', limit: null },
    { id: 'health', name: 'Gesundheit & Drogerie', emoji: '🧴', color: '#e5484d', type: 'expense', limit: null },
    { id: 'other', name: 'Sonstiges', emoji: '📦', color: '#687076', type: 'expense', limit: null },
    { id: 'bafoeg', name: 'BAföG', emoji: '🏛️', color: '#2f9e5b', type: 'income', limit: null },
    { id: 'job', name: 'Nebenjob', emoji: '💼', color: '#0b84e3', type: 'income', limit: null },
    { id: 'parents', name: 'Eltern & Familie', emoji: '👪', color: '#d6409f', type: 'income', limit: null },
    { id: 'income_other', name: 'Sonstige Einnahmen', emoji: '🎁', color: '#d99a00', type: 'income', limit: null },
  ];
}

export function defaultFocusSettings() {
  return { work: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoWork: false, dailyGoal: 120, wakeLock: false };
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    profile: { name: '', uni: '', program: '', totalEcts: 180, onboarded: false },
    settings: {
      theme: 'system',
      accent: '#5b5bd6',
      showWeekend: false,
      gradeRounding: 'truncate',
      reminders: false,
      newCardsPerDay: 20,
      sound: true,
      haptics: true,
      weekView: 'auto',
    },
    semester: { name: '', start: '', end: '', lectureStart: '', lectureEnd: '', breaks: [] },
    courses: [],
    sessions: [],
    events: [],
    tasks: [],
    focus: {
      settings: defaultFocusSettings(),
      timer: { mode: 'work', status: 'idle', endsAt: null, remaining: null, startedAt: null, cycle: 0, label: '', courseId: '' },
      sessions: [],
      noise: { type: 'brown', volume: 0.5 },
    },
    decks: [],
    cards: [],
    reviews: [],
    modules: [],
    budget: { limit: 90000, categories: defaultCategories(), transactions: [], recurring: [] },
    groups: [],
    habits: [],
    plan: { availability: [120, 120, 120, 120, 90, 60, 0], blockMinutes: 60, topics: {}, blocks: [], generatedAt: null, warnings: [] },
    citations: [],
    tools: { wordTarget: 0, wordText: '', wheel: '', groupNames: '', citeStyle: 'apa' },
    meta: { createdAt: Date.now(), lastBackup: null, demo: false },
  };
}

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function fill(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined || (target[k] === null && isObj(v))) {
      target[k] = structuredClone(v);
    } else if (isObj(v) && isObj(target[k])) {
      fill(target[k], v);
    }
  }
  return target;
}

/** Bringt beliebige (auch alte/teilweise) Zustände auf den aktuellen Stand. */
export function migrate(s) {
  if (!isObj(s)) return defaultState();
  const out = fill(s, defaultState());
  for (const key of ['courses', 'sessions', 'events', 'tasks', 'decks', 'cards', 'reviews', 'modules', 'groups', 'habits', 'citations']) {
    if (!Array.isArray(out[key])) out[key] = [];
  }
  out.version = SCHEMA_VERSION;
  return out;
}

/** Semester-Vorschläge für deutsche Hochschulen rund um ein Datum. */
export function semesterPresets(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const presets = [];
  const wise = (year) => ({
    name: `WiSe ${year}/${String(year + 1).slice(2)}`,
    start: `${year}-10-01`, end: `${year + 1}-03-31`,
    lectureStart: mondayOnOrAfter(`${year}-10-12`), lectureEnd: fridayOnOrBefore(`${year + 1}-02-07`),
    breaks: [{ name: 'Weihnachtspause', start: `${year}-12-21`, end: `${year + 1}-01-03` }],
  });
  const sose = (year) => ({
    name: `SoSe ${year}`,
    start: `${year}-04-01`, end: `${year}-09-30`,
    lectureStart: mondayOnOrAfter(`${year}-04-13`), lectureEnd: fridayOnOrBefore(`${year}-07-18`),
    breaks: [],
  });
  if (m >= 10) presets.push(wise(y), sose(y + 1));
  else if (m <= 3) presets.push(wise(y - 1), sose(y));
  else presets.push(sose(y), wise(y));
  return presets;
}

function shift(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function wd(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}
function mondayOnOrAfter(s) { const w = wd(s); return w === 0 ? s : shift(s, 7 - w); }
function fridayOnOrBefore(s) { const w = wd(s); return shift(s, w >= 4 ? -(w - 4) : -(w + 3)); }
