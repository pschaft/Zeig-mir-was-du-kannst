// Automatisch erzeugt von scripts/build-sw.mjs – nicht von Hand bearbeiten.
const VERSION = 'ae38284e43';
const CACHE = 'unikram-' + VERSION;
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/core/audio.js",
  "js/core/charts.js",
  "js/core/confetti.js",
  "js/core/date.js",
  "js/core/format.js",
  "js/core/html.js",
  "js/core/icons.js",
  "js/core/morph.js",
  "js/core/router.js",
  "js/core/store.js",
  "js/core/ui.js",
  "js/core/undo.js",
  "js/core/util.js",
  "js/logic/budget.js",
  "js/logic/citation.js",
  "js/logic/demo.js",
  "js/logic/focus.js",
  "js/logic/grades.js",
  "js/logic/habits.js",
  "js/logic/ics.js",
  "js/logic/planner.js",
  "js/logic/split.js",
  "js/logic/srs.js",
  "js/logic/state.js",
  "js/logic/tasks.js",
  "js/logic/timetable.js",
  "js/palette.js",
  "js/services/notify.js",
  "js/services/reminders.js",
  "js/services/timer.js",
  "js/views/budget.js",
  "js/views/cards.js",
  "js/views/dashboard.js",
  "js/views/focus.js",
  "js/views/grades.js",
  "js/views/habits.js",
  "js/views/more.js",
  "js/views/onboarding.js",
  "js/views/planner.js",
  "js/views/settings.js",
  "js/views/study.js",
  "js/views/tasks.js",
  "js/views/tools/breathe.js",
  "js/views/tools/cite.js",
  "js/views/tools/gradekey.js",
  "js/views/tools/groups.js",
  "js/views/tools/talk.js",
  "js/views/tools/wheel.js",
  "js/views/tools/wordcount.js",
  "js/views/tools.js",
  "js/views/week.js",
  "js/views/wg.js",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "icons/maskable-512.png",
  "icons/maskable.svg"
];

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
