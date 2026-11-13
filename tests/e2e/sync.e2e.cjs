// Simuliert die eingebettete Version mit einer nachgebauten Plattform-Schnittstelle
// (db/user/downloads) und zwei Geräten, die sich einen Speicher teilen.
// Voraussetzung: npm run build; Server auf :8081, der dist/ ausliefert:
//   python3 -m http.server 8081 --directory dist   → dann: node tests/e2e/sync.e2e.cjs
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', '..', 'dist');
const skeleton = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}</style></head><body>${fs.readFileSync(path.join(dist, 'artifact.html'), 'utf8')}</body></html>`;
fs.writeFileSync(path.join(dist, 'artifact-test.html'), skeleton);

const docs = new Map();
const writes = [];
const results = [];
const errors = [];

const fakePlatform = () => {
  const snap = (id, d) => ({ id, exists: d != null, data: () => (d == null ? undefined : JSON.parse(JSON.stringify(d))), metadata: { fromCache: false, hasPendingWrites: false } });
  const ref = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => { if (window.__offline) throw { code: 'unavailable', message: 'offline' }; return snap(p.split('/').pop(), await window.__dbGet(p)); },
    set: async (data) => { if (window.__offline) throw { code: 'unavailable', message: 'offline' }; if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument', message: 'zu groß' }; await window.__dbSet(p, data); },
    update: async (data) => { const cur = await window.__dbGet(p); if (!cur) throw { code: 'invalid_argument' }; await window.__dbSet(p, { ...cur, ...data }); },
    delete: async () => window.__dbDel(p),
    onSnapshot: (next) => {
      let last = null, stop = false;
      const tick = async () => {
        if (stop) return;
        if (window.__offline) { setTimeout(tick, 300); return; }
        const d = await window.__dbGet(p);
        const s = JSON.stringify(d);
        if (s !== last) { last = s; next(snap(p.split('/').pop(), d)); }
        setTimeout(tick, 300);
      };
      setTimeout(tick, 50);
      return () => { stop = true; };
    },
  });
  const caps = {
    db: { doc: ref, collection: () => { throw new Error('nicht benötigt'); } },
    user: { id: async () => 'viewer-1', isOwner: async () => true, canEdit: async () => true, can: async () => true },
    downloads: { save: async ({ filename, data }) => { window.__lastSave = { filename, size: String(data).length }; return { status: 'saved' }; } },
  };
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(caps[name] ?? null), 30)) };
};

async function device(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await ctx.exposeFunction('__dbGet', (p) => docs.get(p) ?? null);
  await ctx.exposeFunction('__dbSet', (p, d) => { docs.set(p, d); writes.push(`${name}:${p}`); });
  await ctx.exposeFunction('__dbDel', (p) => { docs.delete(p); });
  await ctx.addInitScript(fakePlatform);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto('http://127.0.0.1:8081/artifact-test.html');
  await page.waitForTimeout(600);
  return page;
}

async function step(name, fn) {
  try { await fn(); results.push(`✓ ${name}`); } catch (e) { results.push(`✗ ${name}: ${e.message.split('\n')[0]}`); }
}

const state = (p) => p.evaluate(() => window.unikram.store.state);
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('Zeitüberschreitung');
};

(async () => {
  const browser = await chromium.launch();
  const A = await device(browser, 'A');

  await step('A: eingebettet, Speicher-Routing, Onboarding mit Demo', async () => {
    assert.ok(await A.evaluate(() => document.documentElement.classList.contains('embed')));
    await A.fill('#ob-name', 'Sam');
    await A.click('form[data-submit=ob-name] button[type=submit]');
    await A.click('[data-action=ob-sem][data-i="0"]');
    await A.click('[data-action=ob-finish][data-demo="1"]');
    await A.waitForTimeout(400);
    assert.equal(A.url().includes('#/'), false, 'Adresse bleibt unverändert');
    await A.click('.tab[href="#/woche"]');
    await A.waitForTimeout(300);
    assert.equal((await A.textContent('h1')).trim(), 'Woche');
  });

  await step('A: Daten landen im privaten Bereich (Teile < 256 KiB)', async () => {
    await waitFor(() => docs.has('data/users/viewer-1/manifest'));
    const m = docs.get('data/users/viewer-1/manifest');
    assert.ok(Object.keys(m.units).length > 30);
    for (const [p, d] of docs) assert.ok(JSON.stringify(d).length < 256 * 1024, p);
    assert.ok([...docs.keys()].every((p) => p.startsWith('data/users/viewer-1/')));
  });

  const B = await device(browser, 'B');
  await step('B: frisches Gerät übernimmt automatisch die Konto-Daten', async () => {
    await waitFor(async () => (await state(B)).courses.length === 6);
    const s = await state(B);
    assert.equal(s.profile.name, 'Sam');
    await B.waitForTimeout(300);
    assert.match(await B.textContent('h1'), /Sam/);
  });

  await step('B → A: neue Aufgabe erscheint live auf dem anderen Gerät', async () => {
    await B.click('.tab[href="#/aufgaben"]');
    await B.waitForTimeout(300);
    await B.fill('input[name=qa]', 'Sync-Test morgen');
    await B.press('input[name=qa]', 'Enter');
    await waitFor(async () => (await state(A)).tasks.some((t) => t.title === 'Sync-Test'), 10000);
  });

  await step('Nur geänderte Teile werden geschrieben', async () => {
    writes.length = 0;
    await A.evaluate(() => window.unikram.store.update((s) => { s.tasks[0].title = 'Geändert'; }));
    await waitFor(() => writes.some((w) => w.endsWith('/manifest')), 8000);
    const unitWrites = writes.filter((w) => !w.endsWith('/manifest'));
    assert.deepEqual(unitWrites, ['A:data/users/viewer-1/u_tasks:0']);
  });

  await step('Konflikt: beide Geräte ändern offline → Auswahl-Dialog', async () => {
    // B sieht A's Änderung, dann ändern beide "gleichzeitig"
    await waitFor(async () => (await state(B)).tasks[0].title === 'Geändert', 8000);
    await B.evaluate(() => { window.__offline = true; });
    // B ändert offline, A ändert online und synchronisiert
    await B.evaluate(() => window.unikram.store.update((s) => { s.profile.uni = 'Uni B'; }));
    await A.evaluate(() => window.unikram.store.update((s) => { s.profile.uni = 'Uni A'; }));
    await waitFor(() => docs.get('data/users/viewer-1/u_profile.uni')?.j === '"Uni A"', 10000);
    await B.evaluate(() => { window.__offline = false; });
    await waitFor(async () => !!(await B.$('dialog[open] [data-pick]')), 12000);
    await B.click('dialog[open] [data-pick="remote"]');
    await waitFor(async () => (await state(B)).profile.uni === 'Uni A', 8000);
  });

  await step('Backup über downloads-Fähigkeit', async () => {
    await A.evaluate(() => window.unikram.navigate('einstellungen'));
    await A.waitForTimeout(400);
    await A.click('[data-action=backup] >> nth=-1');
    await waitFor(() => A.evaluate(() => !!window.__lastSave));
    const saved = await A.evaluate(() => window.__lastSave);
    assert.match(saved.filename, /^unikram-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  await step('Viewer-Theme (data-theme) wird bei „System“ respektiert', async () => {
    await A.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await A.waitForTimeout(100);
    assert.equal(await A.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await A.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await A.waitForTimeout(100);
    assert.equal(await A.evaluate(() => document.documentElement.classList.contains('dark')), false);
  });

  console.log(results.join('\n'));
  if (errors.length) console.log('\nFehler:\n' + errors.join('\n'));
  await browser.close();
  fs.unlinkSync(path.join(dist, 'artifact-test.html'));
  process.exit(results.some((r) => r.startsWith('✗')) || errors.length ? 1 : 0);
})();
