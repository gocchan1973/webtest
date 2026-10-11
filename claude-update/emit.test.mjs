import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emit } from './emit.mjs';

test('emit writes both derived files from an empty install', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });

  const result = await emit(dir);

  assert.equal(result.factCount, 0);
  assert.ok((await readFile(join(dir, 'latest.md'), 'utf8')).includes('0 件'));
  assert.ok((await readFile(join(dir, 'index.html'), 'utf8')).startsWith('<!DOCTYPE html>'));
});

test('emit refuses to write when a fact fails validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{ id: 'x', fact: 'f', behavior: '', scope: 's', source: 'u', verified: '2026-09-10', status: 'active' }]), 'utf8');

  await assert.rejects(() => emit(dir), /behavior/);
});

test('emit counts active facts, hits and issues', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  const fact = { id: 'a', fact: 'f', behavior: 'b', scope: 's', source: 'u', verified: '2026-09-10', status: 'active', supersededBy: null };
  const gone = { ...fact, id: 'b', status: 'superseded', supersededBy: 'a' };
  await writeFile(join(dir, 'facts.json'), JSON.stringify([fact, gone]), 'utf8');
  await writeFile(join(dir, 'issues', '2026-09-06.json'), JSON.stringify([{ videoId: 'v', channel: 'c', title: 't', url: 'u', disposition: 'accepted', reason: 'r', facts: ['a'] }]), 'utf8');
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"a","effect":"changed","topic":"T","ts":"2026-09-11T00:00:00+09:00"}\n', 'utf8');

  const result = await emit(dir);

  assert.equal(result.factCount, 1);
  assert.equal(result.hitCount, 1);
  assert.equal(result.issueCount, 1);
});

test('emit leaves both derived files untouched when rendering fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'latest.md'), 'ORIGINAL', 'utf8');
  await writeFile(join(dir, 'index.html'), 'ORIGINAL', 'utf8');
  // 検証を通るが renderHtml だけが落ちる形。discoveredIn の検査が入ったので
  // ここは validate 段階で止まる。どちらの経路でも書かれないことを固定する。
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{ id: 'x', fact: 'f', behavior: 'b', scope: 's', source: 'u', verified: '2026-09-10', status: 'active', discoveredIn: {} }]), 'utf8');

  await assert.rejects(() => emit(dir));

  assert.equal(await readFile(join(dir, 'latest.md'), 'utf8'), 'ORIGINAL');
  assert.equal(await readFile(join(dir, 'index.html'), 'utf8'), 'ORIGINAL');
});
