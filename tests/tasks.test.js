import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAdd, groupTasks, dueCount } from '../js/logic/tasks.js';
import { setNow } from '../js/core/date.js';

const BASE = '2026-11-13'; // Freitag
const courses = [
  { id: 'ana', name: 'Analysis I', short: 'ANA' },
  { id: 'alda', name: 'Algorithmen & Datenstrukturen', short: 'ALDA' },
  { id: 'bwl', name: 'BWL Grundlagen', short: 'BWL' },
];
const p = (s) => parseQuickAdd(s, { courses, base: BASE });

test('vollständige Schnelleingabe', () => {
  const r = p('Übungsblatt 3 #ana bis morgen 10 Uhr !');
  assert.equal(r.title, 'Übungsblatt 3');
  assert.equal(r.due, '2026-11-14');
  assert.equal(r.dueTime, '10:00');
  assert.equal(r.courseId, 'ana');
  assert.equal(r.priority, 1);
  assert.ok(r.parts.length >= 3);
});

test('Datum im Format TT.MM. springt ins nächste Jahr, wenn vergangen', () => {
  assert.equal(p('Klausuranmeldung am 15.02.').due, '2027-02-15');
  assert.equal(p('Abgabe 1.12.').due, '2026-12-01');
  assert.equal(p('Abgabe 12.11.').due, '2026-11-12'); // gestern → bleibt (überfällig)
  assert.equal(p('Termin 24.12.2026').due, '2026-12-24');
});

test('relative Angaben', () => {
  assert.equal(p('Hausarbeit in 2 Wochen').due, '2026-11-27');
  assert.equal(p('Mail schreiben in drei Tagen').due, '2026-11-16');
  assert.equal(p('Referat nächste Woche').due, '2026-11-16');
  assert.equal(p('Lesen übermorgen').due, '2026-11-15');
  assert.equal(p('Lesen heute').due, BASE);
});

test('Wochentage', () => {
  assert.equal(p('Referat vorbereiten nächsten Montag').due, '2026-11-16');
  assert.equal(p('Bibliothek Freitag').due, '2026-11-20'); // gleicher Wochentag → nächste Woche
  const r = p('Präsentation am Do');
  assert.equal(r.due, '2026-11-19');
  assert.equal(r.title, 'Präsentation');
  // "so" ohne Präposition ist kein Sonntag
  assert.equal(p('so ein Mist').due, null);
});

test('Monatsnamen', () => {
  assert.equal(p('Bewerbung bis 3. Januar').due, '2027-01-03');
  assert.equal(p('Konzert 20 Dez').due, '2026-12-20');
});

test('Zahlen ohne Kontext bleiben im Titel', () => {
  const r = p('Kapitel 3 lesen');
  assert.equal(r.title, 'Kapitel 3 lesen');
  assert.equal(r.due, null);
  assert.equal(r.dueTime, null);
});

test('Uhrzeit-Varianten', () => {
  assert.equal(p('Mensa um 12:30 morgen').dueTime, '12:30');
  assert.equal(p('Sprechstunde morgen um 14').dueTime, '14:00');
  assert.equal(p('Treffen morgen 9uhr').dueTime, '09:00');
  assert.equal(p('Treffen morgen 25 Uhr').dueTime, null);
});

test('Kurs ohne # wird am Kürzel erkannt, bleibt aber im Titel', () => {
  const r = p('BWL Fallstudie lesen');
  assert.equal(r.courseId, 'bwl');
  assert.equal(r.title, 'BWL Fallstudie lesen');
  assert.equal(p('Blatt #alg').courseId, 'alda');
});

test('Priorität', () => {
  assert.equal(p('Steuer !!').priority, 2);
  assert.equal(p('Steuer !').priority, 1);
  assert.equal(p('Hallo!').priority, 0);
});

test('Gruppierung', () => {
  const tasks = [
    { id: 1, title: 'a', due: '2026-11-10' },
    { id: 2, title: 'b', due: BASE },
    { id: 3, title: 'c', due: '2026-11-14' },
    { id: 4, title: 'd', due: '2026-11-18' },
    { id: 5, title: 'e', due: '2026-12-30' },
    { id: 6, title: 'f' },
    { id: 7, title: 'g', done: true, due: BASE },
  ];
  const g = groupTasks(tasks, BASE);
  assert.deepEqual(g.overdue.map((t) => t.id), [1]);
  assert.deepEqual(g.today.map((t) => t.id), [2]);
  assert.deepEqual(g.tomorrow.map((t) => t.id), [3]);
  assert.deepEqual(g.week.map((t) => t.id), [4]);
  assert.deepEqual(g.later.map((t) => t.id), [5]);
  assert.deepEqual(g.nodate.map((t) => t.id), [6]);
  assert.deepEqual(g.done.map((t) => t.id), [7]);
  assert.equal(dueCount(tasks, BASE), 2);
});

test('Nur Uhrzeit → heute oder morgen', () => {
  setNow(new Date(2026, 10, 13, 9, 0).getTime());
  assert.equal(p('Call um 15:00').due, BASE);
  setNow(new Date(2026, 10, 13, 18, 0).getTime());
  assert.equal(p('Call um 15:00').due, '2026-11-14');
  setNow(null);
});
