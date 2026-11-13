// Kleine Helfer ohne DOM-Abhängigkeit (außer download/readFile/copy).

export function uid(prefix = '') {
  const rnd = (globalThis.crypto?.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9)
    : Math.random().toString(36).slice(2, 11);
  return prefix + Date.now().toString(36).slice(-5) + rnd;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function sortBy(arr, ...fns) {
  return [...arr].sort((a, b) => {
    for (const fn of fns) {
      const va = fn(a), vb = fn(b);
      if (va < vb) return -1;
      if (va > vb) return 1;
    }
    return 0;
  });
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function randInt(max) {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text für Suche normalisieren: Kleinbuchstaben, Umlaute vereinfacht */
export function norm(s) {
  return String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Unscharfe Suche: Teilfolge-Treffer mit Punktzahl (höher = besser), -1 = kein Treffer */
export function fuzzyScore(query, text) {
  const q = norm(query).replace(/\s+/g, ''), t = norm(text);
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx * 2 - (t.length - q.length) * 0.1 + (idx === 0 || t[idx - 1] === ' ' ? 200 : 0);
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - (found - ti);
    ti = found + 1;
  }
  return score;
}

export function download(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      f.text().then((text) => resolve({ name: f.name, text }), () => resolve(null));
    });
    document.body.append(input);
    input.click();
  });
}

export async function copyText(text, htmlText) {
  try {
    if (htmlText && globalThis.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([htmlText], { type: 'text/html' }),
      })]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* egal */ }
}

/** base64url für Teilen-Links (mit optionaler Kompression). */
function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export async function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (globalThis.CompressionStream) {
    try {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      return 'z' + toB64Url(buf);
    } catch { /* Fallback */ }
  }
  return 'j' + toB64Url(bytes);
}

export async function decodeShare(s) {
  const kind = s[0], data = fromB64Url(s.slice(1));
  let bytes = data;
  if (kind === 'z') {
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
