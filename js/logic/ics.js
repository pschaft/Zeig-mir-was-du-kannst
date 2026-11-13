// iCalendar (.ics): Import aus Uni-Systemen (HISinOne, LSF, TUMonline, Moodle …) und Export.
import { pad, toISODate, weekday, isoWeek, addDays, diffDays, icsLocal, timeToMin } from '../core/date.js';
import { sessionOccursOn } from './timetable.js';

/* ------------------------------ Parser ------------------------------ */

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseLine(line) {
  const idx = findColon(line);
  if (idx < 0) return null;
  const left = line.slice(0, idx), value = line.slice(idx + 1);
  const [name, ...paramParts] = left.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

function findColon(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (line[i] === ':' && !inQuote) return i;
  }
  return -1;
}

/** ICS-Datum → { date: 'YYYY-MM-DD', time: 'HH:MM' | null } in lokaler Zeit */
export function parseIcsDate(value, params = {}) {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, time: null };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7] === 'Z') {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return { date: toISODate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  // Lokale Zeit bzw. TZID (wir nehmen an: gleiche Zeitzone wie das Gerät, z. B. Europe/Berlin)
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

export function parseICS(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur?.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'SUMMARY': cur.summary = unescapeText(p.value).trim(); break;
      case 'LOCATION': cur.location = unescapeText(p.value).trim(); break;
      case 'DESCRIPTION': cur.description = unescapeText(p.value).trim(); break;
      case 'DTSTART': cur.start = parseIcsDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseIcsDate(p.value, p.params); break;
      case 'RRULE': cur.rrule = Object.fromEntries(p.value.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v])); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const d = parseIcsDate(v, p.params); if (d) cur.exdates.push(d.date); } break;
      case 'STATUS': cur.status = p.value.toUpperCase(); break;
      case 'UID': cur.uid = p.value; break;
      default: break;
    }
  }
  return events.filter((e) => e.status !== 'CANCELLED');
}

/* ----------------------- Heuristik für Stundenpläne ----------------------- */

const TYPE_PATTERNS = [
  ['Übung', /(^|[\s(\-–:/,])(übung|uebung|übungen|ue|exercise|tutorial)(?=$|[\s).\-–:/,])/i],
  ['Tutorium', /(^|[\s(\-–:/,])(tutorium|tut)(?=$|[\s).\-–:/,])/i],
  ['Seminar', /(^|[\s(\-–:/,])(seminar|proseminar|hauptseminar)(?=$|[\s).\-–:/,])/i],
  ['Praktikum', /(^|[\s(\-–:/,])(praktikum|labor|lab)(?=$|[\s).\-–:/,])/i],
  ['Vorlesung', /(^|[\s(\-–:/,])(vorlesung|vl|lecture)(?=$|[\s).\-–:/,])/i],
];
// Kürzel in Klammern, z. B. "Analysis I (V)" oder "(Ü)"
const PAREN_TYPES = { V: 'Vorlesung', VL: 'Vorlesung', VO: 'Vorlesung', Ü: 'Übung', UE: 'Übung', U: 'Übung', S: 'Seminar', SE: 'Seminar', P: 'Praktikum', PR: 'Praktikum', T: 'Tutorium', TUT: 'Tutorium' };
const PAREN_RE = /\(\s*(V|VL|VO|Ü|UE|U|S|SE|P|PR|T|TUT)\s*\)/i;
const EXAM_RE = /(klausur|prüfung|pruefung|exam|nachklausur|probeklausur|testat)/i;

export function detectType(summary) {
  const p = PAREN_RE.exec(summary);
  if (p) return PAREN_TYPES[p[1].toUpperCase()] ?? 'Vorlesung';
  for (const [type, re] of TYPE_PATTERNS) if (re.test(summary)) return type;
  return 'Vorlesung';
}

