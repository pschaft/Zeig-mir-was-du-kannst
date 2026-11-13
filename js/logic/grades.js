// Notenrechnung nach deutschem System (1,0 – 5,0), ECTS-gewichtet.

export const GRADE_SCALE = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0];

export function gradeLabel(g) {
  if (g == null) return '';
  if (g <= 1.5) return 'sehr gut';
  if (g <= 2.5) return 'gut';
  if (g <= 3.5) return 'befriedigend';
  if (g <= 4.0) return 'ausreichend';
  return 'nicht bestanden';
}

/** Abschlussnote: Standard ist "nach der ersten Nachkommastelle abschneiden" (§ in vielen Prüfungsordnungen). */
export function finalGrade(avg, rounding = 'truncate') {
  if (avg == null) return null;
  return rounding === 'round' ? Math.round(avg * 10 + 1e-9) / 10 : Math.floor(avg * 10 + 1e-9) / 10;
}

export function isPassed(m) {
  if (m.graded === false) return !!m.passed;
  return m.grade != null && m.grade <= 4.0;
}

/**
 * Zusammenfassung. Geplante Module (planned) werden nur mit includePlanned + expected einbezogen.
 */
export function summary(modules, { totalEcts = 180, rounding = 'truncate', includePlanned = false } = {}) {
  let wsum = 0, wects = 0, doneEcts = 0, count = 0, plannedEcts = 0;
  for (const m of modules) {
    const ects = Number(m.ects) || 0;
    let grade = m.grade;
    if (m.planned) {
      plannedEcts += ects;
      if (!includePlanned || m.expected == null) continue;
      grade = m.expected;
    }
    if (m.graded === false) {
      if (m.passed || (m.planned && includePlanned)) doneEcts += ects;
      continue;
    }
    if (grade == null || grade > 4.0) continue;
    doneEcts += ects;
    if (m.counts === false) continue;
    const w = ects * (m.weight ?? 1);
    wsum += grade * w;
    wects += w;
    count++;
  }
  const avg = wects > 0 ? wsum / wects : null;
  return {
    avg, final: finalGrade(avg, rounding), wsum, gradedEcts: wects, doneEcts, totalEcts, count, plannedEcts,
    progress: totalEcts > 0 ? Math.min(1, doneEcts / totalEcts) : 0,
  };
}

/**
 * Welcher Schnitt ist in den restlichen (benoteten) ECTS höchstens erlaubt, um die Zielnote zu erreichen?
 * @returns {number|null} maximal erlaubter Durchschnitt (kleiner = besser); null wenn keine ECTS übrig
 */
export function requiredAverage({ wsum, gradedEcts }, remainingEcts, target, rounding = 'truncate') {
  if (!(remainingEcts > 0)) return null;
  const threshold = rounding === 'round' ? target + 0.05 : target + 0.1;
  return (threshold * (gradedEcts + remainingEcts) - wsum) / remainingEcts - 1e-6;
}

/** Interpretation des Ergebnisses von requiredAverage. */
export function requiredVerdict(x) {
  if (x == null) return { kind: 'none' };
  if (x < 1.0) return { kind: 'impossible' };
  if (x >= 4.0) return { kind: 'safe' };
  // auf zwei Nachkommastellen nach unten (konservativ)
  return { kind: 'need', value: Math.floor(x * 100) / 100 };
}

export function bySemester(modules) {
  const map = new Map();
  for (const m of modules) {
    const k = m.semester || 'Ohne Semester';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return [...map.entries()].sort((a, b) => semesterSortKey(b[0]).localeCompare(semesterSortKey(a[0])));
}

/** 'WiSe 25/26' → '2025-2', 'SoSe 2026' → '2026-1' (sortierbar) */
export function semesterSortKey(name) {
  const s = String(name);
  let m = /(wise|ws|winter)\D*(\d{2,4})/i.exec(s);
  if (m) return `${normYear(m[2])}-2`;
  m = /(sose|ss|sommer)\D*(\d{2,4})/i.exec(s);
  if (m) return `${normYear(m[2])}-1`;
  m = /(\d)\.?\s*(fs|sem|semester)/i.exec(s);
  if (m) return `0000-${m[1].padStart(2, '0')}`;
  return s === 'Ohne Semester' ? '0000' : s;
}
function normYear(y) { return y.length === 2 ? `20${y}` : y; }

export function distribution(modules) {
  const counts = new Map(GRADE_SCALE.map((g) => [g, 0]));
  for (const m of modules) {
    if (m.planned || m.graded === false || m.grade == null) continue;
    const nearest = GRADE_SCALE.reduce((best, g) => (Math.abs(g - m.grade) < Math.abs(best - m.grade) ? g : best), GRADE_SCALE[0]);
    counts.set(nearest, counts.get(nearest) + 1);
  }
  return [...counts.entries()].map(([grade, count]) => ({ grade, count }));
}

/** Prozent → Note nach linearer Skala (bestanden ab passPct, 1,0 ab topPct). */
export function percentToGrade(pct, passPct = 50, topPct = 95) {
  if (pct < passPct) return 5.0;
  const steps = GRADE_SCALE.slice(0, 10); // 1,0 … 4,0
  for (let i = 0; i < steps.length; i++) {
    const threshold = topPct - (i * (topPct - passPct)) / 9;
    if (pct >= threshold - 1e-9) return steps[i];
  }
  return 4.0;
}

export function gradeTable(maxPoints, passPct = 50, topPct = 95) {
  const steps = GRADE_SCALE.slice(0, 10);
  return steps.map((g, i) => {
    const p = topPct - (i * (topPct - passPct)) / 9;
    return { grade: g, pct: p, points: Math.ceil((p / 100) * maxPoints * 2 - 1e-9) / 2 };
  });
}

/** Modifizierte Bayerische Formel für ausländische Noten. */
export function bavarian(nmax, nmin, nd) {
  if (nmax === nmin) return null;
  const x = 1 + 3 * ((nmax - nd) / (nmax - nmin));
  return Math.max(1, Math.min(5, x));
}
