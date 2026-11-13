// Geräteübergreifende Synchronisation über die db-Fähigkeit der Plattform (nur eingebettet).
// Daten liegen im privaten Bereich data/users/<id>/ – nur für dich lesbar.
// Ablauf: Einheiten schreiben (nur geänderte) → zuletzt das Manifest. Andere Geräte
// hören auf das Manifest und laden geänderte Einheiten nach.
import { store } from '../core/store.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { sheet, toast } from '../core/ui.js';
import { capability, EMBED } from '../core/env.js';
import { fmtDate, tsToDate } from '../core/date.js';
import { encodeUnits, decodeUnits, fnv, docIds, splitJson, manifestFor, isPristine } from '../logic/syncformat.js';

const LS_KEY = 'unikram:sync';
const DEVICE = Math.random().toString(36).slice(2, 10);
const PUSH_DELAY = 2500;

let db = null, base = null, unsub = null;
let status = 'off';
let message = '';
let busy = false, again = false, timer = null, pendingManifest = null, readonly = false;
const listeners = new Set();

let meta = (() => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') ?? { lastSyncAt: 0, units: {}, uid: null }; } catch { return { lastSyncAt: 0, units: {}, uid: null }; }
})();
function saveMeta() { try { localStorage.setItem(LS_KEY, JSON.stringify(meta)); } catch { /* egal */ } }

function setStatus(s, msg = '') {
  status = s;
  message = msg;
  for (const fn of listeners) { try { fn(status); } catch { /* */ } }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  try { return await fn(); } catch (e) {
    if ((e?.code ?? 'unavailable') !== 'unavailable') throw e;
    await wait(400 + Math.random() * 800);
    return fn();
  }
}

function handleError(e) {
  const code = e?.code;
  console.warn('[Unikram-Sync]', code, e?.message ?? e);
  if (code === 'invalid_argument' && !meta.lastSyncAt) {
    readonly = true;
    setStatus('readonly', 'Keine Schreibrechte – Daten bleiben auf diesem Gerät.');
  } else if (code === 'quota_exceeded') {
    setStatus('error', 'Speicherplatz im Konto voll. Alte Daten (z. B. Karteikarten-Verlauf) aufräumen.');
  } else if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled') {
    setStatus('off');
    unsub?.();
  } else {
    setStatus('error', 'Gerade keine Verbindung – wird später erneut versucht.');
    schedulePush(15000);
  }
}

async function push() {
  if (!db || readonly) return;
  if (busy) { again = true; return; }
  const st = store.state;
  if ((st.meta.updatedAt ?? 0) <= (meta.lastSyncAt ?? 0) && meta.lastSyncAt) { if (status !== 'conflict') setStatus('ok'); return; }
  busy = true;
  setStatus('syncing');
  try {
    // Optimistische Nebenläufigkeit: Hat ein anderes Gerät seit unserem letzten Abgleich geschrieben?
    const cur = await withRetry(() => db.doc(`${base}/manifest`).get());
    if (cur.exists) {
      const m = cur.data();
      if (m.device !== DEVICE && (m.updatedAt ?? 0) > (meta.lastSyncAt ?? 0)) {
        busy = false;
        await reconcile(m);
        return;
      }
    }
    const units = encodeUnits(st);
    const next = manifestFor(units);
    for (const [name, json] of units) {
      const old = meta.units[name];
      if (old && old.h === next[name].h && old.n === next[name].n) continue;
      const parts = splitJson(json);
      const ids = docIds(name, parts.length);
      for (let i = 0; i < ids.length; i++) await withRetry(() => db.doc(`${base}/${ids[i]}`).set({ j: parts[i] }));
    }
    const updatedAt = st.meta.updatedAt || Date.now();
    await withRetry(() => db.doc(`${base}/manifest`).set({ v: 1, updatedAt, device: DEVICE, units: next }));
    // Veraltete Dokumente entfernen (erst nach dem Manifest – Leser sehen nie Lücken)
    for (const [name, old] of Object.entries(meta.units)) {
      const keep = new Set(next[name] ? docIds(name, next[name].n) : []);
      for (const id of docIds(name, old.n)) if (!keep.has(id)) await withRetry(() => db.doc(`${base}/${id}`).delete()).catch(() => {});
    }
    meta = { ...meta, lastSyncAt: updatedAt, units: next };
    saveMeta();
    setStatus('ok');
  } catch (e) {
    handleError(e);
  } finally {
    busy = false;
    if (again) { again = false; schedulePush(300); }
  }
}

async function pull(manifest, { silent = false } = {}) {
  setStatus('syncing');
  const local = encodeUnits(store.state);
  const units = new Map();
  for (const [name, info] of Object.entries(manifest.units ?? {})) {
    const lj = local.get(name);
    if (lj != null && fnv(lj) === info.h) { units.set(name, lj); continue; }
    let json = '';
    for (const id of docIds(name, info.n)) {
      const snap = await withRetry(() => db.doc(`${base}/${id}`).get());
      if (!snap.exists) throw Object.assign(new Error(`Teil fehlt: ${id}`), { code: 'mid_write' });
      json += snap.data().j;
    }
    if (fnv(json) !== info.h) throw Object.assign(new Error('Prüfsumme passt nicht'), { code: 'mid_write' });
    units.set(name, json);
  }
  const next = decodeUnits(units);
  next.meta = { ...store.state.meta, updatedAt: manifest.updatedAt };
  store.replace(next, { remote: true });
  meta = { ...meta, lastSyncAt: manifest.updatedAt, units: manifest.units };
  saveMeta();
  setStatus('ok');
  dispatchEvent(new CustomEvent('unikram:synced'));
  if (!silent) toast('Mit deinem Konto synchronisiert', { type: 'success', iconName: 'cloud' });
}