/** Kursnamen von Typ-Kennzeichnungen befreien: "Analysis I - Übung (Gruppe 3)" → "Analysis I" */
export function courseNameFrom(summary) {
  let s = summary
    .replace(/\((gruppe|grp|group)[^)]*\)/gi, '')
    .replace(/\b(gruppe|grp)\s*\d+\b/gi, '')
    .replace(new RegExp(PAREN_RE.source, 'gi'), '');
  for (const [, re] of TYPE_PATTERNS) s = s.replace(new RegExp(re.source, 'gi'), '$1');
  s = s.replace(/\(\s*\)/g, '').replace(/\s*[-–:/|,]+\s*$/g, '').replace(/^\s*[-–:/|,]+\s*/g, '').replace(/\s{2,}/g, ' ').trim();
  return s || summary.trim();
}

const BYDAY = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

/**
 * Wandelt geparste Events in Vorschläge um:
 *  - RRULE weekly → Sitzungen
 *  - Ohne RRULE, aber ≥ 3 gleichartige Termine (gleicher Titel/Wochentag/Uhrzeit) → Sitzung (wöchentlich oder 14-tägig)
 *  - Rest → Einzeltermine (Prüfungen erkannt an "Klausur"/"Prüfung")
 */
export function analyzeICS(events) {
  const sessions = [];
  const singles = [];
  const groups = new Map();

  for (const e of events) {
    if (!e.start?.time) {
      singles.push(toSingle(e));
      continue;
    }
    if (e.rrule?.FREQ === 'WEEKLY') {
      const interval = Number(e.rrule.INTERVAL || 1);
      const days = e.rrule.BYDAY ? e.rrule.BYDAY.split(',').map((d) => BYDAY[d.replace(/^[+-]?\d+/, '')]).filter((x) => x != null) : [weekday(e.start.date)];
      const until = e.rrule.UNTIL ? parseIcsDate(e.rrule.UNTIL)?.date : null;
      for (const wd of days) {
        sessions.push({
          summary: e.summary ?? 'Veranstaltung', weekday: wd, start: e.start.time, end: e.end?.time ?? addMinutes(e.start.time, 90),
          room: e.location ?? '', weeks: interval === 2 ? (isoWeek(e.start.date) % 2 ? 'odd' : 'even') : 'all',
          from: e.start.date, until, count: null,
        });
      }
      continue;
    }
    const key = [e.summary, weekday(e.start.date), e.start.time, e.end?.time].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  for (const list of groups.values()) {
    const isExam = EXAM_RE.test(list[0].summary ?? '');
    if (list.length >= 3 && !isExam) {
      list.sort((a, b) => a.start.date.localeCompare(b.start.date));
      const gaps = list.slice(1).map((e, i) => diffDays(list[i].start.date, e.start.date));
      const biweekly = gaps.length && gaps.every((g) => g % 14 === 0);
      const rooms = new Map();
      for (const e of list) if (e.location) rooms.set(e.location, (rooms.get(e.location) ?? 0) + 1);
      const room = [...rooms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      sessions.push({
        summary: list[0].summary ?? 'Veranstaltung', weekday: weekday(list[0].start.date), start: list[0].start.time,
        end: list[0].end?.time ?? addMinutes(list[0].start.time, 90), room,
        weeks: biweekly ? (isoWeek(list[0].start.date) % 2 ? 'odd' : 'even') : 'all',
        from: list[0].start.date, until: list.at(-1).start.date, count: list.length,
      });
    } else {
      for (const e of list) singles.push(toSingle(e));
    }
  }

  // Kurse ableiten
  const courseNames = new Map();
  for (const s of sessions) {
    s.type = detectType(s.summary);
    s.course = courseNameFrom(s.summary);
    courseNames.set(s.course.toLowerCase(), courseNames.get(s.course.toLowerCase()) ?? s.course);
  }
  for (const e of singles) {
    const n = courseNameFrom(e.title.replace(EXAM_RE, '').trim() || e.title);
    const match = [...courseNames.values()].find((c) => n.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(n.toLowerCase()));
    e.course = match ?? null;
  }
  sessions.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  singles.sort((a, b) => a.date.localeCompare(b.date));
  return { sessions, singles, courses: [...courseNames.values()] };
}

function toSingle(e) {
  return {
    title: e.summary ?? 'Termin', date: e.start.date, start: e.start.time, end: e.end?.time ?? null,
    room: e.location ?? '', kind: EXAM_RE.test(e.summary ?? '') ? 'exam' : 'event', notes: e.description ?? '',
  };
}

function addMinutes(t, m) {
  const x = timeToMin(t) + m;
  return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
}

/* ------------------------------ Export ------------------------------ */

function escapeText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (curLen + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch;
    curLen += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function stamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Exportiert Stundenplan, Termine/Prüfungen und Aufgaben mit Fälligkeit. */
export function exportICS(state, { sessions = true, events = true, tasks = true } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Unikram//Studi-App//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Unikram'];
  const dtstamp = stamp();
  const courses = new Map(state.courses.map((c) => [c.id, c]));
  const sem = state.semester;

  if (sessions && sem.lectureStart && sem.lectureEnd) {
    for (const s of state.sessions) {
      const c = courses.get(s.courseId);
      // erstes Vorkommen suchen
      let first = null;
      for (let d = sem.lectureStart; d <= sem.lectureEnd; d = addDays(d, 1)) {
        if (sessionOccursOn(s, d, sem)) { first = d; break; }
      }
      if (!first) continue;
      const ex = [];
      const step = s.weeks === 'all' || !s.weeks ? 7 : 14;
      for (let d = first; d <= sem.lectureEnd; d = addDays(d, step)) {
        if (!sessionOccursOn(s, d, sem) || (s.cancelled ?? []).includes(d)) ex.push(icsLocal(d, s.start));
      }
      L.push('BEGIN:VEVENT', `UID:${s.id}@unikram`, `DTSTAMP:${dtstamp}`,
        `DTSTART:${icsLocal(first, s.start)}`, `DTEND:${icsLocal(first, s.end)}`,
        `RRULE:FREQ=WEEKLY;INTERVAL=${step / 7};UNTIL=${icsLocal(s.until && s.until < sem.lectureEnd ? s.until : sem.lectureEnd, '23:59')}`,
        fold(`SUMMARY:${escapeText(`${c?.name ?? s.title ?? 'Veranstaltung'}${s.type && s.type !== 'Vorlesung' ? ` (${s.type})` : ''}`)}`));
      if (s.room) L.push(fold(`LOCATION:${escapeText(s.room)}`));
      if (ex.length) L.push(fold(`EXDATE:${ex.join(',')}`));
      L.push('END:VEVENT');
    }
  }

  if (events) {
    for (const e of state.events) {
      const c = courses.get(e.courseId);
      L.push('BEGIN:VEVENT', `UID:${e.id}@unikram`, `DTSTAMP:${dtstamp}`);
      if (e.start) {
        L.push(`DTSTART:${icsLocal(e.date, e.start)}`, `DTEND:${icsLocal(e.date, e.end || addMinutes(e.start, 90))}`);
      } else {
        L.push(`DTSTART;VALUE=DATE:${e.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replaceAll('-', '')}`);
      }
      L.push(fold(`SUMMARY:${escapeText(`${e.kind === 'exam' ? '📝 ' : ''}${e.title || c?.name || 'Termin'}`)}`));
      if (e.room) L.push(fold(`LOCATION:${escapeText(e.room)}`));
      if (e.notes) L.push(fold(`DESCRIPTION:${escapeText(e.notes)}`));
      L.push('END:VEVENT');
    }
  }

  if (tasks) {
    for (const t of state.tasks) {
      if (t.done || !t.due) continue;
      L.push('BEGIN:VEVENT', `UID:${t.id}@unikram`, `DTSTAMP:${dtstamp}`);
      if (t.dueTime) L.push(`DTSTART:${icsLocal(t.due, t.dueTime)}`, `DTEND:${icsLocal(t.due, addMinutes(t.dueTime, 30))}`);
      else L.push(`DTSTART;VALUE=DATE:${t.due.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addDays(t.due, 1).replaceAll('-', '')}`);
      L.push(fold(`SUMMARY:${escapeText(`✅ ${t.title}`)}`));
      if (t.notes) L.push(fold(`DESCRIPTION:${escapeText(t.notes)}`));
      L.push('END:VEVENT');
    }
  }

  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
