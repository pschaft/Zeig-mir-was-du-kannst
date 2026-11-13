import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, analyzeICS, exportICS, courseNameFrom, detectType } from '../js/logic/ics.js';
import { formatCitation, parseAuthors, extractDOI } from '../js/logic/citation.js';
import { sessionOccursOn, agendaFor, nextUp, lectureWeek } from '../js/logic/timetable.js';
import { defaultState, migrate, semesterPresets } from '../js/logic/state.js';
import { isoWeek, addDays, diffDays, weekday } from '../js/core/date.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
SUMMARY:Analysis I - Vorlesung
DTSTART;TZID=Europe/Berlin:20261013T101500
DTEND;TZID=Europe/Berlin:20261013T114500
RRULE:FREQ=WEEKLY;UNTIL=20270205T230000Z
LOCATION:HS 1
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Analysis I (Ü)
DTSTART:20261015T121500
DTEND:20261015T134500
LOCATION:SR 3
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Analysis I (Ü)
DTSTART:20261022T121500
DTEND:20261022T134500
LOCATION:SR 3
END:VEVENT
BEGIN:VEVENT
UID:4
SUMMARY:Analysis I (Ü)
DTSTART:20261029T121500
DTEND:20261029T134500
LOCATION:SR 3
END:VEVENT
BEGIN:VEVENT
UID:5
SUMMARY:Klausur Analysis I
DTSTART:20270215T090000
DTEND:20270215T110000
LOCATION:Audimax
DESCRIPTION:Hilfsmittel: ein Blatt\\, handschriftlich
END:VEVENT
END:VCALENDAR`;

test('ICS: Parser und Stundenplan-Heuristik', () => {
  const ev = parseICS(ICS);
  assert.equal(ev.length, 5);
  assert.equal(ev[4].description, 'Hilfsmittel: ein Blatt, handschriftlich');
  const r = analyzeICS(ev);
  assert.equal(r.sessions.length, 2);
  const lec = r.sessions.find((s) => s.type === 'Vorlesung');
  assert.equal(lec.course, 'Analysis I');
  assert.equal(lec.weekday, 1);
  assert.equal(lec.start, '10:15');
  const ex = r.sessions.find((s) => s.type === 'Übung');
  assert.equal(ex.course, 'Analysis I');
  assert.equal(ex.room, 'SR 3');
  assert.equal(r.singles.length, 1);
  assert.equal(r.singles[0].kind, 'exam');
  assert.equal(r.singles[0].course, 'Analysis I');
  assert.deepEqual(r.courses, ['Analysis I']);
});

test('Kursnamen bereinigen', () => {
  assert.equal(courseNameFrom('Analysis I - Übung (Gruppe 3)'), 'Analysis I');
  assert.equal(courseNameFrom('Software Engineering SE'), 'Software Engineering SE');
  assert.equal(courseNameFrom('Mathe für Informatiker 1 (V)'), 'Mathe für Informatiker 1');
  assert.equal(detectType('Mathe (V)'), 'Vorlesung');
  assert.equal(detectType('Programmierpraktikum'), 'Vorlesung');
  assert.equal(detectType('Tutorium Programmieren'), 'Tutorium');
});

test('ICS-Export lässt sich wieder einlesen', () => {
  const s = defaultState();
  s.semester = semesterPresets('2026-11-13')[0];
  s.courses = [{ id: 'c1', name: 'Analysis I', short: 'ANA', color: '#000' }];
  s.sessions = [{ id: 's1', courseId: 'c1', weekday: 0, start: '10:15', end: '11:45', type: 'Vorlesung', room: 'HS 1, Gebäude A', weeks: 'all' }];
  s.events = [{ id: 'e1', title: 'Klausur Analysis', date: '2027-02-15', start: '09:00', end: '11:00', kind: 'exam' }];
  s.tasks = [{ id: 't1', title: 'Blatt 4; abgeben', due: '2026-11-20', done: false }];
  const ics = exportICS(s);
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=1'));
  assert.ok(ics.includes('EXDATE:'), 'Weihnachtspause als Ausnahme');
  const back = parseICS(ics);
  assert.equal(back.length, 3);
  assert.equal(back.find((e) => e.summary.includes('Analysis I')).location, 'HS 1, Gebäude A');
  assert.ok(back.some((e) => e.summary === '✅ Blatt 4; abgeben'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('Zitieren: APA 7 Buch und Artikel', () => {
  const book = { type: 'book', fields: { authors: parseAuthors('Müller, Anna Lena; Bernd Schmidt'), year: '2021', title: 'Lernen lernen', subtitle: 'Strategien fürs Studium', edition: '3', publisher: 'Springer', place: 'Berlin' } };
  const apa = formatCitation(book, 'apa');
  assert.equal(apa.text, 'Müller, A. L., & Schmidt, B. (2021). Lernen lernen: Strategien fürs Studium (3. Aufl.). Springer.');
  assert.ok(apa.html.includes('<i>Lernen lernen: Strategien fürs Studium</i>'));
  assert.equal(apa.inText, '(Müller & Schmidt, 2021, S. x)');
  const art = { type: 'article', fields: { authors: parseAuthors('Ebbinghaus, Hermann'), year: '1885', title: 'Über das Gedächtnis', journal: 'Psych. Archiv', volume: '1', issue: '2', pages: '10-20', doi: '10.1000/xyz' } };
  assert.equal(formatCitation(art, 'apa').text, 'Ebbinghaus, H. (1885). Über das Gedächtnis. Psych. Archiv, 1(2), 10–20. https://doi.org/10.1000/xyz');
  assert.ok(formatCitation(art, 'ieee', 3).text.startsWith('[3] H. Ebbinghaus, „Über das Gedächtnis,“'));
  assert.equal(extractDOI('siehe https://doi.org/10.1145/3290605.3300233.'), '10.1145/3290605.3300233');
});

test('Datum: ISO-Wochen und Sommerzeit', () => {
  assert.equal(isoWeek('2026-11-13'), 46);
  assert.equal(isoWeek('2027-01-01'), 53);
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // Zeitumstellung
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(weekday('2026-11-13'), 4);
});

test('Stundenplan: 14-tägig, Pausen, Ausfälle', () => {
  const s = defaultState();
  s.semester = semesterPresets('2026-11-13')[0];
  s.courses = [{ id: 'c', name: 'Statistik', color: '#000' }];
  s.sessions = [
    { id: 'a', courseId: 'c', weekday: 4, start: '10:15', end: '11:45', weeks: 'even', cancelled: ['2026-11-27'] },
  ];
  assert.equal(sessionOccursOn(s.sessions[0], '2026-11-13', s.semester), true); // KW 46
  assert.equal(sessionOccursOn(s.sessions[0], '2026-11-20', s.semester), false); // KW 47
  assert.equal(agendaFor(s, '2026-11-27')[0].cancelled, true);
  assert.equal(sessionOccursOn(s.sessions[0], '2026-12-25', s.semester), false); // Weihnachtspause
  const nu = nextUp(s, new Date(2026, 10, 13, 10, 30));
  assert.equal(nu.current?.id, 'a');
  assert.equal(nu.next?.date, '2026-12-11', 'ausgefallene Sitzung wird übersprungen');
  s.sessions[0].cancelled = [];
  assert.equal(nextUp(s, new Date(2026, 10, 13, 10, 30)).next?.date, '2026-11-27');
  const lw = lectureWeek(s.semester, '2026-11-13');
  assert.equal(lw.week, 5);
  assert.ok(lw.total >= 16);
});

test('Migration ergänzt fehlende Felder', () => {
  const m = migrate({ profile: { name: 'Kim' }, tasks: [{ id: 1 }], budget: null });
  assert.equal(m.profile.name, 'Kim');
  assert.equal(m.profile.totalEcts, 180);
  assert.equal(m.tasks.length, 1);
  assert.ok(Array.isArray(m.budget.categories));
  assert.equal(m.focus.settings.work, 25);
  const p = semesterPresets('2026-11-13');
  assert.equal(p[0].name, 'WiSe 2026/27');
  assert.equal(p[0].lectureStart, '2026-10-12');
  assert.equal(weekday(p[0].lectureEnd), 4);
});
