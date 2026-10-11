import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { loadAgentRecheck, loadRecheckByIssue } from '../recheck-lib.mjs';

// 段階3: recheck/<agent>/<号>.json。他エージェントの不正は警告＋除外＋確認失敗の記録。Claude 本体の不正は従来どおり throw。
const labels = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
const item = (extra = {}) => ({
  status: '改善提案',
  title: 'Codex 側の提案',
  harness: ['~/.codex/AGENTS.md'],
  fields: labels.map((label) => [label, `${label}の内容`]),
  links: [['公式一次情報', 'https://example.com/official']],
  ...extra,
});

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'recheck-agent-dirs-'));
  const dir = path.join(root, 'recheck');
  await mkdir(dir);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  }
  return { root, url: pathToFileURL(dir + path.sep) };
}
const withFixture = async (files, fn) => {
  const { root, url } = await fixture(files);
  try { await fn(url); } finally { await rm(root, { recursive: true, force: true }); }
};

test('recheck/codex/<号>.json を読み、agent 省略は dir 名の agent になる', async () => {
  await withFixture({ 'codex/2026-10-04.json': [item()], 'codex/2026-10-11.json': [] }, async (url) => {
    const { byAgent, failures } = await loadAgentRecheck(url);
    assert.deepEqual(failures, []);
    assert.deepEqual([...byAgent.keys()], ['codex']);
    const codex = byAgent.get('codex');
    assert.deepEqual([...codex.keys()], ['2026-10-04', '2026-10-11']);
    assert.equal(codex.get('2026-10-04')[0].agent, 'codex');
    assert.deepEqual(codex.get('2026-10-11'), []);
  });
});

test('dir 名と同じ agent を明記してもよい。alsoAffects も通る', async () => {
  await withFixture({ 'codex/2026-10-04.json': [item({ agent: 'codex', alsoAffects: ['claude'] })] }, async (url) => {
    const { byAgent, failures } = await loadAgentRecheck(url);
    assert.deepEqual(failures, []);
    assert.deepEqual(byAgent.get('codex').get('2026-10-04')[0].alsoAffects, ['claude']);
  });
});

test('dir 名と agent が食い違うファイルは除外して確認失敗に残す（他の正常ファイルは通る）', async () => {
  await withFixture({
    'codex/2026-10-04.json': [item({ agent: 'claude' })],
    'codex/2026-10-11.json': [item()],
  }, async (url) => {
    const { byAgent, failures } = await loadAgentRecheck(url);
    assert.deepEqual([...byAgent.get('codex').keys()], ['2026-10-11']);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].agent, 'codex');
    assert.equal(failures[0].file, 'codex/2026-10-04.json');
    assert.equal(failures[0].issue, '2026-10-04');
    assert.match(failures[0].reason, /agent/);
  });
});

