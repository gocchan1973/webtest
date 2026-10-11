import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { emit, parseCliArgs } from './emit.mjs';

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
  await writeFile(join(dir, 'facts.json'), '[]', 'utf8');
  return dir;
}

test('emit writes markdown, overview and article files from an empty install', async () => {
  const dir = await fixture();
  const result = await emit(dir);
  assert.equal(result.factCount, 0);
  assert.ok((await readFile(join(dir, 'latest.md'), 'utf8')).includes('0 件'));
  assert.ok((await readFile(join(dir, 'index.html'), 'utf8')).startsWith('<!DOCTYPE html>'));
  assert.ok((await readFile(join(dir, 'index.html'), 'utf8')).includes('articles/facts.html'));
  assert.ok((await readFile(join(dir, 'articles', 'facts.html'), 'utf8')).includes('../index.html'));
});

test('emit refuses invalid facts without replacing existing derived files', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'latest.md'), 'ORIGINAL', 'utf8');
  await writeFile(join(dir, 'index.html'), 'ORIGINAL', 'utf8');
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{ id: 'x', fact: 'f', behavior: '', scope: 's', source: 'https://example.com', verified: '2026-09-10', status: 'active' }]), 'utf8');
  await assert.rejects(() => emit(dir), /behavior/);
  assert.equal(await readFile(join(dir, 'latest.md'), 'utf8'), 'ORIGINAL');
  assert.equal(await readFile(join(dir, 'index.html'), 'utf8'), 'ORIGINAL');
});

test('emit refuses a missing canonical facts file without replacing derived files', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'latest.md'), 'ORIGINAL', 'utf8');
  await writeFile(join(dir, 'index.html'), 'ORIGINAL', 'utf8');
  await rm(join(dir, 'facts.json'));

  await assert.rejects(() => emit(dir), /facts\.json/);
  assert.equal(await readFile(join(dir, 'latest.md'), 'utf8'), 'ORIGINAL');
  assert.equal(await readFile(join(dir, 'index.html'), 'utf8'), 'ORIGINAL');
});

test('emit counts active facts, hits and issues', async () => {
  const dir = await fixture();
  const fact = { id: 'a', fact: 'f', behavior: 'b', scope: 's', source: 'https://example.com', verified: '2026-09-10', status: 'active', supersededBy: null };
  const gone = { ...fact, id: 'b', status: 'superseded', supersededBy: 'a' };
  await writeFile(join(dir, 'facts.json'), JSON.stringify([fact, gone]), 'utf8');
  await writeFile(join(dir, 'issues', '2026-09-06.json'), JSON.stringify([{ videoId: 'v', channel: 'c', title: 't', url: 'https://youtu.be/v', disposition: 'accepted', reason: 'r', facts: ['a'] }]), 'utf8');
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"a","effect":"changed","topic":"T","ts":"2026-09-11T00:00:00+09:00"}\n', 'utf8');
  const result = await emit(dir);
  assert.deepEqual(result, { factCount: 1, hitCount: 1, issueCount: 1 });
  const index = await readFile(join(dir, 'index.html'), 'utf8');
  assert.ok(index.includes('articles/2026-09-06.html'));
  assert.ok((await readFile(join(dir, 'articles', '2026-09-06.html'), 'utf8')).includes('https://youtu.be/v'));
});

test('parseCliArgs rejects --target unless global sync is requested', () => {
  assert.throws(() => parseCliArgs(['--target', 'some-AGENTS.md']), /--sync-global/);
  assert.deepEqual(parseCliArgs(['--sync-global', '--target', 'some-AGENTS.md']), {
    sync: true,
    targetPath: 'some-AGENTS.md',
  });
});
