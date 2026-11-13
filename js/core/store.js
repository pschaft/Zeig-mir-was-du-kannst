// Zentraler Zustand mit Persistenz in localStorage, Tab-Synchronisation und Undo-Snapshots.
import { defaultState, migrate } from '../logic/state.js';

const KEY = 'unikram:v1';
let persistent = true;
let lastError = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    persistent = false;
    lastError = e;
    return null;
  }
}

let state = migrate(load() ?? defaultState());
const listeners = new Set();
let saveTimer = null;
let emitQueued = false;

function save() {
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    persistent = true;
  } catch (e) {
    persistent = false;
    lastError = e;
    console.warn('[Unikram] Speichern fehlgeschlagen', e);
  }
}

function queueSave() {
  if (!saveTimer) saveTimer = setTimeout(save, 200);
}

function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    for (const fn of listeners) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  });
}

export const store = {
  get state() { return state; },
  get persistent() { return persistent; },
  get lastError() { return lastError; },
  /** Zustand verändern: store.update(s => { s.tasks.push(...) }) */
  update(fn) {
    const r = fn(state);
    queueSave();
    emit();
    return r;
  },
  replace(next) {
    state = migrate(structuredClone(next));
    save();
    emit();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot() { return structuredClone(state); },
  flush() {
    if (saveTimer) { clearTimeout(saveTimer); save(); }
  },
  /** Nur für Speicherplatz-Anzeige */
  sizeBytes() {
    try { return new Blob([JSON.stringify(state)]).size; } catch { return 0; }
  },
  KEY,
};

addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    state = migrate(JSON.parse(e.newValue));
    emit();
  } catch { /* ignorieren */ }
});

// Browser bitten, die Daten nicht automatisch zu löschen.
try { navigator.storage?.persist?.(); } catch { /* egal */ }
