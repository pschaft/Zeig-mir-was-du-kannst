import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeUnits, decodeUnits, fnv, docIds, splitJson, manifestFor, isPristine, MAX_CHARS, ITEMS_PER_CHUNK } from '../js/logic/syncformat.js';
import { defaultState } from '../js/logic/state.js';
import { buildDemo, applyDemo } from '../js/logic/demo.js';

function demoState() {
  const s = defaultState();
  applyDemo(s, '2026-11-13');
  s.profile.onboarded = true;
  return s;
}

const strip = (s) => { const { meta, ...rest } = s; return rest; };

test('Roundtrip: Demo-Zustand bleibt identisch', () => {
  const s = demoState();
  const back = decodeUnits(encodeUnits(s));
  assert.deepEqual(back, JSON.parse(JSON.stringify(strip(s))));
});

test('Roundtrip: leerer Standardzustand inkl. leerer Objekte', () => {
  const s = defaultState();
  const back = decodeUnits(encodeUnits(s));
  assert.deepEqual(back, JSON.parse(JSON.stringify(strip(s))));
  assert.deepEqual(back.plan.topics, {});
});

test('Große Arrays werden in Blöcke geteilt; Anhängen ändert nur den letzten Block', () => {
  const s = demoState();
  s.reviews = Array.from({ length: 1234 }, (_, i) => ({ cardId: 'k' + i, ts: 1e12 + i, rating: 3, prevState: 'review' }));
  const a = manifestFor(encodeUnits(s));
  const chunks = Object.keys(a).filter((k) => k.startsWith('reviews:'));
  assert.equal(chunks.length, Math.ceil(1234 / ITEMS_PER_CHUNK));
  s.reviews.push({ cardId: 'neu', ts: 2e12, rating: 1, prevState: 'new' });
  const b = manifestFor(encodeUnits(s));
  const changed = Object.keys(b).filter((k) => a[k]?.h !== b[k].h);
  assert.deepEqual(changed, ['reviews:12']);
});

test('Bearbeitete Aufgabe ändert nur ihre Einheit', () => {
  const s = demoState();
  const a = manifestFor(encodeUnits(s));
  s.tasks[2].done = true;
  const b = manifestFor(encodeUnits(s));
  assert.deepEqual(Object.keys(b).filter((k) => a[k]?.h !== b[k].h), ['tasks:0']);
});

test('Riesige Einheiten werden in Teile ≤ MAX_CHARS zerlegt', () => {
  const s = defaultState();
  s.tools.wordText = 'ä'.repeat(200000);
  const units = encodeUnits(s);
  const json = units.get('tools.wordText');
  const parts = splitJson(json);
  assert.ok(parts.length === 3 && parts.every((p) => p.length <= MAX_CHARS));
  assert.equal(parts.join(''), json);
  for (const p of parts) assert.ok(new TextEncoder().encode(JSON.stringify({ j: p })).length < 256 * 1024);
  assert.deepEqual(docIds('tools.wordText', 3), ['u_tools.wordText~0', 'u_tools.wordText~1', 'u_tools.wordText~2']);
  assert.deepEqual(docIds('tasks:0', 1), ['u_tasks:0']);
});

test('Fehlender Block wird erkannt', () => {
  const units = encodeUnits({ tasks: Array.from({ length: 250 }, (_, i) => ({ id: i })) });
  units.delete('tasks:1');
  assert.throws(() => decodeUnits(units), /fehlt/);
});

test('Dokument-IDs halten die Pfad-Grammatik ein', () => {
  const units = encodeUnits(demoState());
  for (const name of units.keys()) for (const id of docIds(name, 2)) assert.match(id, /^[A-Za-z0-9_.~:@+-]+$/);
});

test('Prüfsumme und Leer-Erkennung', () => {
  assert.notEqual(fnv('abc'), fnv('abd'));
  assert.equal(fnv('abc'), fnv('abc'));
  assert.equal(isPristine(defaultState()), true);
  assert.equal(isPristine(demoState()), false);
  assert.ok(buildDemo('2026-11-13').courses.length);
});
