import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shares, balances, settle, choreAssignments } from '../js/logic/split.js';
import { generatePlan, parseTopics, examProgress } from '../js/logic/planner.js';
import { currentStreak, bestStreak, completionRate, heatmapDays } from '../js/logic/habits.js';
import { weekday } from '../js/core/date.js';

test('Anteile: Rundungscents gehen auf', () => {
  const s = shares({ id: 'x', amount: 1000, split: { type: 'equal', among: ['a', 'b', 'c'] } });
  assert.equal([...s.values()].reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual([...s.values()].sort(), [333, 333, 334]);
});

test('Salden summieren sich zu 0 und Ausgleich ist minimal', () => {
  const g = {
    members: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    expenses: [
      { id: '1', amount: 12000, payerId: 'a', split: { type: 'equal', among: ['a', 'b', 'c', 'd'] } },
      { id: '2', amount: 4000, payerId: 'b', split: { type: 'equal', among: ['b', 'c'] } },
      { id: '3', amount: 2500, payerId: 'c', split: { type: 'exact', shares: { d: 2500 } } },
    ],
  };
  const bal = balances(g);
  assert.equal([...bal.values()].reduce((a, b) => a + b, 0), 0);
  assert.equal(bal.get('a'), 9000);
  const tx = settle(bal);
  assert.ok(tx.length <= 3);
  // Nach Ausgleich alle bei 0
  const after = new Map(bal);
  for (const t of tx) { after.set(t.from, after.get(t.from) + t.amount); after.set(t.to, after.get(t.to) - t.amount); }
  for (const v of after.values()) assert.equal(v, 0);
});

test('Putzplan rotiert wöchentlich', () => {
  const a0 = choreAssignments(['Bad', 'Küche', 'Müll'], ['A', 'B', 'C'], 0);
  const a1 = choreAssignments(['Bad', 'Küche', 'Müll'], ['A', 'B', 'C'], 1);
  assert.deepEqual(a0.map((x) => x.member), ['A', 'B', 'C']);
  assert.deepEqual(a1.map((x) => x.member), ['B', 'C', 'A']);
  assert.equal(choreAssignments(['Bad'], ['A', 'B'], -1)[0].member, 'B');
});

test('Lernplan: Kapazität wird eingehalten und alles verplant', () => {
  const availability = [120, 120, 120, 120, 90, 60, 0];
  const exams = [
    { id: 'e1', title: 'Analysis', date: '2026-12-10', topics: parseTopics('Folgen; 4\nReihen; 3\nStetigkeit; 3') },
    { id: 'e2', title: 'BWL', date: '2026-12-03', topics: parseTopics('Kapitel 1\nKapitel 2\nKapitel 3') },
  ];
  exams.forEach((e) => e.topics.forEach((t, i) => (t.id = e.id + i)));
  const { blocks, warnings } = generatePlan({ exams, availability, start: '2026-11-13', blockMinutes: 60 });
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
  const perDay = new Map();
  for (const b of blocks) perDay.set(b.date, (perDay.get(b.date) ?? 0) + b.minutes);
  for (const [d, m] of perDay) assert.ok(m <= availability[weekday(d)], `${d}: ${m}`);
  for (const e of exams) {
    for (const t of e.topics) {
      const learned = blocks.filter((b) => b.topicId === t.id && b.kind === 'learn').reduce((s, b) => s + b.minutes, 0);
      assert.equal(learned, t.minutes, t.name);
    }
    assert.ok(blocks.some((b) => b.examId === e.id && b.kind === 'final'));
    assert.ok(blocks.filter((b) => b.examId === e.id).every((b) => b.date < e.date));
  }
  assert.ok(blocks.some((b) => b.kind === 'review'));
  assert.equal(examProgress(blocks, 'e1').done, 0);
});

test('Lernplan: Warnung bei zu wenig Zeit', () => {
  const exams = [{ id: 'e', title: 'X', date: '2026-11-16', topics: [{ id: 't', name: 'Alles', minutes: 2000 }] }];
  const { warnings } = generatePlan({ exams, availability: [60, 60, 60, 60, 60, 60, 60], start: '2026-11-13' });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].missingMinutes > 1500);
});

test('Themen parsen', () => {
  assert.deepEqual(parseTopics('Kapitel 1; 2,5\nKapitel 2'), [{ name: 'Kapitel 1', minutes: 150 }, { name: 'Kapitel 2', minutes: 120 }]);
});

test('Gewohnheiten: Serien', () => {
  const h = { createdDate: '2026-11-01', days: [0, 1, 2, 3, 4, 5, 6], log: {} };
  for (const d of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']) h.log[d] = 1;
  assert.equal(currentStreak(h, '2026-11-13'), 4); // heute noch offen → Serie hält
  h.log['2026-11-13'] = 1;
  assert.equal(currentStreak(h, '2026-11-13'), 5);
  assert.equal(bestStreak(h, '2026-11-13'), 5);
  // Werktags-Gewohnheit: Wochenende unterbricht nicht
  const w = { createdDate: '2026-11-01', days: [0, 1, 2, 3, 4], log: { '2026-11-06': 1, '2026-11-09': 1, '2026-11-10': 1 } };
  assert.equal(currentStreak(w, '2026-11-11'), 3);
  assert.ok(completionRate(h, 30, '2026-11-13') > 0);
  assert.equal(heatmapDays(h, 4, '2026-11-13').length, 28);
});
