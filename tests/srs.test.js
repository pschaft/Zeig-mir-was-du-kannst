import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, newSrs, preview, retrievability, intervalDays, buildQueue, introducedToday } from '../js/logic/srs.js';

const NOW = new Date(2026, 10, 13, 10, 0).getTime();
const DAY = 86400000;

test('Abrufwahrscheinlichkeit nach S Tagen = 90 %', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(retrievability(0, 5), 1);
  assert.equal(intervalDays(10), 10);
  assert.equal(intervalDays(0.2), 1);
});

test('neue Karte: Intervalle steigen mit der Bewertung', () => {
  const pv = preview(newSrs(), NOW);
  assert.ok(pv.again < 0.01, 'Nochmal → Minuten');
  assert.ok(pv.hard >= 1 && pv.hard <= pv.good);
  assert.ok(pv.good < pv.easy);
  const good = schedule(newSrs(), 3, NOW);
  assert.equal(good.state, 'review');
  assert.ok(good.difficulty > 1 && good.difficulty < 10);
});

test('Nochmal → Lernphase, dann Abschluss', () => {
  let s = schedule(newSrs(), 1, NOW);
  assert.equal(s.state, 'learning');
  assert.equal(s.due, NOW + 60000);
  s = schedule(s, 3, NOW + 120000);
  assert.equal(s.state, 'review');
  assert.ok(s.due > NOW);
});

test('erfolgreiche Wiederholung erhöht Stabilität, Vergessen senkt sie', () => {
  const s1 = schedule(newSrs(), 3, NOW);
  const later = s1.due + 1000;
  const ok = schedule(s1, 3, later);
  assert.ok(ok.stability > s1.stability * 1.5, `S wächst: ${s1.stability} → ${ok.stability}`);
  const fail = schedule(s1, 1, later);
  assert.ok(fail.stability < s1.stability);
  assert.equal(fail.state, 'relearning');
  assert.equal(fail.lapses, 1);
  // Reihenfolge bei Wiederholung
  const pv = preview(s1, later);
  assert.ok(pv.hard < pv.good && pv.good < pv.easy, JSON.stringify(pv));
});

test('Intervalle wachsen über mehrere Wiederholungen', () => {
  let s = schedule(newSrs(), 3, NOW);
  let t = NOW;
  const ivls = [];
  for (let i = 0; i < 5; i++) {
    t = s.due;
    const prevDue = s.due;
    s = schedule(s, 3, t);
    ivls.push(Math.round((s.due - prevDue) / DAY));
  }
  for (let i = 1; i < ivls.length; i++) assert.ok(ivls[i] >= ivls[i - 1], ivls.join(','));
  assert.ok(ivls.at(-1) > 30, `nach 6× gut > 1 Monat: ${ivls}`);
});

test('Warteschlange respektiert Tageslimit für neue Karten', () => {
  const cards = [];
  for (let i = 0; i < 30; i++) cards.push({ id: 'n' + i, deckId: 'd', createdAt: i, srs: newSrs() });
  cards.push({ id: 'r1', deckId: 'd', srs: { ...newSrs(), state: 'review', due: NOW - 1000, stability: 3, difficulty: 5, last: NOW - 3 * DAY } });
  cards.push({ id: 'r2', deckId: 'd', srs: { ...newSrs(), state: 'review', due: NOW + DAY * 3, stability: 3, difficulty: 5, last: NOW } });
  const q = buildQueue(cards, { nowTs: NOW, newLimit: 10 });
  assert.equal(q.filter((c) => c.srs.state === 'new').length, 10);
  assert.ok(q.some((c) => c.id === 'r1'));
  assert.ok(!q.some((c) => c.id === 'r2'));
  const intro = introducedToday([{ cardId: 'n0', ts: NOW - 1000, prevState: 'new' }], cards, NOW);
  assert.equal(intro.get('d'), 1);
  const q2 = buildQueue(cards, { nowTs: NOW, newLimit: 10, introducedToday: intro });
  assert.equal(q2.filter((c) => c.srs.state === 'new').length, 9);
});
