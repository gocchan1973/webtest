import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  STALE_DAYS, agentRecheckWarnings, checkAge, deriveCheckState, latestIssue, loadAgentRecheck, loadRecheckStatuses,
  renderAgentRecheckMd, validateRecheckStatus,
} from '../recheck-lib.mjs';

// 状態の導出（P2）と、Claude 以外の注入用 Markdown（P3）、finalize への警告（P4）。
const labels = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
const item = (extra = {}) => ({
  status: '改善提案', title: 'Codex 側の提案', harness: ['~/.codex/AGENTS.md'],
  fields: labels.map((label) => [label, `${label}の内容`]),
  links: [['公式一次情報', 'https://example.com/official']],
  ...extra,
});
const statusJson = (extra = {}) => ({
  schema: 1, agent: 'codex', issue: '2026-10-04', checkedAt: '2026-10-05T09:00:00+09:00',
  period: { start: '2026-09-28', end: '2026-10-04' },
  sources: [{ id: 'openai-chatgpt-codex-changelog', ok: true }],
  ...extra,
});
const ok = (extra) => validateRecheckStatus(statusJson(extra), 'codex/2026-10-04.status.json', { agent: 'codex', issue: '2026-10-04' });

test('status.json の検証: 正常形を通し、checkFailures は sources の ok:false から導く', () => {
  const s = ok({ sources: [{ id: 'a', ok: true }, { id: 'b', ok: false, reason: '取得失敗' }] });
  assert.deepEqual(s.checkFailures, [{ id: 'b', ok: false, reason: '取得失敗' }]);
  assert.equal(s.agent, 'codex');
});

test('status.json の検証: 不正な形はそれぞれ throw する', () => {
  const bad = {
    'schema が 1 でない': { schema: 2 },
    'agent が食い違う': { agent: 'claude' },
    'issue が食い違う': { issue: '2026-10-11' },
    'checkedAt にタイムゾーンが無い': { checkedAt: '2026-10-05T09:00:00' },
    'checkedAt が日付だけ': { checkedAt: '2026-10-05' },
    'checkedAt が実在しない日時': { checkedAt: '2026-13-45T09:00:00Z' },
    'period が無い': { period: undefined },
    'period の start > end': { period: { start: '2026-10-04', end: '2026-09-28' } },
    'period の日付形式': { period: { start: '9/28', end: '10/4' } },
    'sources が空': { sources: [] },
    'sources の ok が boolean でない': { sources: [{ id: 'a', ok: 'yes' }] },
    'sources の id が空': { sources: [{ id: '', ok: true }] },
    'sources の id が重複': { sources: [{ id: 'a', ok: true }, { id: 'a', ok: false }] },
    'sources の reason が文字列でない': { sources: [{ id: 'a', ok: false, reason: 3 }] },
  };
  for (const [name, extra] of Object.entries(bad)) assert.throws(() => ok(extra), Error, name);
  assert.throws(() => validateRecheckStatus([], 'x.status.json', { agent: 'codex', issue: '2026-10-04' }), /オブジェクト/);
});

const items = [item(), item({ title: '2件目' })];
const okStatus = () => ok();

test('状態の導出: 未確認（JSON も status も無い）', () => {
  assert.equal(deriveCheckState('codex', '2026-10-04', {}).state, '未確認');
});
test('状態の導出: 確認不能（JSON はあるが検証除外）。status があっても確認不能', () => {
  const failures = [{ agent: 'codex', file: 'codex/2026-10-04.json', issue: '2026-10-04', reason: 'x' }];
  assert.equal(deriveCheckState('codex', '2026-10-04', { failures }).state, '確認不能');
  assert.equal(deriveCheckState('codex', '2026-10-04', { status: okStatus(), failures }).state, '確認不能');
});
test('状態の導出: 状態不明（旧形式 = JSON はあるが status 無し）。status.json だけが不正でも同じ', () => {
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: [] }).state, '状態不明');
  const failures = [{ agent: 'codex', file: 'codex/2026-10-04.status.json', issue: '2026-10-04', reason: 'x' }];
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: [], failures }).state, '状態不明');
  // status だけあって提案 JSON が無い場合は「該当なし」にも「未確認」にもしない
  assert.equal(deriveCheckState('codex', '2026-10-04', { status: okStatus() }).state, '状態不明');
});
test('状態の導出: 確認失敗（全出典失敗）。提案があっても確認失敗', () => {
  const status = ok({ sources: [{ id: 'a', ok: false, reason: 'r' }, { id: 'b', ok: false }] });
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: [], status }).state, '確認失敗');
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: items, status }).state, '確認失敗');
});
test('状態の導出: 部分確認（一部失敗）は [] でも「該当なし」と言わない', () => {
  const status = ok({ sources: [{ id: 'a', ok: true }, { id: 'b', ok: false, reason: 'r' }] });
  const empty = deriveCheckState('codex', '2026-10-04', { recheck: [], status });
  assert.equal(empty.state, '部分確認');
  assert.notEqual(empty.state, '該当なし');
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: items, status }).count, 2);
});
test('状態の導出: 該当なし（[] かつ全出典成功）と N件', () => {
  assert.equal(deriveCheckState('codex', '2026-10-04', { recheck: [], status: okStatus() }).state, '該当なし');
  const r = deriveCheckState('codex', '2026-10-04', { recheck: items, status: okStatus() });
  assert.equal(r.state, '2件');
  assert.equal(r.count, 2);
});

