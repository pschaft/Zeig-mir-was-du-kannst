import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, fmtMoney, fmtGrade, fmtInterval } from '../js/core/format.js';
import { summary, finalGrade, requiredAverage, requiredVerdict, percentToGrade, gradeTable, bavarian, semesterSortKey } from '../js/logic/grades.js';
import { applyRecurring, monthSummary, upcomingFixed } from '../js/logic/budget.js';
import { defaultCategories } from '../js/logic/state.js';

test('Geldbeträge parsen', () => {
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1,234.56'), 123456);
  assert.equal(parseMoney('1.500'), 150000);
  assert.equal(parseMoney('2.99'), 299);
  assert.equal(parseMoney('0.500'), 50);
  assert.equal(parseMoney('7 €'), 700);
  assert.equal(parseMoney('-3,20'), -320);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
  assert.match(fmtMoney(123456), /1\.234,56\s€/);
  assert.match(fmtMoney(-500), /^−5,00\s€$/);
});

test('Formatierung', () => {
  assert.equal(fmtGrade(1.7), '1,7');
  assert.equal(fmtGrade(1.666, 2), '1,67');
  assert.equal(fmtInterval(1 / 1440), '1 Min');
  assert.equal(fmtInterval(4), '4 T');
});

test('ECTS-gewichteter Schnitt und Abschneiden', () => {
  const mods = [
    { ects: 10, grade: 1.3 },
    { ects: 5, grade: 2.7 },
    { ects: 5, grade: 2.0 },
    { ects: 5, grade: 5.0 }, // nicht bestanden → zählt nicht
    { ects: 6, graded: false, passed: true }, // unbenotet, aber ECTS
    { ects: 10, planned: true, expected: 1.0 },
  ];
  const s = summary(mods, { totalEcts: 180 });
  // (1.3*10 + 2.7*5 + 2.0*5) / 20 = 1.825
  assert.ok(Math.abs(s.avg - 1.825) < 1e-9);
  assert.equal(s.final, 1.8);
  assert.equal(finalGrade(s.avg, 'round'), 1.8);
  assert.equal(s.doneEcts, 26);
  const withPlan = summary(mods, { includePlanned: true });
  assert.ok(withPlan.avg < s.avg);
  assert.equal(finalGrade(2.3), 2.3);
  assert.equal(finalGrade(1.69999), 1.6);
});

test('Benötigter Schnitt für Zielnote', () => {
  const s = { wsum: 1.825 * 20, gradedEcts: 20 };
  const x = requiredAverage(s, 20, 1.5);
  // (1.6 * 40 - 36.5) / 20 = 1.375
  assert.ok(Math.abs(x - 1.375) < 1e-4);
  assert.deepEqual(requiredVerdict(x), { kind: 'need', value: 1.37 });
  assert.equal(requiredVerdict(requiredAverage(s, 20, 1.0)).kind, 'impossible');
  assert.equal(requiredVerdict(requiredAverage(s, 20, 3.5)).kind, 'safe');
});

test('Notenschlüssel', () => {
  assert.equal(percentToGrade(96), 1.0);
  assert.equal(percentToGrade(90), 1.3);
  assert.equal(percentToGrade(50), 4.0);
  assert.equal(percentToGrade(49.9), 5.0);
  const t = gradeTable(60);
  assert.equal(t[0].points, 57);
  assert.equal(t.at(-1).points, 30);
  assert.equal(bavarian(10, 5, 10), 1);
  assert.equal(bavarian(10, 5, 5), 4);
  assert.ok(semesterSortKey('WiSe 25/26') > semesterSortKey('SoSe 2025'));
});

test('Fixkosten werden einmal pro Monat gebucht', () => {
  const budget = { limit: 90000, categories: defaultCategories(), transactions: [], recurring: [
    { id: 'r1', type: 'expense', amount: 42000, categoryId: 'rent', day: 1, note: 'Miete', active: true, startMonth: '2026-10' },
    { id: 'r2', type: 'expense', amount: 999, categoryId: 'subs', day: 20, note: 'Spotify', active: true, startMonth: '2026-11' },
  ] };
  assert.equal(applyRecurring(budget, '2026-11-13'), 2); // Okt + Nov Miete
  assert.equal(applyRecurring(budget, '2026-11-13'), 0); // idempotent
  assert.equal(upcomingFixed(budget, '2026-11', '2026-11-13'), 999);
  const s = monthSummary(budget, '2026-11', '2026-11-13');
  assert.equal(s.expenses, 42000);
  assert.equal(s.remaining, 48000);
  assert.equal(s.daysLeft, 18);
  assert.equal(s.perDay, Math.floor((48000 - 999) / 18));
  assert.equal(applyRecurring(budget, '2026-11-20'), 1);
});
