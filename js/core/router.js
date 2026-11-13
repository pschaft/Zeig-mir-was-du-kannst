// Hash-Router: #/pfad/:param?query=1 – funktioniert auf GitHub Pages und offline.

export function parseHash(hash = location.hash) {
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

export function navigate(to, { replace = false } = {}) {
  const target = '#/' + String(to).replace(/^#?\/?/, '');
  if (location.hash === target) {
    dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) {
    history.replaceState(null, '', target);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function href(path, query) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  return `#/${path}${qs && qs !== '?' ? qs : ''}`;
}
