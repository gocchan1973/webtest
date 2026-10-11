import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { syncGlobal, resolveDefaultTarget, START_MARKER, END_MARKER } from './sync-global.mjs';

const TMP_ROOT = 'C:/Users/Owner/.codex/tmp';
const dirs = new Set();
test.afterEach(async () => {
  await Promise.all([...dirs].map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.clear();
});

async function fixture() {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'codex-update-sync-test-'));
  dirs.add(dir);
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'facts.json'), JSON.stringify([]), 'utf8');
  return dir;
}

test('syncGlobal inserts a dynamic loader with a verified snapshot fallback and preserves existing text', async () => {
  const dir = await fixture();
  const target = join(dir, 'AGENTS.md');
  await writeFile(target, '前置\n\n既存の指示\n', 'utf8');
  await syncGlobal({ dataDir: dir, targetPath: target, generated: '2026-09-10T12:34:56+09:00' });
  const text = await readFile(target, 'utf8');
  const portableDir = dir.replaceAll('\\', '/');
  assert.ok(text.startsWith('前置\n\n既存の指示\n'));
  assert.ok(text.includes(START_MARKER));
  assert.ok(text.includes(`node "${portableDir}/inject.mjs" --text`));
  assert.ok(text.includes('同一セッションで既に読んだ場合は重複実行しない'));
  assert.ok(text.includes('読むだけで使用実績を増やさない'));
  assert.ok(text.includes('取得失敗を「更新情報なし」と扱わない'));
  assert.ok(text.includes('完全な本文が返った場合はその出力を正とし'));
  assert.ok(text.includes('上限超過の退避メッセージが返った場合'));
  assert.ok(text.includes('スナップショットは無視する'));
  assert.ok(text.includes('この管理ブロック末尾の検証済みスナップショット'));
  assert.ok(text.includes('Codex / OpenAI 自身の更新（自動注入）'));
  assert.ok(text.includes(END_MARKER));
});

test('syncGlobal renders the snapshot date in Asia/Tokyo', async () => {
  const dir = await fixture();
  const target = join(dir, 'AGENTS.md');
  await syncGlobal({ dataDir: dir, targetPath: target, generated: '2026-09-10T15:30:00.000Z' });
  const text = await readFile(target, 'utf8');
  assert.ok(text.includes('生成: 2026-09-11'));
});

test('resolveDefaultTarget follows Codex precedence when AGENTS.override.md exists', async () => {
  const dir = await fixture();
  const home = join(dir, '.codex');
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'AGENTS.md'), 'base\n', 'utf8');
  await writeFile(join(home, 'AGENTS.override.md'), 'override\n', 'utf8');
  assert.equal(await resolveDefaultTarget(home), join(home, 'AGENTS.override.md'));
});

test('resolveDefaultTarget falls back to AGENTS.md when the override is empty', async () => {
  const dir = await fixture();
  const home = join(dir, '.codex');
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'AGENTS.override.md'), '  \n', 'utf8');
  assert.equal(await resolveDefaultTarget(home), join(home, 'AGENTS.md'));
});

test('syncGlobal replaces only the managed block and leaves prefix and suffix byte content intact', async () => {
  const dir = await fixture();
  const target = join(dir, 'AGENTS.md');
  const before = `prefix\r\n${START_MARKER}\r\nold\r\n${END_MARKER}\r\nsuffix\r\n`;
  await writeFile(target, before, 'utf8');
  await syncGlobal({ dataDir: dir, targetPath: target, generated: '2026-09-10T00:00:00Z' });
  const text = await readFile(target, 'utf8');
  assert.ok(text.startsWith(`prefix\r\n${START_MARKER}`));
  assert.ok(text.endsWith(`${END_MARKER}\r\nsuffix\r\n`));
  assert.equal((text.match(new RegExp(START_MARKER, 'g')) ?? []).length, 1);
  assert.equal((text.match(new RegExp(END_MARKER, 'g')) ?? []).length, 1);
  assert.ok(text.includes('新しいセッションの最初の実作業前に'));
  assert.equal(text.includes('\r\nold\r\n'), false);
});

test('syncGlobal rejects duplicate or mismatched markers without writing', async () => {
  const dir = await fixture();
  const duplicate = join(dir, 'duplicate.md');
  const duplicateText = `${START_MARKER}\nfirst\n${END_MARKER}\n${START_MARKER}\nsecond\n${END_MARKER}\n`;
  await writeFile(duplicate, duplicateText, 'utf8');
  await assert.rejects(() => syncGlobal({ dataDir: dir, targetPath: duplicate }), /duplicate/);
  assert.equal(await readFile(duplicate, 'utf8'), duplicateText);

  const mismatch = join(dir, 'mismatch.md');
  const mismatchText = `${START_MARKER}\nonly start\n`;
  await writeFile(mismatch, mismatchText, 'utf8');
  await assert.rejects(() => syncGlobal({ dataDir: dir, targetPath: mismatch }), /paired/);
  assert.equal(await readFile(mismatch, 'utf8'), mismatchText);

  const reversed = join(dir, 'reversed.md');
  const reversedText = `${END_MARKER}\nold\n${START_MARKER}\n`;
  await writeFile(reversed, reversedText, 'utf8');
  await assert.rejects(() => syncGlobal({ dataDir: dir, targetPath: reversed }), /order/);
  assert.equal(await readFile(reversed, 'utf8'), reversedText);
});

test('syncGlobal refuses a result over its reserved share of the combined instruction budget', async () => {
  const dir = await fixture();
  const target = join(dir, 'large.md');
  const original = 'x'.repeat(16360);
  await writeFile(target, original, 'utf8');
  await assert.rejects(() => syncGlobal({ dataDir: dir, targetPath: target }), /管理ブロック外 .*管理ブロック/);
  assert.equal(await readFile(target, 'utf8'), original);
});

test('syncGlobal refuses a path-only fallback when the full verified snapshot exceeds its budget', async () => {
  const dir = await fixture();
  const target = join(dir, 'AGENTS.md');
  const original = '既存\n';
  await writeFile(target, original, 'utf8');
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{
    id: 'large', fact: '大きい事実', behavior: 'x'.repeat(20000), scope: 'test',
    source: 'https://example.com/official', verified: '2026-09-10',
    discoveredIn: [], status: 'active', supersededBy: null,
  }]), 'utf8');
  await assert.rejects(() => syncGlobal({ dataDir: dir, targetPath: target }), /16 KiB/);
  assert.equal(await readFile(target, 'utf8'), original);
});
