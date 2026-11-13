// Erzeugt sw.js mit einer Precache-Liste aller App-Dateien und einer Version aus deren Inhalt.
// Aufruf: node scripts/build-sw.mjs  (nach jeder Änderung an der App ausführen)
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const include = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];
const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f));
  else if (!/\.(map|DS_Store)$/.test(p)) files.push(relative(root, p));
};
for (const i of include) walk(join(root, i));
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);

const sw = `// Automatisch erzeugt von scripts/build-sw.mjs – nicht von Hand bearbeiten.
const VERSION = '${version}';
const CACHE = 'unikram-' + VERSION;
const ASSETS = ${JSON.stringify(['./', ...files], null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  })());
});
`;
writeFileSync(join(root, 'sw.js'), sw);
console.log(`sw.js geschrieben: ${files.length} Dateien, Version ${version}`);
