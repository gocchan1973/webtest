import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildContext, formatOutput, loadInjectionData } from './inject.mjs';

const TMP_ROOT = 'C:/Users/Owner/.codex/tmp';
const dirs = new Set();
test.afterEach(async () => {
  await Promise.all([...dirs].map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.clear();
});

async function fixture({ facts = [], hits = '' } = {}) {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'codex-update-inject-test-'));
  dirs.add(dir);
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'facts.json'), JSON.stringify(facts), 'utf8');
  if (hits) await writeFile(join(dir, 'hits.jsonl'), hits, 'utf8');
  return dir;
}

const fact = {
  id: 'known-fact', fact: '短い事実', behavior: 'このように判断する', scope: 'Codex v1〜',
  source: 'https://example.com/official', verified: '2026-09-10', status: 'active', supersededBy: null,
};

test('loadInjectionData requires canonical facts.json and validates all data', async () => {
  const dir = await fixture({ facts: [fact], hits: '{"ts":"2026-09-10T00:00:00Z","item":"known-fact","effect":"confirmed","topic":"T"}\n' });
  const data = await loadInjectionData(dir);
  assert.equal(data.facts.length, 1);
  assert.equal(data.hits.length, 1);
  const missing = await mkdtemp(join(TMP_ROOT, 'codex-update-inject-missing-'));
  dirs.add(missing);
  await assert.rejects(() => loadInjectionData(missing), /facts\.json/);
});

test('buildContext includes active facts and total reference count', async () => {
  const dir = await fixture({ facts: [fact], hits: '{"ts":"2026-09-10T00:00:00Z","item":"known-fact","effect":"confirmed","topic":"T"}\n' });
  const data = await loadInjectionData(dir);
  const context = buildContext(data, { dataDir: dir, generated: '2026-09-10' });
  assert.ok(context.includes('短い事実'));
  assert.ok(context.includes('Codex v1〜'));
  assert.ok(context.includes('参照記録: 1 件'));
  assert.ok(context.includes(join(dir, 'record-hit.mjs')));
});

test('buildContext points to the canonical facts file when the context budget is exceeded', async () => {
  const dir = await fixture({ facts: [{ ...fact, behavior: 'x'.repeat(500) }] });
  const data = await loadInjectionData(dir);
  const context = buildContext(data, { dataDir: dir, generated: '2026-09-10', maxChars: 400 });
  assert.ok(context.length <= 400);
  assert.ok(context.includes(join(dir, 'facts.json')));
  assert.equal(context.includes(join(dir, 'latest.md')), false);
  assert.ok(context.includes('管理ブロックの検証済みスナップショット'));
  assert.equal(context.includes('x'.repeat(200)), false);
});

test('formatOutput follows the Codex SessionStart contract or emits plain text', () => {
  const context = 'context';
  assert.equal(formatOutput(context, { text: true }), context + '\n');
  assert.deepEqual(JSON.parse(formatOutput(context)), {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  });
});