async function safePull(manifest, opts) {
  try { await pull(manifest, opts); } catch (e) {
    if (e?.code === 'mid_write') { setStatus('syncing'); setTimeout(() => reconcileLatest(), 3000); return; }
    handleError(e);
  }
}

async function reconcileLatest() {
  try {
    const snap = await withRetry(() => db.doc(`${base}/manifest`).get());
    await reconcile(snap.exists ? snap.data() : null);
  } catch (e) { handleError(e); }
}

async function reconcile(manifest) {
  const local = store.state;
  const last = meta.lastSyncAt ?? 0;
  const localChanged = (local.meta.updatedAt ?? 0) > last;
  if (!manifest) { if (!isPristine(local) || local.profile.onboarded) await push(); else setStatus('ok'); return; }
  const remoteChanged = (manifest.updatedAt ?? 0) > last;
  if (!remoteChanged) { if (localChanged) await push(); else setStatus('ok'); return; }
  if (!localChanged || isPristine(local)) { await safePull(manifest, { silent: !last && isPristine(local) ? false : true }); return; }
  pendingManifest = manifest;
  setStatus('conflict', 'Auf einem anderen Gerät und hier wurde gleichzeitig etwas geändert.');
  askConflict(manifest);
}

function askConflict(manifest) {
  const localAt = store.state.meta.updatedAt;
  sheet({
    title: 'Welche Version behalten?',
    body: html`<p class="muted small mb-16">Seit dem letzten Abgleich wurde sowohl auf diesem Gerät als auch auf einem anderen etwas geändert. Unikram führt keine halben Sachen zusammen – wähle, welche Version gelten soll.</p>
      <div class="stack">
        <button class="choice" data-pick="remote"><span class="emoji">☁️</span><span><div class="ch-title">Version aus dem Konto</div><div class="ch-desc">Zuletzt geändert ${fmtDate(tsToDate(manifest.updatedAt))}, ${new Date(manifest.updatedAt).toTimeString().slice(0, 5)} Uhr auf einem anderen Gerät</div></span></button>
        <button class="choice" data-pick="local"><span class="emoji">📱</span><span><div class="ch-title">Version dieses Geräts</div><div class="ch-desc">Zuletzt geändert ${fmtDate(tsToDate(localAt))}, ${new Date(localAt).toTimeString().slice(0, 5)} Uhr – überschreibt die Konto-Version</div></span></button>
      </div>
      <p class="tiny muted mt-12">Tipp: Vorher in den Einstellungen ein Backup exportieren, wenn du unsicher bist.</p>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
        close();
        if (b.dataset.pick === 'remote') await safePull(pendingManifest);
        else { meta.lastSyncAt = pendingManifest.updatedAt; await push(); }
        pendingManifest = null;
      }));
    },
  });
}

function schedulePush(delay = PUSH_DELAY) {
  if (!db || readonly) return;
  clearTimeout(timer);
  timer = setTimeout(push, delay);
}

export const sync = {
  get status() { return status; },
  get message() { return message; },
  get lastSyncAt() { return meta.lastSyncAt; },
  get available() { return !!db; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async now() { if (pendingManifest) return askConflict(pendingManifest); await reconcileLatest(); },
  async init() {
    if (!EMBED || db) return;
    const [dbNs, user] = await Promise.all([capability('db'), capability('user')]);
    if (!dbNs || !user) return setStatus('off');
    let id = null;
    try { id = await user.id(); } catch { id = null; }
    if (!id) return setStatus('off');
    db = dbNs;
    base = `data/users/${id}`;
    if (meta.uid !== id) { meta = { uid: id, lastSyncAt: 0, units: {} }; saveMeta(); }
    setStatus('connecting');
    await reconcileLatest();
    try {
      unsub = db.doc(`${base}/manifest`).onSnapshot((snap) => {
        if (!snap.exists || snap.metadata.hasPendingWrites) return;
        const m = snap.data();
        if (m.device === DEVICE || (m.updatedAt ?? 0) <= (meta.lastSyncAt ?? 0) || busy) return;
        reconcile(m);
      }, handleError);
    } catch (e) { handleError(e); }
    store.subscribe(() => {
      if ((store.state.meta.updatedAt ?? 0) > (meta.lastSyncAt ?? 0) && status !== 'conflict') schedulePush();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); push(); } });
  },
};

export function syncBadge() {
  const map = {
    ok: ['cloud', 'Synchronisiert', 'success'], syncing: ['repeat', 'Synchronisiere …', 'accent'], connecting: ['cloud', 'Verbinde …', ''],
    error: ['alert', 'Sync-Problem', 'warning'], conflict: ['alert', 'Konflikt', 'danger'], readonly: ['lock', 'Nur lokal', ''], off: ['lock', 'Nur auf diesem Gerät', ''],
  };
  const [ic, label, kind] = map[status] ?? map.off;
  return html`<span class="badge ${kind ? `badge-${kind}` : ''}">${icon(ic)} ${label}</span>`;
}