test('不正な内容・壊れた JSON・非配列は throw せず除外して失敗に残す', async () => {
  await withFixture({
    'codex/2026-10-04.json': [item({ status: '未知の状態' })],
    'codex/2026-10-11.json': '{ broken',
    'codex/2026-10-18.json': { not: 'array' },
    'codex/2026-10-25.json': [item({ alsoAffects: ['codex'] })],
  }, async (url) => {
    const { byAgent, failures } = await loadAgentRecheck(url);
    assert.equal(byAgent.get('codex')?.size ?? 0, 0);
    assert.deepEqual(failures.map((f) => f.issue), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
    for (const f of failures) assert.ok(f.reason && f.file.startsWith('codex/'), JSON.stringify(f));
  });
});

test('号の名前でない .json・未知の agent ディレクトリ・claude ディレクトリも黙って捨てず失敗に残す', async () => {
  await withFixture({
    'codex/2026-10-4.json': [item()],
    'codex/notes.json': [item()],
    'gpt/2026-10-04.json': [item()],
    'claude/2026-10-04.json': [],
    'codex/2026-10-04.status.json': { checkedAt: '2026-10-04' },
    'codex/readme.txt': 'x',
  }, async (url) => {
    const { byAgent, failures } = await loadAgentRecheck(url);
    assert.equal(byAgent.size, 0);
    assert.deepEqual(failures.map((f) => f.file).sort(), ['claude', 'codex/2026-10-4.json', 'codex/notes.json', 'gpt']);
  });
});

test('他エージェントの不正があっても、Claude 本体の読み込みは影響を受けない', async () => {
  await withFixture({ '2026-10-04.json': [item({ title: 'Claude 側' })], 'codex/2026-10-04.json': '{ broken' }, async (url) => {
    const claude = await loadRecheckByIssue(url);
    assert.deepEqual([...claude.keys()], ['2026-10-04']);
    assert.equal(claude.get('2026-10-04')[0].agent, 'claude');
    assert.equal((await loadAgentRecheck(url)).failures.length, 1);
  });
});

test('Claude 本体（recheck/<号>.json）が不正なときは従来どおり throw する', async () => {
  await withFixture({ '2026-10-04.json': [item({ status: '未知の状態' })] }, async (url) => {
    await assert.rejects(() => loadRecheckByIssue(url), /status は/);
  });
});

test('Claude 直下は agent が claude か省略のみ。それ以外は throw する（誤配信の防止）', async () => {
  await withFixture({ '2026-10-04.json': [item({ agent: 'claude' }), item({ title: '省略' })] }, async (url) => {
    const claude = await loadRecheckByIssue(url);
    assert.deepEqual(claude.get('2026-10-04').map((i) => i.agent), ['claude', 'claude']);
  });
  await withFixture({ '2026-10-04.json': [item(), item({ agent: 'codex' })] }, async (url) => {
    await assert.rejects(() => loadRecheckByIssue(url), /2026-10-04\.json\[1\].*agent.*claude/);
  });
  await withFixture({ '2026-10-04.json': [item({ alsoAffects: ['codex'] })] }, async (url) => {
    assert.deepEqual((await loadRecheckByIssue(url)).get('2026-10-04')[0].alsoAffects, ['codex']);
  });
});

test('build.mjs は loadRecheckByIssue と同じ読み込みを使い、独自ループを持たない', async () => {
  const src = await readFile(path.resolve(import.meta.dirname, '..', 'build.mjs'), 'utf8');
  assert.match(src, /loadRecheckByIssue\(/);
  assert.doesNotMatch(src, /validateRecheck\(items, file, issueDate\)/);
});

test('agent 別ディレクトリが無い・recheck/ 自体が無いときは空で、失敗も無い', async () => {
  await withFixture({ '2026-10-04.json': [] }, async (url) => {
    const r = await loadAgentRecheck(url);
    assert.equal(r.byAgent.size, 0);
    assert.deepEqual(r.failures, []);
  });
  const none = await loadAgentRecheck(pathToFileURL(path.join(os.tmpdir(), 'no-such-recheck-dir-xyz') + path.sep));
  assert.equal(none.byAgent.size, 0);
  assert.deepEqual(none.failures, []);
});

test('実リポの recheck/ の agent 別ディレクトリは、あるものが全件検証を通る（中身の件数・有無には依存しない）', async () => {
  const r = await loadAgentRecheck();
  assert.deepEqual(r.failures, []);
  assert.ok(!r.byAgent.has('claude'), 'Claude は直下に置く（recheck/claude/ は読まない）');
});

test('emit-recheck: 他エージェントの不正は警告のみで、latest-recheck.md は Claude 分だけの出力と一致する', async () => {
  const repo = path.resolve(import.meta.dirname, '..');
  const out = {};
  for (const withCodex of [false, true]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'emit-agent-dirs-'));
    try {
      for (const f of ['emit-recheck.mjs', 'recheck-lib.mjs', 'sources.mjs']) await copyFile(path.join(repo, f), path.join(dir, f));
      await mkdir(path.join(dir, 'recheck', 'codex'), { recursive: true });
      await writeFile(path.join(dir, '2099-01-03.html'), '<html></html>', 'utf8');
      await writeFile(path.join(dir, 'recheck', '2099-01-03.json'), JSON.stringify([item({ title: 'Claude 側' })]), 'utf8');
      if (withCodex) {
        await writeFile(path.join(dir, 'recheck', 'codex', '2099-01-03.json'), '{ broken', 'utf8');
        await writeFile(path.join(dir, 'recheck', 'codex', '2099-01-10.json'), JSON.stringify([item()]), 'utf8');
      }
      // 末尾で emit-work-reverse-index.mjs を import するが一時ディレクトリには無く exit 非0。latest-recheck.md はその前に書かれる。
      const r = spawnSync(process.execPath, ['emit-recheck.mjs'], { cwd: dir, encoding: 'utf8' });
      out[withCodex] = { md: await readFile(path.join(dir, 'latest-recheck.md'), 'utf8'), stderr: r.stderr };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  assert.equal(out.true.md.replace(/生成: \S+/, ''), out.false.md.replace(/生成: \S+/, ''));
  assert.match(out.true.stderr, /確認失敗（codex）: codex\/2099-01-03\.json/);
  assert.doesNotMatch(out.true.md, /Codex 側の提案/);
  assert.doesNotMatch(out.false.stderr, /確認失敗/);
});
