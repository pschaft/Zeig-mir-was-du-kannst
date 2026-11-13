// Router: #/pfad/:param?query=1 – funktioniert auf GitHub Pages und offline.
// Eingebettet (Artifact) läuft er im Speicher-Modus: Navigation ohne die Adresse zu ändern.

let mode = 'hash';
let memPath = '';

/** Speicher-Modus aktivieren (für eingebettete Ansichten). */
export function useMemoryRouting(initial = '') {
  mode = 'memory';
  memPath = String(initial).replace(/^#?\/?/, '');
}

export function isMemoryRouting() { return mode === 'memory'; }

function currentHash() {
  return mode === 'memory' ? '#/' + memPath : location.hash;
}

export function parseHash(hash = currentHash()) {
  const h = hash.replace(/^#\/?/, '');
  const qi = h.indexOf('?');
  const path = (qi >= 0 ? h.slice(0, qi) : h).replace(/\/+$/, '');
  const query = Object.fromEntries(new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : ''));
  return { path, query };
}

export function matchRoute(routes, path) {
  const pp = path.split('/');
  for (const r of routes) {
    const rp = r.path.split('/');
    if (rp.length !== pp.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(pp[i]);
      else if (rp[i] !== pp[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

const fire = () => dispatchEvent(new HashChangeEvent('hashchange'));

export function navigate(to, { replace = false } = {}) {
  const path = String(to).replace(/^#?\/?/, '');
  if (mode === 'memory') {
    memPath = path;
    fire();
    return;
  }
  const target = '#/' + path;
  if (location.hash === target) { fire(); return; }
  if (replace) {
    try { history.replaceState(null, '', target); fire(); return; } catch { /* Sandbox: Fallback */ }
  }
  location.hash = target;
}

export function href(path, query) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  return `#/${path}${qs && qs !== '?' ? qs : ''}`;
}
