// Spaced Repetition nach FSRS-4.5 (Free Spaced Repetition Scheduler).
// Modelliert pro Karte Stabilität S (Tage bis Abruf­wahrscheinlichkeit auf 90 % fällt)
// und Schwierigkeit D (1–10). Ziel-Behaltensquote: 90 %.
import { DAY_MS } from '../core/date.js';

export const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
export const RETENTION = 0.9;
export const MAX_INTERVAL = 365;
const LEARN_STEP_MS = 60 * 1000; // falsch beantwortete Karten kommen nach 1 Min. erneut

export const RATINGS = [
  { value: 1, key: 'again', label: 'Nochmal' },
  { value: 2, key: 'hard', label: 'Schwer' },
  { value: 3, key: 'good', label: 'Gut' },
  { value: 4, key: 'easy', label: 'Einfach' },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function intervalDays(stability, retention = RETENTION) {
  const i = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(i), 1, MAX_INTERVAL);
}

const initStability = (g) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function nextDifficulty(d, g) {
  const next = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}

function forgetStability(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]));
}

export function newSrs() {
  return { state: 'new', due: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null };
}

/** Lokale Mitternacht + n Tage (Karten sind dann den ganzen Tag fällig). */
function dueAfterDays(nowTs, days) {
  const d = new Date(nowTs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Plant eine Karte nach Bewertung g (1–4) neu. Gibt neuen SRS-Zustand zurück (immutabel).
 */
export function schedule(srs, g, nowTs = Date.now()) {
  const s = { ...(srs ?? newSrs()) };
  const elapsed = s.last ? (nowTs - s.last) / DAY_MS : 0;
  s.reps = (s.reps || 0) + 1;

  if (s.state === 'new') {
    s.stability = initStability(g);
    s.difficulty = initDifficulty(g);
    if (g === 1) {
      s.state = 'learning';
      s.due = nowTs + LEARN_STEP_MS;
    } else {
      s.state = 'review';
      s.due = dueAfterDays(nowTs, intervalDays(s.stability));
    }
  } else if (s.state === 'learning' || s.state === 'relearning') {
    s.difficulty = nextDifficulty(s.difficulty, g);
    if (g === 1) {
      s.due = nowTs + LEARN_STEP_MS;
    } else {
      // Abschluss der Lernphase: Kurzzeit-Wiederholung zählt kaum für die Stabilität
      if (g === 4) s.stability = Math.max(s.stability, initStability(3));
      s.state = 'review';
      s.due = dueAfterDays(nowTs, intervalDays(s.stability));
    }
  } else {
    const r = retrievability(elapsed, s.stability);
    s.difficulty = nextDifficulty(s.difficulty, g);
    if (g === 1) {
      s.stability = forgetStability(s.difficulty, s.stability, r);
      s.lapses = (s.lapses || 0) + 1;
      s.state = 'relearning';
      s.due = nowTs + LEARN_STEP_MS;
    } else {
      // Schwer < Gut < Einfach folgt direkt aus den Gewichten (w15 < 1 < w16)
      s.stability = recallStability(s.difficulty, s.stability, r, g);
      s.state = 'review';
      s.due = dueAfterDays(nowTs, intervalDays(s.stability));
    }
  }
  s.last = nowTs;
  return s;
}

/** Vorschau der Intervalle für alle vier Bewertungen (in Tagen, Bruchteile für Minuten). */
export function preview(srs, nowTs = Date.now()) {
  const out = {};
  let prev = 0;
  const startOfToday = dueAfterDays(nowTs, 0);
  for (const { value, key } of RATINGS) {
    const n = schedule(srs, value, nowTs);
    // Tagesintervalle als Kalendertage zählen, Lernschritte in Minuten
    let days = n.state === 'review' ? Math.round((n.due - startOfToday) / DAY_MS) : (n.due - nowTs) / DAY_MS;
    if (value > 1 && days < prev) days = prev;
    out[key] = days;
    if (value > 1) prev = days;
  }
  return out;
}

export function isDue(card, nowTs = Date.now()) {
  return card.srs.state !== 'new' && card.srs.due <= nowTs;
}

/** Karten-Status für Anzeigen. */
export function cardStatus(card, nowTs = Date.now()) {
  const s = card.srs;
  if (s.state === 'new') return 'new';
  if (s.state === 'learning' || s.state === 'relearning') return 'learning';
  if (s.due <= nowTs) return 'due';
  if (s.stability >= 21) return 'mature';
  return 'young';
}

/**
 * Lernwarteschlange: fällige Lern-/Wiederholungskarten + neue Karten (Tageslimit pro Stapel).
 * @param introducedToday Map deckId → Anzahl heute bereits eingeführter neuer Karten
 */
export function buildQueue(cards, { nowTs = Date.now(), newLimit = 20, introducedToday = new Map() } = {}) {
  const learning = [], due = [], fresh = [];
  const endOfDay = dueAfterDays(nowTs, 1);
  const newPerDeck = new Map();
  for (const c of cards) {
    const s = c.srs;
    if (s.state === 'learning' || s.state === 'relearning') { if (s.due <= endOfDay) learning.push(c); }
    else if (s.state === 'review') { if (s.due <= nowTs) due.push(c); }
    else if (s.state === 'new') {
      const used = (introducedToday.get(c.deckId) ?? 0) + (newPerDeck.get(c.deckId) ?? 0);
      if (used < newLimit) { fresh.push(c); newPerDeck.set(c.deckId, (newPerDeck.get(c.deckId) ?? 0) + 1); }
    }
  }
  learning.sort((a, b) => a.srs.due - b.srs.due);
  due.sort((a, b) => a.srs.due - b.srs.due);
  fresh.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  // Neue Karten zwischen die Wiederholungen mischen (jede 4. Karte)
  const mixed = [];
  let ni = 0;
  for (let i = 0; i < due.length; i++) {
    mixed.push(due[i]);
    if ((i + 1) % 4 === 0 && ni < fresh.length) mixed.push(fresh[ni++]);
  }
  while (ni < fresh.length) mixed.push(fresh[ni++]);
  return [...learning, ...mixed];
}

/** Anzahl heute eingeführter neuer Karten pro Stapel (aus dem Review-Log). */
export function introducedToday(reviews, cards, nowTs = Date.now()) {
  const start = dueAfterDays(nowTs, 0);
  const deckOf = new Map(cards.map((c) => [c.id, c.deckId]));
  const m = new Map();
  for (const r of reviews) {
    if (r.ts < start || r.prevState !== 'new') continue;
    const d = deckOf.get(r.cardId);
    if (d) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

/** Zählt fällige Karten für Badges. */
export function dueCounts(cards, reviews, { nowTs = Date.now(), newLimit = 20 } = {}) {
  const q = buildQueue(cards, { nowTs, newLimit, introducedToday: introducedToday(reviews, cards, nowTs) });
  let fresh = 0, review = 0;
  for (const c of q) (c.srs.state === 'new' ? fresh++ : review++);
  return { total: q.length, fresh, review };
}
