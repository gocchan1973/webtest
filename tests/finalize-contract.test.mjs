// self-update-check の finalize.mjs（F:/Dev_hub/skills/claude/self-update-check/scripts/finalize.mjs）が
// このリポに依存している契約を守るテスト。依存の一覧は docs/自己更新チェックからの申し送り_2026-10-06.md の第2節。
// ここが落ちたら、build.mjs / emit-recheck.mjs の変更が finalize.mjs を壊す。直すのは次のどちらか:
//   (a) 変更を戻す  (b) スキル側の finalize.mjs を新しい仕様に合わせる（Dev_hub 側に変更が要る）
// 実行: node --test tests/finalize-contract.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { recheckRadar, validateRecheck } = await import('../build.mjs');

const labels = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
const item = (title) => ({
  status: '改善提案', title, harness: ['C:/x/y.py'],
  fields: labels.map((l) => [l, 'テスト']), links: [['公式一次情報', 'https://example.com']],
});

// finalize.mjs の照合（3)）と同じ判定。複製であることに注意: finalize.mjs 側を直したらここも直す。
function finalizeCheck(md, issue, items) {
  const head = md.match(/対象号:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  if (head !== issue) return `対象号が ${head}`;
  if (items.length === 0) return md.includes('更新なし') ? null : '「更新なし」が無い';
  const missing = items.filter((it) => !md.includes(it.title)).map((it) => it.title);
  return missing.length ? `見出しが出ていない: ${missing}` : null;
}

async function emit(items, issue) {
  const dir = await mkdtemp(path.join(tmpdir(), 'finalize-contract-'));
  try {
    // 段階1以降、emit-recheck.mjs は recheck/<号>.json を recheck-lib.mjs（→ sources.mjs）経由で読む。
    for (const f of ['emit-recheck.mjs', 'recheck-lib.mjs', 'sources.mjs']) await copyFile(path.join(repo, f), path.join(dir, f));
    await mkdir(path.join(dir, 'recheck'));
    await writeFile(path.join(dir, 'recheck', `${issue}.json`), JSON.stringify(items), 'utf8');
    // 号 HTML は「号が存在する」ことの印としてだけ読まれる（中身は読まない）。
    const html = `<html>${recheckRadar(validateRecheck(items, `${issue}.json`, issue), issue)}<!-- work-relevance --></html>`;
    await writeFile(path.join(dir, `${issue}.html`), html, 'utf8');
    // emit-recheck.mjs は末尾で隣の emit-work-reverse-index.mjs を import する。ここには無いので exit 非0 になるが、
    // latest-recheck.md はその前に書かれる。実リポの派生物を書き換えないよう、複製して一時ディレクトリで走らせる。
    spawnSync(process.execPath, ['emit-recheck.mjs'], { cwd: dir, encoding: 'utf8' });
    return await readFile(path.join(dir, 'latest-recheck.md'), 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('build.mjs を新しいプロセスで import でき、finalize.mjs が使う export がある', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "const m = await import('./build.mjs'); console.log(typeof m.validateRecheck, typeof m.recheckRadar)"], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'function function');
});

test('build.mjs の import は buildSite を走らせず、生成物を書き換えない', async () => {
  const targets = (await readdir(repo)).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .concat(['index.html', 'latest-recheck.md', 'knowledge/article-links.json', 'work-index.md']);
  const digest = async () => Object.fromEntries(await Promise.all(targets.map(async (f) => {
    const body = await readFile(path.join(repo, f)).catch(() => null);
    return [f, body && createHash('sha256').update(body).digest('hex')];
  })));
  const before = await digest();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./build.mjs')"], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(await digest(), before);
});

test('2件目以降が不正でも検証は失敗する（import 時の全件検証と同じ関数）', () => {
  const bad = { ...item('b'), fields: item('b').fields.slice(1) };
  assert.throws(() => validateRecheck([item('a'), bad], '2099-01-03.json', '2099-01-03'), /fields のラベル/);
});

test('emit-recheck の出力は、提案ありの号で finalize の照合を通る', async () => {
  const items = [item('テスト提案その1'), item('テスト提案その2')];
  assert.equal(finalizeCheck(await emit(items, '2099-01-03'), '2099-01-03', items), null);
});

test('emit-recheck の出力は、0件の号（更新なし）で finalize の照合を通る', async () => {
  assert.equal(finalizeCheck(await emit([], '2099-01-03'), '2099-01-03', []), null);
});

test('照合は壊れた出力を落とす（テストが空振りしていない確認）', () => {
  assert.notEqual(finalizeCheck('対象号: 2099-01-02\n', '2099-01-03', [item('x')]), null);
  assert.notEqual(finalizeCheck('対象号: 2099-01-03\n', '2099-01-03', [item('x')]), null);
  assert.notEqual(finalizeCheck('対象号: 2099-01-03\n', '2099-01-03', []), null);
});
