// Beispieldaten: ein lebendiges Semester zum Ausprobieren (relativ zum heutigen Datum).
import { today, addDays, startOfWeek, monthKey, addMonths, dayStartTs, weekday } from '../core/date.js';
import { uid } from '../core/util.js';
import { semesterPresets, defaultCategories } from './state.js';
import { newSrs, schedule } from './srs.js';
import { applyRecurring } from './budget.js';
import { generatePlan, parseTopics } from './planner.js';

// Deterministischer Zufall, damit die Demo bei jedem Laden gleich aussieht
function rng(seed = 42) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function buildDemo(base = today()) {
  const r = rng(7);
  const sem = semesterPresets(base)[0];
  const C = (name, short, color, ects, lecturer) => ({ id: uid('c'), name, short, color, ects, lecturer, createdAt: Date.now() });
  const alda = C('Algorithmen & Datenstrukturen', 'ALDA', '#5b5bd6', 8, 'Prof. Dr. Weber');
  const ma2 = C('Mathematik II', 'MA2', '#0b84e3', 8, 'Prof. Dr. Lindner');
  const db = C('Datenbanken', 'DB', '#12a594', 6, 'Dr. Krause');
  const rewe = C('Rechnungswesen', 'ReWe', '#ee6b12', 5, 'Prof. Dr. Hoffmann');
  const stat = C('Statistik', 'STAT', '#d6409f', 6, 'Prof. Dr. Yilmaz');
  const eng = C('Englisch B2', 'ENG', '#d99a00', 3, 'Ms. Taylor');
  const courses = [alda, ma2, db, rewe, stat, eng];

  const S = (course, type, wd, start, end, room, weeks = 'all') => ({ id: uid('s'), courseId: course.id, type, weekday: wd, start, end, room, weeks, cancelled: [] });
  const sessions = [
    S(alda, 'Vorlesung', 0, '10:15', '11:45', 'HS 1'),
    S(alda, 'Übung', 3, '14:15', '15:45', 'SR 2.031'),
    S(ma2, 'Vorlesung', 1, '08:15', '09:45', 'Audimax'),
    S(ma2, 'Übung', 2, '12:15', '13:45', 'SR 1.012', 'odd'),
    S(db, 'Vorlesung', 2, '10:15', '11:45', 'HS 3'),
    S(db, 'Praktikum', 4, '10:15', '13:45', 'Rechnerpool C', 'even'),
    S(rewe, 'Vorlesung', 1, '12:15', '13:45', 'HS 2'),
    S(stat, 'Vorlesung', 3, '10:15', '11:45', 'HS 1'),
    S(stat, 'Tutorium', 4, '14:15', '15:45', 'SR 0.004'),
    S(eng, 'Seminar', 0, '16:15', '17:45', 'Sprachenzentrum 2.12'),
  ];

  const E = (course, title, offset, start, end, room, kind = 'exam', notes = '') => ({ id: uid('e'), kind, courseId: course?.id ?? '', title, date: addDays(base, offset), start, end, room, notes, createdAt: Date.now() });
  const exEng = E(eng, 'Englisch: Präsentation', 6, '16:15', '17:45', 'Sprachenzentrum 2.12', 'exam', '10 Minuten + 5 Minuten Fragen');
  const exStat = E(stat, 'Zwischentest Statistik', 12, '10:15', '11:00', 'HS 1', 'exam', 'Taschenrechner erlaubt');
  const exRewe = E(rewe, 'Klausur Rechnungswesen', 89, '09:00', '10:30', 'Audimax');
  const exAlda = E(alda, 'Klausur ALDA', 94, '10:00', '12:00', 'HS 1', 'exam', 'Ein beidseitig handbeschriebenes A4-Blatt erlaubt');
  const exMa2 = E(ma2, 'Klausur Mathematik II', 97, '13:00', '15:00', 'Audimax');
  const exDb = E(db, 'Klausur Datenbanken', 101, '09:00', '10:30', 'HS 3');
  const events = [
    exEng, exStat, exRewe, exAlda, exMa2, exDb,
    E(alda, 'Lerngruppe ALDA', 1, '18:00', '20:00', 'Bibliothek, Gruppenraum 4', 'event'),
    E(null, 'Sprechstunde Prof. Weber', 3, '13:00', '13:30', 'Raum 3.112', 'event'),
    E(null, 'Unifest 🎉', 8, '20:00', '', 'Mensa-Wiese', 'event'),
  ];

  const now = Date.now();
  const T = (title, offset, extra = {}) => ({ id: uid('t'), title, due: offset == null ? null : addDays(base, offset), dueTime: null, courseId: '', priority: 0, notes: '', done: false, createdAt: now - 86400000 * 3, ...extra });
  const tasks = [
    T('Übungsblatt 5 abgeben', 1, { courseId: alda.id, dueTime: '23:59', priority: 1, notes: 'Aufgabe 3 (Heap-Sort) nochmal prüfen. Abgabe über Moodle als PDF.' }),
    T('Blatt 6: Integration durch Substitution', 4, { courseId: ma2.id }),
    T('Folien für die Präsentation fertig machen', 4, { courseId: eng.id, priority: 1 }),
    T('SQL-Praktikum: Aufgabe 3 vorbereiten', 6, { courseId: db.id }),
    T('Semesterbeitrag fürs Sommersemester überweisen', 5, { priority: 2, notes: 'Rückmeldefrist! Betrag und Verwendungszweck stehen im Uni-Portal.' }),
    T('Bewerbung Werkstudentenjob abschicken', 0, { dueTime: '18:00' }),
    T('Bücher in der Bib verlängern', -1),
    T('Zusammenfassung Statistik Kap. 1–3', null, { courseId: stat.id, priority: 1 }),
    T('Großeinkauf für die WG', null),
    T('Übungsblatt 4 abgeben', -6, { courseId: alda.id, done: true, doneAt: now - 86400000 * 6 }),
    T('Mensakarte aufladen', 0, { done: true, doneAt: now - 3600000 }),
  ];

  // Fokus-Sessions der letzten 3 Wochen
  const focusSessions = [];
  const fc = [alda, ma2, db, stat, eng, rewe];
  for (let d = 20; d >= 0; d--) {
    const date = addDays(base, -d);
    const wd = weekday(date);
    let n = d === 0 ? 2 : Math.floor(r() * (wd >= 5 ? 3 : 5));
    if (d === 4) n = 0;
    for (let i = 0; i < n; i++) {
      const c = fc[Math.floor(r() * fc.length)];
      focusSessions.push({ id: uid('f'), start: dayStartTs(date) + (9 + i * 1.5 + r()) * 3600000, minutes: r() < 0.2 ? 50 : 25, courseId: c.id, label: '' });
    }
  }

  // Karteikarten
  const decks = [
    { id: uid('d'), name: 'Englisch – Academic Vocabulary', courseId: eng.id, createdAt: now - 86400000 * 30 },
    { id: uid('d'), name: 'ALDA – Laufzeiten & Begriffe', courseId: alda.id, createdAt: now - 86400000 * 20 },
    { id: uid('d'), name: 'Statistik – Formeln', courseId: stat.id, createdAt: now - 86400000 * 2 },
  ];
  const vocab = [
    ['to scrutinize', 'genau prüfen, unter die Lupe nehmen'], ['thorough', 'gründlich'], ['to substantiate', 'belegen, untermauern'],
    ['ambiguous', 'mehrdeutig'], ['to infer', 'folgern, schließen'], ['comprehensive', 'umfassend'], ['feasible', 'machbar, durchführbar'],
    ['to undermine', 'untergraben, schwächen'], ['consistent', 'widerspruchsfrei; beständig'], ['to emphasize', 'betonen, hervorheben'],
    ['approach', 'Ansatz, Herangehensweise'], ['furthermore', 'darüber hinaus'], ['to acknowledge', 'anerkennen, einräumen'], ['outcome', 'Ergebnis'],
  ];
  const alg = [
    ['Laufzeit von **Quicksort**: Durchschnitt / Worst Case?', '`O(n log n)` / `O(n²)`'],
    ['Was ist ein **stabiles** Sortierverfahren?', 'Elemente mit gleichem Schlüssel behalten ihre relative Reihenfolge.'],
    ['Laufzeit der binären Suche?', '`O(log n)` – funktioniert nur auf sortierten Daten.'],
    ['Heap-Eigenschaft eines **Max-Heaps**?', 'Jeder Knoten ≥ seine Kinder → die Wurzel ist das Maximum.'],
    ['Voraussetzung für **Dijkstra**?', 'Keine negativen Kantengewichte.'],
    ['Unterschied **BFS** und **DFS**?', 'BFS: Schicht für Schicht (Queue)\nDFS: erst in die Tiefe (Stack/Rekursion)'],
    ['Wozu dient das **Master-Theorem**?', 'Lösen von Rekursionen der Form `T(n) = a·T(n/b) + f(n)`'],
    ['Amortisierte Kosten fürs Einfügen in ein dynamisches Array?', '`O(1)` – dank Verdopplung der Kapazität.'],
    ['Was ist beim Hashing eine **Kollision**?', 'Zwei verschiedene Schlüssel werden auf denselben Bucket abgebildet.'],
    ['Höhe eines **AVL-Baums** mit n Knoten?', '`O(log n)` – er ist immer balanciert.'],
    ['Wofür braucht man **topologische Sortierung**?', 'Reihenfolge in gerichteten azyklischen Graphen (DAG), z. B. Abhängigkeiten.'],
    ['Zusätzlicher Speicher von **Mergesort**?', '`O(n)`'],
  ];
  const stats = [
    ['Erwartungswert (diskret)?', '`E(X) = Σ xᵢ · P(X = xᵢ)`'], ['Varianz über Erwartungswerte?', '`Var(X) = E(X²) − E(X)²`'],
    ['Was ist ein **p-Wert**?', 'Wahrscheinlichkeit, unter H₀ ein mindestens so extremes Ergebnis zu beobachten.'],
    ['Fehler **1. Art**?', 'H₀ wird abgelehnt, obwohl sie stimmt (Wahrscheinlichkeit α).'],
    ['Standardnormalverteilung: μ und σ?', 'μ = 0, σ = 1'], ['Korrelation bedeutet nicht …?', '… Kausalität!'],
    ['Median oder Mittelwert bei Ausreißern?', 'Median – er ist robust gegenüber Ausreißern.'], ['Erwartungswert der **Binomialverteilung**?', '`E(X) = n · p`'],
  ];
  const cards = [];
  const reviews = [];
  const mk = (deck, list, reviewedCount, dueCount) => {
    list.forEach(([front, back], i) => {
      const card = { id: uid('k'), deckId: deck.id, front, back, createdAt: deck.createdAt + i, srs: newSrs() };
      if (i < reviewedCount) {
        // simulierte Lernhistorie
        let t = now - 86400000 * (14 + Math.floor(r() * 6));
        for (let k = 0; k < 4 && t < now - 86400000; k++) {
          const g = r() < 0.15 ? 1 : r() < 0.25 ? 2 : r() < 0.85 ? 3 : 4;
          reviews.push({ cardId: card.id, ts: t, rating: g, prevState: card.srs.state });
          card.srs = schedule(card.srs, g, t);
          if (card.srs.state !== 'review') { card.srs = schedule(card.srs, 3, t + 120000); }
          t = Math.max(card.srs.due, t + 86400000);
        }
        if (i < dueCount) card.srs.due = now - 3600000 * (1 + i);
        else if (card.srs.due <= now) card.srs.due = now + 86400000 * (1 + (i % 5));
      }
      cards.push(card);
    });
  };
  mk(decks[0], vocab, 10, 4);
  mk(decks[1], alg, 6, 3);
  mk(decks[2], stats, 0, 0);
  // ein paar Wiederholungen für die Statistik der letzten Tage
  for (let d = 6; d >= 1; d--) for (let k = 0; k < 4 + Math.floor(r() * 10); k++) reviews.push({ cardId: cards[Math.floor(r() * 16)].id, ts: dayStartTs(addDays(base, -d)) + 3600000 * (10 + k * 0.2), rating: r() < 0.8 ? 3 : 1, prevState: 'review' });

  // Noten
  const M = (name, ects, grade, semester, extra = {}) => ({ id: uid('m'), name, ects, grade, semester, graded: true, counts: true, weight: 1, planned: false, expected: null, ...extra });
  const modules = [
    M('Einführung in die Programmierung', 8, 1.7, 'WiSe 25/26'),
    M('Mathematik I', 8, 2.3, 'WiSe 25/26'),
    M('Grundlagen der BWL', 6, 1.3, 'WiSe 25/26'),
    M('Technische Informatik', 6, 2.7, 'WiSe 25/26'),
    M('Wissenschaftliches Arbeiten', 3, null, 'WiSe 25/26', { graded: false, passed: true }),
    M('Objektorientierte Programmierung', 8, 1.3, 'SoSe 2026'),
    M('Diskrete Mathematik', 6, 3.0, 'SoSe 2026'),
    M('Rechnernetze', 6, 2.0, 'SoSe 2026'),
    M('Marketing', 5, 1.7, 'SoSe 2026'),
    M('Softwaretechnik', 6, 2.3, 'SoSe 2026'),
    M('Algorithmen & Datenstrukturen', 8, null, 'WiSe 26/27', { planned: true, expected: 2.0 }),
    M('Mathematik II', 8, null, 'WiSe 26/27', { planned: true, expected: 2.7 }),
    M('Datenbanken', 6, null, 'WiSe 26/27', { planned: true, expected: 1.7 }),
    M('Rechnungswesen', 5, null, 'WiSe 26/27', { planned: true, expected: 2.3 }),
    M('Statistik', 6, null, 'WiSe 26/27', { planned: true, expected: 2.0 }),
  ];

  // Budget
  const cur = monthKey(base);
  const budget = { limit: 90000, categories: defaultCategories(), transactions: [], recurring: [] };
  const R = (note, amount, categoryId, day, type = 'expense') => ({ id: uid('r'), type, note, amount, categoryId, day, active: true, startMonth: addMonths(cur, -2), lastApplied: null });
  budget.recurring.push(
    R('Miete WG-Zimmer', 42000, 'rent', 1), R('Handyvertrag', 999, 'subs', 5), R('Spotify Student', 599, 'subs', 15),
    R('Fitnessstudio', 2490, 'health', 1), R('BAföG', 65000, 'bafoeg', 1, 'income'), R('Nebenjob im Café', 53800, 'job', 10, 'income'),
  );
  applyRecurring(budget, base);
  const variable = [
    ['food', 'Rewe Wocheneinkauf', 3480], ['mensa', 'Mensa', 390], ['mensa', 'Mensa', 420], ['food', 'Aldi', 2215], ['mensa', 'Döner mit Lena', 750],
    ['fun', 'Kino', 1200], ['uni', 'Skript-Druck Copyshop', 860], ['health', 'dm Drogerie', 1145], ['transport', 'Fahrradschlauch', 899],
    ['fun', 'Bar mit der Lerngruppe', 1800], ['mensa', 'Mensa', 390], ['food', 'Rewe', 1840], ['mensa', 'Coffee to go', 320], ['clothes', 'Second-Hand-Pulli', 1500],
    ['food', 'Wochenmarkt', 960], ['mensa', 'Mensa', 450], ['fun', 'Spieleabend Snacks', 640], ['uni', 'Fachbuch gebraucht', 1999],
  ];
  for (let m = 2; m >= 0; m--) {
    const key = addMonths(cur, -m);
    const lastDay = m === 0 ? Number(base.slice(8, 10)) : 28;
    const count = m === 0 ? Math.min(variable.length, Math.max(4, Math.round(lastDay * 1.2))) : variable.length;
    for (let i = 0; i < count; i++) {
      const [cat, note, amt] = variable[i % variable.length];
      const day = Math.max(1, Math.min(lastDay, 1 + Math.floor((i / count) * lastDay)));
      budget.transactions.push({ id: uid('t'), type: 'expense', amount: Math.round(amt * (0.8 + r() * 0.5)), categoryId: cat, date: `${key}-${String(day).padStart(2, '0')}`, note, createdAt: now });
    }
  }
  budget.categories.find((c) => c.id === 'food').limit = 15000;
  budget.categories.find((c) => c.id === 'fun').limit = 6000;
  budget.categories.find((c) => c.id === 'mensa').limit = 8000;

  // WG-Kasse
  const me = { id: uid('p'), name: 'Du' };
  const lena = { id: uid('p'), name: 'Lena' }, jonas = { id: uid('p'), name: 'Jonas' }, mia = { id: uid('p'), name: 'Mia' };
  const all = [me, lena, jonas, mia].map((m) => m.id);
  const X = (title, amount, payer, among, offset, kind = 'expense') => ({ id: uid('x'), title, amount, payerId: payer.id, split: { type: 'equal', among }, date: addDays(base, offset), kind, createdAt: now });
  const groups = [{
    id: uid('g'), name: 'WG Lindenstraße', emoji: '🏠', meId: me.id, members: [me, lena, jonas, mia], createdAt: now,
    expenses: [
      X('Rewe Großeinkauf', 6340, lena, all, -9), X('Internet November', 3999, jonas, all, -8), X('Klopapier & Putzmittel', 1875, me, all, -6),
      X('Pizza-Abend', 4200, mia, [me.id, lena.id, mia.id], -4), X('Netflix', 1399, me, all, -3), X('Spülmaschinen-Tabs', 849, jonas, all, -1),
      { id: uid('x'), title: 'Ausgleich', amount: 1585, payerId: mia.id, split: { type: 'exact', shares: { [lena.id]: 1585 } }, date: addDays(base, -2), kind: 'payment', createdAt: now },
    ],
    chores: { tasks: ['Bad putzen', 'Küche', 'Müll & Altglas', 'Staubsaugen'], start: addDays(startOfWeek(base), -14), done: {} },
  }];

  // Gewohnheiten
  const H = (name, emoji, color, days, prob, doneToday) => {
    const log = {};
    for (let d = 1; d < 75; d++) { const date = addDays(base, -d); if (days.includes(weekday(date)) && r() < prob) log[date] = 1; }
    for (let d = 1; d <= 3; d++) { const date = addDays(base, -d); if (days.includes(weekday(date))) log[date] = 1; }
    if (doneToday) log[base] = 1;
    return { id: uid('h'), name, emoji, color, days, log, createdDate: addDays(base, -80), createdAt: now };
  };
  const habits = [
    H('Sport', '🏃', '#2f9e5b', [0, 2, 4], 0.75, false),
    H('2 Liter Wasser', '💧', '#0b84e3', [0, 1, 2, 3, 4, 5, 6], 0.6, true),
    H('30 Min lesen', '📖', '#8e4ec6', [0, 1, 2, 3, 4, 5, 6], 0.5, false),
    H('Vokabeln', '🗣️', '#ee6b12', [0, 1, 2, 3, 4], 0.8, true),
  ];

  // Lernplan
  const topics = {
    [exEng.id]: parseTopics('Folien gestalten; 1,5\nVortrag üben; 1,5'),
    [exStat.id]: parseTopics('Deskriptive Statistik; 2\nWahrscheinlichkeitsrechnung; 3\nZufallsvariablen; 2'),
    [exAlda.id]: parseTopics('Sortierverfahren; 6\nBäume & Heaps; 6\nGraphenalgorithmen; 8\nHashing; 4\nDynamische Programmierung; 6'),
    [exRewe.id]: parseTopics('Buchführung; 6\nBilanz & GuV; 6\nKostenrechnung; 6'),
  };
  for (const list of Object.values(topics)) for (const t of list) t.id = uid('tp');
  const availability = [150, 120, 150, 120, 120, 90, 60];
  const examsForPlan = events.filter((e) => topics[e.id]).map((e) => ({ id: e.id, title: e.title, date: e.date, topics: topics[e.id] }));
  const gen = generatePlan({ exams: examsForPlan, availability, start: base, blockMinutes: 60 });

  // Literatur
  const citations = [
    { id: uid('q'), type: 'book', createdAt: now, fields: { authors: [{ family: 'Kahneman', given: 'Daniel' }], year: '2012', title: 'Schnelles Denken, langsames Denken', subtitle: '', edition: '', place: 'München', publisher: 'Siedler', url: '', doi: '' } },
    { id: uid('q'), type: 'article', createdAt: now, fields: { authors: [{ family: 'Cepeda', given: 'Nicholas J.' }, { family: 'Pashler', given: 'Harold' }, { family: 'Vul', given: 'Edward' }, { family: 'Wixted', given: 'John T.' }, { family: 'Rohrer', given: 'Doug' }], year: '2006', title: 'Distributed practice in verbal recall tasks', subtitle: 'A review and quantitative synthesis', journal: 'Psychological Bulletin', volume: '132', issue: '3', pages: '354-380', doi: '10.1037/0033-2909.132.3.354', url: '' } },
    { id: uid('q'), type: 'web', createdAt: now, fields: { authors: [], year: '', title: 'Lernkartei', subtitle: '', site: 'Wikipedia', url: 'https://de.wikipedia.org/wiki/Lernkartei', accessed: base } },
  ];

  return {
    semester: sem, courses, sessions, events, tasks,
    focusSessions, decks, cards, reviews, modules, budget, groups, habits,
    plan: { availability, blockMinutes: 60, topics, blocks: gen.blocks, generatedAt: now, warnings: gen.warnings },
    citations,
  };
}

/** Demo in einen Zustand einspielen (überschreibt Inhalte, behält Profil & Einstellungen). */
export function applyDemo(state, base = today()) {
  const d = buildDemo(base);
  state.semester = d.semester;
  state.courses = d.courses;
  state.sessions = d.sessions;
  state.events = d.events;
  state.tasks = d.tasks;
  state.focus.sessions = d.focusSessions;
  state.decks = d.decks;
  state.cards = d.cards;
  state.reviews = d.reviews;
  state.modules = d.modules;
  state.budget = d.budget;
  state.groups = [...state.groups.filter((g) => !g.demo), ...d.groups.map((g) => ({ ...g, demo: true }))];
  state.habits = d.habits;
  state.plan = d.plan;
  state.citations = d.citations;
  state.profile.totalEcts = 180;
  state.profile.program ||= 'Wirtschaftsinformatik (B.Sc.)';
  state.meta.demo = true;
  return state;
}
