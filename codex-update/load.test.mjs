import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadIssues, loadFacts, loadHits, validate } from './load.mjs';

const TMP_ROOT = 'C:/Users/Owner/.codex/tmp';
const dirs = new Set();
test.afterEach(async () => {
  await Promise.all([...dirs].map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.clear();
});

async function fixture() {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'codex-update-test-'));
  dirs.add(dir);
  await mkdir(join(dir, 'issues'), { recursive: true });
  return dir;
}

const FACT = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'Codex CLI v1〜', source: 'https://example.com/official',
  verified: '2026-09-10', discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }],
  status: 'active', supersededBy: null,
};

test('loadIssues reads issue files newest first', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'issues', '2026-09-06.json'), '[]', 'utf8');
  await writeFile(join(dir, 'issues', '2026-08-30.json'), '[]', 'utf8');
  assert.deepEqual((await loadIssues(dir)).map((i) => i.issue), ['2026-09-06', '2026-08-30']);
});

test('loadFacts and loadHits return empty on a fresh install', async () => {
  const dir = await fixture();
  assert.deepEqual(await loadFacts(dir), []);
  assert.deepEqual(await loadHits(dir), []);
});

test('loadHits rejects malformed jsonl instead of silently undercounting references', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"demo-fact"}\nnull\n[]\n{"item":"demo-fact","effect":"changed","topic":"T"}\nnot json\n', 'utf8');
  await assert.rejects(() => loadHits(dir), /hits\.jsonl 1 行目/);
});

test('validate accepts a well formed fact and hit effects', () => {
  assert.doesNotThrow(() => validate({
    issues: [], facts: [FACT],
    hits: [{ ts: '2026-09-10T00:00:00.000Z', item: FACT.id, effect: 'changed', topic: 'T', note: 'N' }],
  }));
});

test('validate rejects a fact without behavior or an official URL', () => {
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, behavior: '' }], hits: [] }), /behavior/);
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, source: 'javascript:alert(1)' }], hits: [] }), /source/);
});

test('validate rejects a superseded fact that names no successor', () => {
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, status: 'superseded' }], hits: [] }), /supersededBy/);
});

test('validate rejects duplicate ids and unknown successor ids', () => {
  assert.throws(() => validate({ issues: [], facts: [FACT, FACT], hits: [] }), /duplicate/);
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, supersededBy: 'ghost' }], hits: [] }), /supersededBy/);
});

test('validate rejects unknown dispositions, fact references, and hit effects', () => {
  const entry = { videoId: 'v1', channel: 'c', title: 't', url: 'https://youtu.be/v1', reason: 'r', facts: [] };
  assert.throws(() => validate({ issues: [{ issue: '2026-09-06', entries: [{ ...entry, disposition: 'maybe' }] }], facts: [], hits: [] }), /disposition/);
  assert.throws(() => validate({ issues: [{ issue: '2026-09-06', entries: [{ ...entry, disposition: 'accepted', facts: ['ghost'] }] }], facts: [], hits: [] }), /ghost/);
  assert.throws(() => validate({ issues: [], facts: [], hits: [{ item: 'x', effect: 'maybe' }] }), /effect/);
});

test('validate requires issue entries to retain their source fields', () => {
  assert.throws(() => validate({
    issues: [{ issue: '2026-09-06', entries: [{ disposition: 'accepted', reason: 'r', facts: [] }] }],
    facts: [], hits: [],
  }), /videoId/);
});

test('validate rejects a fact whose discoveredIn is not an array', () => {
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, discoveredIn: {} }], hits: [] }), /discoveredIn/);
});

test('validate requires every discoveredIn entry to retain its issue', () => {
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, discoveredIn: ['2026-09-06'] }], hits: [] }), /discoveredIn/);
  assert.throws(() => validate({ issues: [], facts: [{ ...FACT, discoveredIn: [{}] }], hits: [] }), /discoveredIn.*issue/);
});

test('validate rejects managed block markers in injected fact text', () => {
  assert.throws(() => validate({
    issues: [], facts: [{ ...FACT, behavior: '前半\n<!-- codex-update:end -->\n後半' }], hits: [],
  }), /管理マーカー/);
});

test('loadHits requires a parseable timestamp', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"demo-fact","effect":"changed","topic":"T"}\n', 'utf8');
  await assert.rejects(() => loadHits(dir), /ts/);
});
