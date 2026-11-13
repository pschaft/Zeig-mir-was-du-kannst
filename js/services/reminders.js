// Erinnerungen, solange die App (auch im Hintergrund-Tab) geöffnet ist:
// 10 Minuten vor Veranstaltungen und 30 Minuten vor Aufgaben mit Uhrzeit.
import { store } from '../core/store.js';
import { today, timeToMin, nowMinutes } from '../core/date.js';
import { agendaFor } from '../logic/timetable.js';
import { notify } from './notify.js';

const sent = new Set();

function check() {
  const s = store.state;
  if (!s.settings.reminders) return;
  const d = today();
  const now = nowMinutes();
  for (const it of agendaFor(s, d)) {
    if (it.cancelled || !it.start) continue;
    const diff = timeToMin(it.start) - now;
    const key = `s:${it.id}:${d}`;
    if (diff > 0 && diff <= 10 && !sent.has(key)) {
      sent.add(key);
      notify(`Gleich: ${it.title}`, `${it.start} Uhr${it.room ? ` · ${it.room}` : ''}`, { tag: key, onlyWhenHidden: false });
    }
  }
  for (const t of s.tasks) {
    if (t.done || t.due !== d || !t.dueTime) continue;
    const diff = timeToMin(t.dueTime) - now;
    const key = `t:${t.id}:${d}`;
    if (diff > 0 && diff <= 30 && !sent.has(key)) {
      sent.add(key);
      notify(`Fällig um ${t.dueTime}: ${t.title}`, 'Aufgabe aus Unikram', { tag: key, onlyWhenHidden: false });
    }
  }
}

export function initReminders() {
  setInterval(check, 30000);
  setTimeout(check, 3000);
}
