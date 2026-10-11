import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadIssues, loadFacts, loadHits, validate } from './load.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  return dir;
}

const FACT = {
  id: 'demo-fact',
  fact: 'デモの事実',
  behavior: 'デモのときはこうする',
  scope: 'デモ v1〜',
  source: 'https://example.com/official',
  verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }],
  status: 'active',
  supersededBy: null,
};

test('loadIssues reads issue files newest first', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'issues', '2026-09-06.json'), JSON.stringify([]), 'utf8');
  await writeFile(join(dir, 'issues', '2026-08-30.json'), JSON.stringify([]), 'utf8');

  const issues = await loadIssues(dir);
  assert.deepEqual(issues.map((i) => i.issue), ['2026-09-06', '2026-08-30']);
});

test('loadFacts and loadHits return empty on a fresh install', async () => {
  const dir = await fixture();
  assert.deepEqual(await loadFacts(dir), []);
  assert.deepEqual(await loadHits(dir), []);
});

test('loadHits skips malformed jsonl lines without stopping', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"demo-fact"}\nnot json\n\n', 'utf8');
  assert.deepEqual(await loadHits(dir), [{ item: 'demo-fact' }]);
});

test('validate accepts a well formed fact', () => {
  assert.doesNotThrow(() => validate({ issues: [], facts: [FACT], hits: [] }));
});

test('validate rejects an active fact without a behaviour', () => {
  const facts = [{ ...FACT, behavior: '' }];
  assert.throws(() => validate({ issues: [], facts, hits: [] }), /behavior/);
});

test('validate rejects a superseded fact that names no successor', () => {
  const facts = [{ ...FACT, status: 'superseded' }];
  assert.throws(() => validate({ issues: [], facts, hits: [] }), /supersededBy/);
});

test('validate rejects duplicate fact ids', () => {
  assert.throws(() => validate({ issues: [], facts: [FACT, FACT], hits: [] }), /duplicate/);
});

test('validate rejects an unknown disposition', () => {
  const issues = [{ issue: '2026-09-06', entries: [{ videoId: 'v1', channel: 'c', title: 't', url: 'u', disposition: 'maybe', reason: 'r', facts: [] }] }];
  assert.throws(() => validate({ issues, facts: [], hits: [] }), /disposition/);
});

test('validate rejects an entry that references an unknown fact id', () => {
  const issues = [{ issue: '2026-09-06', entries: [{ videoId: 'v1', channel: 'c', title: 't', url: 'u', disposition: 'accepted', reason: 'r', facts: ['ghost'] }] }];
  assert.throws(() => validate({ issues, facts: [], hits: [] }), /ghost/);
});

test('validate rejects a fact whose discoveredIn is not an array', () => {
  const facts = [{ ...FACT, discoveredIn: {} }];
  assert.throws(() => validate({ issues: [], facts, hits: [] }), /discoveredIn/);
});

test('validate allows a fact with no discoveredIn at all', () => {
  const { discoveredIn, ...withoutOrigin } = FACT;
  assert.doesNotThrow(() => validate({ issues: [], facts: [withoutOrigin], hits: [] }));
});
