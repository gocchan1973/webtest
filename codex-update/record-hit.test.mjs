import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, recordHit } from './record-hit.mjs';

const TMP_ROOT = 'C:/Users/Owner/.codex/tmp';
const dirs = new Set();
test.afterEach(async () => {
  await Promise.all([...dirs].map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.clear();
});

async function fixture() {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'codex-update-hit-test-'));
  dirs.add(dir);
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{ id: 'known-fact' }]), 'utf8');
  return dir;
}

test('recordHit appends one safe JSONL entry for a known fact', async () => {
  const dir = await fixture();
  const hitsPath = join(dir, 'hits.jsonl');
  const entry = await recordHit({ dataDir: dir, topic: '案件', item: 'known-fact', effect: 'changed', note: '判断を変更した\n改行もJSON内に保持' });
  assert.equal(entry.item, 'known-fact');
  const lines = (await readFile(hitsPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), entry);
});

test('recordHit rejects an unknown fact before writing', async () => {
  const dir = await fixture();
  const hitsPath = join(dir, 'hits.jsonl');
  await assert.rejects(() => recordHit({ dataDir: dir, hitsPath, topic: '案件', item: 'ghost', effect: 'changed' }), /unknown fact id/);
  await assert.rejects(() => readFile(hitsPath, 'utf8'), { code: 'ENOENT' });
});

test('recordHit rejects missing fields and an unknown effect', async () => {
  const dir = await fixture();
  const args = { dataDir: dir, hitsPath: join(dir, 'hits.jsonl'), topic: '案件', item: 'known-fact', effect: 'changed' };
  await assert.rejects(() => recordHit({ ...args, topic: '' }), /topic/);
  await assert.rejects(() => recordHit({ ...args, effect: 'maybe' }), /effect/);
});

test('recordHit starts a new JSONL row when the existing file has no trailing newline', async () => {
  const dir = await fixture();
  const hitsPath = join(dir, 'hits.jsonl');
  const first = '{"ts":"2026-09-09T00:00:00Z","topic":"前件","item":"known-fact","effect":"confirmed","note":""}';
  await writeFile(hitsPath, first, 'utf8');

  await recordHit({
    dataDir: dir,
    hitsPath,
    topic: '次件',
    item: 'known-fact',
    effect: 'changed',
    note: '別の一行として残す',
  });

  const lines = (await readFile(hitsPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).topic, '前件');
  assert.equal(JSON.parse(lines[1]).topic, '次件');
});

test('parseArgs accepts an option-looking note with equals syntax and keeps paths internal', () => {
  assert.deepEqual(parseArgs([
    '--topic', '案件', '--item', 'known-fact', '--effect', 'changed', '--note=--sync-global を使わない',
  ]), {
    topic: '案件', item: 'known-fact', effect: 'changed', note: '--sync-global を使わない',
  });
  assert.throws(() => parseArgs(['--data-dir', 'elsewhere']), /不明な引数/);
  assert.throws(() => parseArgs(['--hits-path', 'elsewhere']), /不明な引数/);
});
