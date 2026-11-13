// End-to-End-Test der wichtigsten Abläufe im echten Browser (Playwright/Chromium).
// Voraussetzung: lokaler Server auf :8080 (python3 -m http.server 8080) und Playwright installiert.
// Aufruf: node tests/e2e/app.e2e.cjs [basis-url]
const { chromium, devices } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8080/';
const results = [];
const errors = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(['✓', name]);
  } catch (e) {
    results.push(['✗', name, e.message.split('\n')[0]]);
  }
}

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Lineare Algebra (V)
DTSTART:20261110T081500
DTEND:20261110T094500
RRULE:FREQ=WEEKLY;UNTIL=20270205T000000Z
LOCATION:HS 5
END:VEVENT
BEGIN:VEVENT
SUMMARY:Klausur Lineare Algebra
DTSTART:20270301T100000
DTEND:20270301T120000
LOCATION:Audimax
END:VEVENT
END:VCALENDAR`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'de-DE', timezoneId: 'Europe/Berlin', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const go = async (h) => { await page.evaluate((x) => { location.hash = '#/' + x; }, h); await page.waitForTimeout(500); };
  const state = () => page.evaluate(() => window.unikram.store.state);
  const submitSheet = async () => { await page.click('dialog[open] button[type=submit]'); await page.waitForTimeout(350); };

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await step('Onboarding leer starten', async () => {
    await page.fill('#ob-name', 'Testi');
    await page.click('form[data-submit=ob-name] button[type=submit]');
    await page.click('[data-action=ob-sem][data-i="0"]');
    await page.click('[data-action=ob-finish][data-demo="0"]');
    await page.waitForTimeout(600);
    const s = await state();
    assert.equal(s.profile.onboarded, true);
    assert.equal(s.profile.name, 'Testi');
    assert.ok(s.semester.lectureStart);
    assert.ok((await page.textContent('h1')).includes('Testi'));
  });

  await step('Kurs + Veranstaltung anlegen', async () => {
    await go('woche');
    await page.click('[data-action=new-session] >> nth=0');
    await page.selectOption('dialog[open] select[name=courseId]', '__new');
    await page.fill('dialog[open] input[name=newCourse]', 'Analysis I');
    await page.click('dialog[open] input[name=weekday][value="2"] >> xpath=..');
    await page.fill('dialog[open] input[name=start]', '10:15');
    await page.fill('dialog[open] input[name=end]', '11:45');
    await page.fill('dialog[open] input[name=room]', 'HS 1');
    await submitSheet();
    const s = await state();
    assert.equal(s.courses.length, 1);
    assert.equal(s.courses[0].short, 'AI');
    assert.equal(s.sessions[0].weekday, 2);
  });

  await step('ICS-Import erkennt Vorlesung + Klausur', async () => {
    const f = path.join(os.tmpdir(), 'unikram-test.ics');
    fs.writeFileSync(f, ICS);
    await go('woche');
    await page.click('[data-action=week-more]');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      page.click('dialog[open] .menu-item >> nth=0'),
    ]);
    await chooser.setFiles(f);
    await page.waitForSelector('dialog[open] [data-import]');
    await page.click('dialog[open] [data-import]');
    await page.waitForTimeout(400);
    const s = await state();
    assert.ok(s.courses.some((c) => c.name === 'Lineare Algebra'), 'Kurs');
    assert.ok(s.events.some((e) => e.kind === 'exam' && e.title.includes('Lineare Algebra')), 'Klausur');
  });

  await step('Aufgabe per Spracheingabe', async () => {
    await go('aufgaben');
    await page.fill('input[name=qa]', 'Übungsblatt 1 #ana morgen 10 Uhr !');
    await page.waitForTimeout(150);
    const chips = await page.locator('[data-qa-preview] .badge').count();
    assert.ok(chips >= 3, `Vorschau-Chips: ${chips}`);
    await page.press('input[name=qa]', 'Enter');
    await page.waitForTimeout(300);
    const t = (await state()).tasks[0];
    assert.equal(t.title, 'Übungsblatt 1');
    assert.equal(t.dueTime, '10:00');
    assert.equal(t.priority, 1);
    assert.ok(t.courseId);
  });

  await step('Aufgabe abhaken + rückgängig', async () => {
    await page.click('[data-action=toggle-task] >> nth=0');
    await page.waitForTimeout(200);
    assert.equal((await state()).tasks[0].done, true);
    await page.click('.toast-action');
    await page.waitForTimeout(200);
    assert.equal((await state()).tasks[0].done, false);
  });

  await step('Ausgabe eintragen (12,50 €)', async () => {
    await go('budget');
    await page.click('[data-action=new-expense] >> nth=0');
    await page.fill('dialog[open] input[name=amount]', '12,50');
    await page.click('dialog[open] input[name=catExpense][value=mensa] >> xpath=..');
    await page.fill('dialog[open] input[name=note]', 'Mensa');
    await submitSheet();
    const s = await state();
    assert.equal(s.budget.transactions.length, 1);
    assert.equal(s.budget.transactions[0].amount, 1250);
    assert.equal(s.budget.transactions[0].categoryId, 'mensa');
  });

  await step('Karteikarten: Stapel, Import, Lernsession', async () => {
    await go('lernen');
    await page.click('[data-action=new-deck] >> nth=0');
    await page.fill('dialog[open] input[name=name]', 'Vokabeln');
    await submitSheet();
    const deckId = (await state()).decks[0].id;
    await go(`lernen/${deckId}`);
    await page.click('[data-action=bulk] >> nth=0');
    await page.fill('dialog[open] textarea[name=text]', 'house ; Haus\ntree ; Baum\ncar ; Auto');
    await submitSheet();
    assert.equal((await state()).cards.length, 3);
    await go(`lernen/${deckId}/session`);
    await page.click('[data-action=flip] >> nth=0');
    await page.waitForSelector('.rate-btn');
    await page.click('.rate-btn.good');
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    await page.waitForTimeout(150);
    const s = await state();
    assert.equal(s.reviews.length, 2);
    assert.equal(s.cards.filter((c) => c.srs.state === 'review').length, 1);
    assert.equal(s.cards.filter((c) => c.srs.state === 'learning').length, 1);
  });

  await step('Fokus-Timer starten, pausieren, überspringen', async () => {
    await go('fokus');
    await page.click('[data-action=toggle]');
    await page.waitForTimeout(1300);
    let s = await state();
    assert.equal(s.focus.timer.status, 'running');
    assert.match(await page.title(), /⏳/);
    await page.click('[data-action=toggle]');
    s = await state();
    assert.equal(s.focus.timer.status, 'paused');
    // Zeit vorspulen: Restzeit manipulieren und Phase überspringen
    await page.evaluate(() => window.unikram.store.update((st) => { st.focus.timer.remaining = 5 * 60000; }));
    await page.click('[data-action=skip]');
    await page.waitForTimeout(300);
    s = await state();
    assert.equal(s.focus.sessions.length, 1);
    assert.equal(s.focus.sessions[0].minutes, 20);
    assert.equal(s.focus.timer.mode, 'short');
  });

  await step('Note eintragen → Schnitt', async () => {
    await go('noten');
    await page.click('[data-action=new-module] >> nth=0');
    await page.fill('dialog[open] input[name=name]', 'Mathe 1');
    await page.fill('dialog[open] input[name=ects]', '8');
    await page.click('dialog[open] input[name=grade][value="1.7"] >> xpath=..');
    await submitSheet();
    assert.match(await page.textContent('.big-grade'), /1,70/);
  });

  await step('WG: Gruppe, Ausgabe, Ausgleich', async () => {
    await go('wg');
    await page.click('[data-action=new-group] >> nth=0');
    await page.fill('dialog[open] input[name=name]', 'Test-WG');
    await page.fill('dialog[open] textarea[name=others]', 'Lena\nJonas');
    await submitSheet();
    await page.click('[data-action=new-gexp] >> nth=0');
    await page.fill('dialog[open] input[name=title]', 'Einkauf');
    await page.fill('dialog[open] input[name=amount]', '30');
    await submitSheet();
    let g = (await state()).groups[0];
    assert.equal(g.expenses.length, 1);
    await page.click('[data-action=settle] >> nth=0');
    await submitSheet();
    await page.click('[data-action=settle] >> nth=0');
    await submitSheet();
    g = (await state()).groups[0];
    assert.equal(g.expenses.length, 3);
    assert.ok(await page.locator('text=Niemand schuldet niemandem etwas').count());
  });

  await step('Gewohnheit anlegen + abhaken', async () => {
    await go('gewohnheiten');
    await page.click('[data-action=new-habit] >> nth=0');
    await page.click('dialog[open] [data-suggest] button >> nth=0');
    await submitSheet();
    await page.click('.habit-toggle >> nth=0');
    await page.waitForTimeout(200);
    const h = (await state()).habits[0];
    assert.equal(Object.keys(h.log).length, 1);
  });

  await step('Lernplan: Themen → Plan', async () => {
    await go('lernplan');
    await page.click('[data-action=topics] >> nth=0');
    await page.fill('dialog[open] textarea[name=topics]', 'Vektorräume; 3\nMatrizen; 4\nEigenwerte');
    await submitSheet();
    await page.waitForTimeout(300);
    const s = await state();
    assert.ok(s.plan.blocks.length > 5, `Blöcke: ${s.plan.blocks.length}`);
    assert.ok(await page.locator('.block').count() > 0);
  });

  await step('Werkzeuge: Wortzähler, Notenschlüssel, Glücksrad', async () => {
    await go('werkzeuge/wortzaehler');
    await page.fill('[data-input=wc-input]', 'Das ist eigentlich ein kurzer Test. Und noch ein Satz!');
    await page.waitForTimeout(150);
    assert.match(await page.textContent('[data-wc-stats] .stat-value'), /^10$/);
    await go('werkzeuge/notenschluessel');
    await page.fill('#gk-got', '57');
    await page.waitForTimeout(150);
    assert.match(await page.textContent('.grade-pill'), /1,0/);
    await go('werkzeuge/gluecksrad');
    await page.click('[data-action=wheel-spin]');
    await page.waitForTimeout(4700);
    assert.match(await page.textContent('.wheel-result'), /🎉/);
  });

  await step('Command Palette navigiert', async () => {
    await go('heute');
    await page.keyboard.press('Control+k');
    await page.fill('.palette-input', 'Budget');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    assert.match(page.url(), /#\/budget/);
  });

  await step('Dunkelmodus', async () => {
    await go('einstellungen');
    await page.click('[data-action=theme][data-t=dark]');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  });

  await step('Backup-Export liefert gültiges JSON', async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.click('[data-action=backup] >> nth=-1', { timeout: 5000 }),
    ]);
    const file = await dl.path();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.profile.name, 'Testi');
    assert.ok(data.tasks.length >= 1);
  });

  await step('Daten überleben Neuladen', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const s = await state();
    assert.ok(s.tasks.length >= 1 && s.cards.length === 3 && s.groups.length === 1);
  });

  await step('Beispieldaten laden', async () => {
    await go('einstellungen');
    await page.click('[data-action=demo]');
    await submitSheet();
    await page.waitForTimeout(500);
    const s = await state();
    assert.ok(s.courses.length >= 6 && s.cards.length > 20 && s.meta.demo);
  });

  console.log(results.map((r) => r.join(' ')).join('\n'));
  if (errors.length) console.log('\nBrowser-Fehler:\n' + errors.join('\n'));
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - failed}/${results.length} Schritte erfolgreich`);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
