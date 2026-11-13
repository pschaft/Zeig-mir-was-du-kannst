// Lernplan-Generator.
// Verteilt Themen auf die verfügbaren Tage bis zu den Prüfungen:
//  1. Generalprobe am Tag vor jeder Prüfung reservieren
//  2. Pro Tag: fällige Wiederholungen (1/3/7 Tage nach dem Lernen) zuerst
//  3. Dann Lernblöcke für die Prüfung mit dem höchsten Zeitdruck (verbleibender Stoff / verbleibende Kapazität)
import { addDays, weekday, dateRange, diffDays } from '../core/date.js';
import { uid } from '../core/util.js';

export const KIND_META = {
  learn: { label: 'Lernen', emoji: '📖' },
  review: { label: 'Wiederholen', emoji: '🔁' },
  final: { label: 'Generalprobe', emoji: '🎯' },
};

/**
 * @param {object} p
 * @param {{id, title, date, color, topics: {id, name, minutes, doneMinutes?}[]}[]} p.exams
 * @param {number[]} p.availability Minuten pro Wochentag (Mo..So)
 * @param {string} p.start Startdatum (inklusive)
 * @param {number} [p.blockMinutes=60]
 * @param {number} [p.usedToday=0] heute schon verplante/erledigte Minuten
 * @param {number[]} [p.reviewOffsets=[1,3,7]]
 */
export function generatePlan({ exams, availability, start, blockMinutes = 60, usedToday = 0, reviewOffsets = [1, 3, 7], minBlock = 20 }) {
  const list = exams
    .filter((e) => e.date > start)
    .map((e) => ({
      ...e,
      topics: (e.topics ?? []).map((t) => ({ ...t, remaining: Math.max(0, (t.minutes || 0) - (t.doneMinutes || 0)) })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const blocks = [];
  const warnings = [];
  if (!list.length) return { blocks, warnings, totalMinutes: 0, capacity: 0 };

  const lastDay = addDays(list.at(-1).date, -1);
  const days = dateRange(start, lastDay);
  const cap = new Map(days.map((d) => [d, Math.max(0, (availability[weekday(d)] || 0) - (d === start ? usedToday : 0))]));
  const capacity = [...cap.values()].reduce((a, b) => a + b, 0);

  const push = (date, exam, topic, kind, minutes, title) => {
    const last = blocks.at(-1);
    if (last && last.date === date && last.examId === exam.id && last.topicId === (topic?.id ?? null) && last.kind === kind && kind === 'learn') {
      last.minutes += minutes;
      return;
    }
    blocks.push({ id: uid('b'), date, examId: exam.id, topicId: topic?.id ?? null, kind, minutes, title, done: false });
  };

  // 1) Generalprobe reservieren
  for (const e of list) {
    const total = e.topics.reduce((s, t) => s + (t.minutes || 0), 0);
    const want = Math.max(60, Math.min(180, Math.round((total * 0.15) / 15) * 15));
    for (let back = 1; back <= 3; back++) {
      const d = addDays(e.date, -back);
      if (d < start) break;
      const c = cap.get(d) ?? 0;
      if (c >= minBlock) {
        const m = Math.min(c, want);
        cap.set(d, c - m);
        blocks.push({ id: uid('b'), date: d, examId: e.id, topicId: null, kind: 'final', minutes: m, title: `Generalprobe ${e.title}`, done: false });
        break;
      }
    }
  }

  const pendingReviews = [];
  const capacityUntil = (exam, day, todayLeft) => {
    let s = todayLeft;
    for (let d = addDays(day, 1); d < exam.date; d = addDays(d, 1)) s += cap.get(d) ?? 0;
    return s;
  };

  /** Lernblöcke nach Dringlichkeit verteilen; criticalOnly = nur Prüfungen, die sonst nicht zu schaffen sind. */
  const learn = (d, c, criticalOnly) => {
    let guard = 0;
    while (c > 0 && guard++ < 50) {
      const candidates = list.filter((e) => e.date > d && e.topics.some((t) => t.remaining > 0));
      if (!candidates.length) break;
      let best = null, bestScore = -1;
      for (const e of candidates) {
        const rem = e.topics.reduce((s, t) => s + t.remaining, 0);
        const score = rem / Math.max(1, capacityUntil(e, d, c));
        if (score > bestScore) { best = e; bestScore = score; }
      }
      if (criticalOnly && bestScore < 0.85) break;
      const topic = best.topics.find((t) => t.remaining > 0);
      const chunk = Math.min(blockMinutes, topic.remaining, c);
      if (chunk < minBlock && topic.remaining > chunk) break;
      push(d, best, topic, 'learn', chunk, topic.name);
      topic.remaining -= chunk;
      c -= chunk;
      if (topic.remaining === 0) {
        const rm = Math.max(15, Math.min(45, Math.round(((topic.minutes || 60) * 0.25) / 5) * 5));
        for (const off of reviewOffsets) {
          const rd = addDays(d, off);
          if (rd < best.date) pendingReviews.push({ date: rd, exam: best, topic, minutes: rm });
        }
      }
    }
    return c;
  };

  for (const d of days) {
    let c = cap.get(d) ?? 0;

    // 2) Zeitkritische Prüfungen zuerst (sonst fressen Wiederholungen anderer Fächer die Zeit)
    c = learn(d, c, true);

    // 3) Fällige Wiederholungen
    for (let i = 0; i < pendingReviews.length && c >= 15;) {
      const r = pendingReviews[i];
      if (r.date > d) { i++; continue; }
      if (r.exam.date <= d) { pendingReviews.splice(i, 1); continue; }
      const m = Math.min(r.minutes, c);
      push(d, r.exam, r.topic, 'review', m, `${r.topic.name} wiederholen`);
      c -= m;
      pendingReviews.splice(i, 1);
    }

    // 4) Restliche Zeit: Lernen nach Dringlichkeit
    c = learn(d, c, false);
    cap.set(d, c);
  }

  for (const e of list) {
    const missing = e.topics.reduce((s, t) => s + t.remaining, 0);
    if (missing > 0) warnings.push({ examId: e.id, title: e.title, missingMinutes: missing });
    if (!e.topics.length) warnings.push({ examId: e.id, title: e.title, noTopics: true });
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || kindOrder(a.kind) - kindOrder(b.kind));
  const totalMinutes = blocks.reduce((s, b) => s + b.minutes, 0);
  return { blocks, warnings, totalMinutes, capacity };
}

function kindOrder(k) { return k === 'review' ? 0 : k === 'learn' ? 1 : 2; }

/** Fortschritt pro Prüfung aus den Blöcken. */
export function examProgress(blocks, examId) {
  let total = 0, done = 0;
  for (const b of blocks) {
    if (b.examId !== examId) continue;
    total += b.minutes;
    if (b.done) done += b.minutes;
  }
  return { total, done, ratio: total ? done / total : 0 };
}

/** Topics aus Freitext: "Kapitel 1; 3" → { name, minutes } (Standard 2 h) */
export function parseTopics(text, defaultHours = 2) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = /^(.*?)[;|\t]\s*(\d+(?:[.,]\d+)?)\s*(h|std|stunden)?\s*$/i.exec(line);
    if (m) return { name: m[1].trim(), minutes: Math.round(parseFloat(m[2].replace(',', '.')) * 60) };
    return { name: line, minutes: Math.round(defaultHours * 60) };
  });
}

export function topicsToText(topics) {
  return (topics ?? []).map((t) => `${t.name}; ${String(+(t.minutes / 60).toFixed(2)).replace('.', ',')}`).join('\n');
}

export function daysUntil(date, base) { return diffDays(base, date); }