test('古さは状態とは別軸。閾値は仮置き14日', () => {
  assert.equal(STALE_DAYS, 14);
  const s = okStatus(); // 2026-10-05T09:00+09:00
  assert.deepEqual(checkAge(s, new Date('2026-10-12T00:00:00Z')), { days: 7, stale: false });
  assert.equal(checkAge(s, new Date('2026-10-19T00:00:00Z')).stale, false);
  assert.equal(checkAge(s, new Date('2026-10-20T01:00:00Z')).stale, true);
  assert.equal(checkAge(undefined, new Date()), null);
});

test('最新号は実在する号の一覧から決める（除外された号で古い号が最新に見えない）', () => {
  assert.equal(latestIssue(['2026-09-27', '2026-10-04', 'x', '2026-09-20']), '2026-10-04');
  assert.equal(latestIssue([]), null);
});

async function withRecheckDir(files, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'recheck-status-'));
  const dir = path.join(root, 'recheck');
  await mkdir(dir);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  }
  try { await fn(pathToFileURL(dir + path.sep), root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('status の読み込み: agent 別と Claude 直下、不正は除外して失敗に残す（書き戻さない）', async () => {
  await withRecheckDir({
    'codex/2026-10-04.status.json': statusJson(),
    'codex/2026-10-11.status.json': '{ broken',
    'codex/2026-10-18.status.json': statusJson({ issue: '2026-10-11' }),
    '2026-10-04.status.json': statusJson({ agent: 'claude' }),
  }, async (url) => {
    const before = await readFile(new URL('codex/2026-10-11.status.json', url), 'utf8');
    const { byAgent, failures } = await loadRecheckStatuses(url);
    assert.deepEqual([...byAgent.get('codex').keys()], ['2026-10-04']);
    assert.deepEqual([...byAgent.get('claude').keys()], ['2026-10-04']);
    assert.deepEqual(failures.map((f) => f.file).sort(), ['codex/2026-10-11.status.json', 'codex/2026-10-18.status.json']);
    assert.equal(await readFile(new URL('codex/2026-10-11.status.json', url), 'utf8'), before);
    // 提案 JSON の読み込みは .status.json を失敗扱いにしない（既存の挙動）
    assert.deepEqual((await loadAgentRecheck(url)).failures, []);
  });
});

test('実リポの status.json は、あるものが全件検証を通る（中身の件数・有無には依存しない）', async () => {
  const r = await loadRecheckStatuses();
  assert.deepEqual(r.failures, []);
});

test('Markdown 生成: 状態行が先頭近くに出る。0件・未確認は状態のみで、提案を捏造しない', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  const none = renderAgentRecheckMd('codex', { issue: '2026-10-04', now });
  assert.match(none, /対象号: 2026-10-04/);
  assert.match(none, /状態: 未確認/);
  assert.doesNotMatch(none, /^## /m);
  const empty = renderAgentRecheckMd('codex', { issue: '2026-10-04', recheck: [], status: okStatus(), now });
  assert.match(empty, /状態: 該当なし/);
  assert.match(empty, /2026-09-28/);
  assert.match(empty, /openai-chatgpt-codex-changelog/);
  assert.doesNotMatch(empty, /^## /m);
});

test('Markdown 生成: 提案あり・古い・部分確認・確認不能', () => {
  const stale = renderAgentRecheckMd('codex', { issue: '2026-10-04', recheck: items.map((i) => ({ ...i, agent: 'codex', alsoAffects: [] })), status: okStatus(), now: new Date('2026-11-30T00:00:00Z') });
  assert.match(stale, /状態: 2件/);
  assert.match(stale, /古い/);
  assert.match(stale, /^## \[改善提案\] Codex 側の提案/m);
  assert.match(stale, /\*\*提案\*\*: 提案の内容/);
  const partial = renderAgentRecheckMd('codex', {
    issue: '2026-10-04', recheck: [], now: new Date('2026-10-06T00:00:00Z'),
    status: ok({ sources: [{ id: 'a', ok: true }, { id: 'b', ok: false, reason: '取得失敗' }] }),
  });
  assert.match(partial, /状態: 部分確認/);
  assert.match(partial, /b.*取得失敗/);
  const broken = renderAgentRecheckMd('codex', {
    issue: '2026-10-04', now: new Date('2026-10-06T00:00:00Z'),
    failures: [{ agent: 'codex', file: 'codex/2026-10-04.json', issue: '2026-10-04', reason: '不正な status' }],
  });
  assert.match(broken, /状態: 確認不能/);
  assert.match(broken, /不正な status/);
  assert.doesNotMatch(broken, /^## /m);
});

test('emit-recheck: recheck/codex/ が無ければ latest-recheck-codex.md を作らない。あれば状態を出す。Claude 側は不変', async () => {
  const repo = path.resolve(import.meta.dirname, '..');
  const run = async (withCodex, codexFiles = {}) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'emit-codex-md-'));
    try {
      for (const f of ['emit-recheck.mjs', 'recheck-lib.mjs', 'sources.mjs']) await copyFile(path.join(repo, f), path.join(dir, f));
      await mkdir(path.join(dir, 'recheck'), { recursive: true });
      await writeFile(path.join(dir, '2099-01-03.html'), '<html></html>', 'utf8');
      await writeFile(path.join(dir, '2099-01-10.html'), '<html></html>', 'utf8');
      await writeFile(path.join(dir, 'recheck', '2099-01-03.json'), JSON.stringify([item({ title: 'Claude 側' })]), 'utf8');
      if (withCodex) {
        await mkdir(path.join(dir, 'recheck', 'codex'), { recursive: true });
        for (const [n, b] of Object.entries(codexFiles)) await writeFile(path.join(dir, 'recheck', 'codex', n), JSON.stringify(b), 'utf8');
      }
      spawnSync(process.execPath, ['emit-recheck.mjs'], { cwd: dir, encoding: 'utf8' });
      const codexPath = path.join(dir, 'latest-recheck-codex.md');
      return { claude: await readFile(path.join(dir, 'latest-recheck.md'), 'utf8'), codex: existsSync(codexPath) ? await readFile(codexPath, 'utf8') : null };
    } finally { await rm(dir, { recursive: true, force: true }); }
  };
  const without = await run(false);
  assert.equal(without.codex, null);
  // 最新号は html が実在する 2099-01-10。Claude の JSON は 2099-01-03 のみなので Claude 側は従来どおり 01-03 を指す。
  const withDir = await run(true, {
    '2099-01-03.json': [item()],
    '2099-01-03.status.json': statusJson({ issue: '2099-01-03', checkedAt: '2099-01-04T00:00:00Z' }),
  });
  assert.equal(withDir.claude.replace(/生成: \S+/, ''), without.claude.replace(/生成: \S+/, ''));
  // 最新の実在号 2099-01-10 には codex の確認が無い = 未確認。古い号の項目を最新に見せない。
  assert.match(withDir.codex, /対象号: 2099-01-10/);
  assert.match(withDir.codex, /状態: 未確認/);
  assert.doesNotMatch(withDir.codex, /Codex 側の提案/);
});

test('警告の整形: failures を finalize の warnings 用の文へ', () => {
  assert.deepEqual(agentRecheckWarnings([]), []);
  const w = agentRecheckWarnings([{ agent: 'codex', file: 'codex/2026-10-04.json', issue: '2026-10-04', reason: 'x' }]);
  assert.equal(w.length, 1);
  assert.match(w[0], /codex\/2026-10-04\.json/);
  assert.match(w[0], /x/);
});

test('finalize.mjs: 他エージェントの確認失敗が warnings に出る（スタブのリポで実行。release-dates は実ネットワーク）', async (t) => {
  const finalize = 'F:/Dev_hub/skills/claude/self-update-check/scripts/finalize.mjs';
  if (!existsSync(finalize)) return t.skip('finalize.mjs が無い');
  const repo = path.resolve(import.meta.dirname, '..');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'finalize-warn-'));
  try {
    for (const f of ['recheck-lib.mjs', 'sources.mjs']) await copyFile(path.join(repo, f), path.join(dir, f));
    // build.mjs の代わり。finalize が使う契約は「import でき、agentRecheck.failures を持つ」だけ。
    await writeFile(path.join(dir, 'build.mjs'),
      "import { loadAgentRecheck } from './recheck-lib.mjs';\nexport const agentRecheck = await loadAgentRecheck(new URL('./recheck/', import.meta.url));\n", 'utf8');
    await mkdir(path.join(dir, 'recheck', 'codex'), { recursive: true });
    await mkdir(path.join(dir, 'weekly-updates'));
    await writeFile(path.join(dir, 'recheck', '2099-01-03.json'), '[]', 'utf8');
    await writeFile(path.join(dir, 'recheck', 'codex', '2099-01-03.json'), '{ broken', 'utf8');
    await writeFile(path.join(dir, 'weekly-updates', '2099-01-03.md'), `## 見出し\n${'本文'.repeat(150)}\n`, 'utf8');
    const r = spawnSync(process.execPath, [finalize, '--issue', '2099-01-03'], { encoding: 'utf8', env: { ...process.env, FINALIZE_REPO: dir }, timeout: 60000 });
    if (r.status === null) return t.skip('finalize が時間内に終わらなかった（ネットワーク待ちの可能性）');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const result = JSON.parse(r.stdout);
    assert.ok(result.warnings.some((w) => /codex\/2099-01-03\.json/.test(w)), JSON.stringify(result.warnings));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
