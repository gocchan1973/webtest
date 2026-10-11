import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateEntry, findSecretKinds, AGENTS } from '../agent-exchanges/exchange-lib.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'agent-exchanges');
const LOG = join(DIR, 'log-exchange.mjs');
const RECALL = join(DIR, 'recall.mjs');

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), 'exch-'));
  return { d, log: join(d, 'exchanges.jsonl'), rawDir: join(d, 'raw') };
}
const base = () => ({
  ts: '2026-10-06T12:00:00+09:00', from: 'claude', to: 'codex', topic: '設計相談', question: '台帳の形は妥当か',
  premise: ['前提1'], answer_summary: '妥当との回答', review: '追従の可能性あり',
  outcome: { status: 'open', reason: '未判断' }, evidence: ['a/b.md'], raw: '記録なし（テスト）', tags: ['設計'], refs: [],
});
function log(sb, entry, extra = []) {
  const f = join(sb.d, `in-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(f, JSON.stringify(entry));
  return spawnSync(process.execPath, [LOG, f, '--log', sb.log, '--raw-dir', sb.rawDir, ...extra], { encoding: 'utf8' });
}
function recall(sb, ...a) {
  return spawnSync(process.execPath, [RECALL, ...a, '--log', sb.log], { encoding: 'utf8' });
}

test('検証: 正常な入力は通る', () => assert.deepEqual(validateEntry(base()), []));

test('検証: 必須項目・許可値・文字数', () => {
  const e = base();
  delete e.topic;
  assert.ok(validateEntry(e).some((m) => m.includes('topic')));
  assert.ok(validateEntry({ ...base(), from: 'gemini' }).some((m) => m.includes('from')));
  assert.ok(validateEntry({ ...base(), to: 'x' }).some((m) => m.includes('to')));
  assert.ok(validateEntry({ ...base(), question: 'あ'.repeat(1201) }).some((m) => m.includes('question')));
  assert.deepEqual(validateEntry({ ...base(), question: 'あ'.repeat(1200) }), []);
  assert.ok(validateEntry({ ...base(), premise: ['あ'.repeat(201)] }).some((m) => m.includes('premise')));
  assert.ok(validateEntry({ ...base(), outcome: { status: 'done', reason: 'x' } }).some((m) => m.includes('status')));
  assert.ok(validateEntry({ ...base(), raw: '../x' }).some((m) => m.includes('raw')));
  assert.ok(AGENTS.includes('opus') && AGENTS.includes('human'));
});

test('秘密検出: 各形式を種別だけで検出', () => {
  assert.ok(findSecretKinds('x' + 'A1'.repeat(10)).length > 0);
  assert.ok(findSecretKinds('key=AIza12').length > 0);
  assert.ok(findSecretKinds('sk-abc').length > 0);
  assert.ok(findSecretKinds('ctx7sk-abc').length > 0);
  assert.ok(findSecretKinds('Authorization: Bearer abcdefgh1').length > 0);
  assert.deepEqual(findSecretKinds('通常の文章と path/to/file-name.md'), []);
});

test('秘密を含む入力は拒否され、値は出力に出ず、何も書かれない', () => {
  const sb = sandbox();
  const secret = 'sk-' + 'Z9'.repeat(15);
  const r = log(sb, { ...base(), question: `これは ${secret} を含む` });
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes(secret) && !r.stderr.includes(secret));
  assert.ok(r.stderr.includes('秘密'));
  assert.ok(!existsSync(sb.log) || readFileSync(sb.log, 'utf8') === '');
  rmSync(sb.d, { recursive: true });
});

test('--raw-file に秘密があれば拒否しコピーしない', () => {
  const sb = sandbox();
  const rf = join(sb.d, 'raw-in.txt');
  const secret = 'Bearer ' + 'q'.repeat(30);
  writeFileSync(rf, `ログ\n${secret}\n`);
  const e = base(); delete e.raw;
  const r = log(sb, e, ['--raw-file', rf]);
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes('qqqq') && !r.stderr.includes('qqqq'));
  assert.ok(!existsSync(sb.rawDir) || readdirSync(sb.rawDir).length === 0);
  assert.ok(!existsSync(sb.log) || readFileSync(sb.log, 'utf8') === '');
  rmSync(sb.d, { recursive: true });
});

test('--raw-file は検査後 raw/ へコピーされ raw 欄が埋まる', () => {
  const sb = sandbox();
  const rf = join(sb.d, 'answer.txt');
  writeFileSync(rf, '回答全文です');
  const e = base(); delete e.raw;
  const r = log(sb, e, ['--raw-file', rf]);
  assert.equal(r.status, 0, r.stderr);
  const row = JSON.parse(readFileSync(sb.log, 'utf8').trim());
  assert.equal(row.raw, 'raw/ex-20261006-001-answer.txt');
  assert.equal(readFileSync(join(sb.rawDir, 'ex-20261006-001-answer.txt'), 'utf8'), '回答全文です');
  rmSync(sb.d, { recursive: true });
});

test('id 自動採番・追記専用（既存行が変わらない）・id の持ち込み拒否', () => {
  const sb = sandbox();
  assert.equal(log(sb, base()).status, 0);
  const first = readFileSync(sb.log, 'utf8');
  assert.equal(log(sb, { ...base(), topic: '2件目' }).status, 0);
  assert.equal(log(sb, { ...base(), ts: '2026-10-07T01:00:00+09:00', topic: '翌日' }).status, 0);
  const all = readFileSync(sb.log, 'utf8');
  assert.ok(all.startsWith(first));
  const ids = all.trim().split('\n').map((l) => JSON.parse(l).id);
  assert.deepEqual(ids, ['ex-20261006-001', 'ex-20261006-002', 'ex-20261007-001']);
  const r = log(sb, { ...base(), id: 'ex-x' });
  assert.equal(r.status, 1);
  assert.equal(readFileSync(sb.log, 'utf8'), all);
  rmSync(sb.d, { recursive: true });
});

test('ts 省略で TZ 付き現在時刻が入る。不正な ts は拒否', () => {
  const sb = sandbox();
  const e = base(); delete e.ts;
  assert.equal(log(sb, e).status, 0);
  const row = JSON.parse(readFileSync(sb.log, 'utf8').trim());
  assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(log(sb, { ...base(), ts: '2026-10-06' }).status, 1);
  rmSync(sb.d, { recursive: true });
});

test('recall: 日本語検索・新しい順・絞り込み・--show・--list・該当なし', () => {
  const sb = sandbox();
  log(sb, { ...base(), topic: '段階2の添削', from: 'claude', to: 'codex', outcome: { status: 'adopted', reason: '指摘を反映' } });
  log(sb, { ...base(), ts: '2026-10-07T09:00:00+09:00', topic: 'Hermes の注入経路', from: 'claude', to: 'hermes', tags: ['注入'], outcome: { status: 'deferred', reason: '保留' } });

  let r = recall(sb, '注入');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Hermes の注入経路/);
  assert.ok(!r.stdout.includes('段階2の添削'));

  r = recall(sb, '--list');
  const lines = r.stdout.split('\n').filter((l) => l.startsWith('ex-'));
  assert.match(lines[0], /ex-20261007-001/);
  assert.match(lines[1], /ex-20261006-001/);

  r = recall(sb, '設計', '--to', 'codex');
  assert.match(r.stdout, /段階2の添削/);
  r = recall(sb, '設計', '--to', 'agy');
  assert.match(r.stdout, /該当なし/);
  r = recall(sb, '--status', 'deferred');
  assert.match(r.stdout, /Hermes/);
  assert.ok(!r.stdout.includes('段階2'));
  r = recall(sb, '--from', 'claude', '--limit', '1');
  assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('ex-')).length, 1);

  r = recall(sb, '--show', 'ex-20261006-001');
  assert.match(r.stdout, /台帳の形は妥当か/);
  assert.match(r.stdout, /指摘を反映/);
  assert.match(r.stdout, /全文は無い（記録なし（テスト））/);
  assert.match(r.stdout, /正しさの保証ではない/);
  r = recall(sb, '--show', 'ex-nope');
  assert.equal(r.status, 1);
  r = recall(sb, 'zzzz存在しない');
  assert.match(r.stdout, /該当なし/);
  rmSync(sb.d, { recursive: true });
});

test('recall: 全文がある件は raw のパスを示す。ログ無しは記録なし', () => {
  const sb = sandbox();
  assert.match(recall(sb, 'x').stdout, /記録なし/);
  const rf = join(sb.d, 'a.txt'); writeFileSync(rf, 'x');
  const e = base(); delete e.raw;
  log(sb, e, ['--raw-file', rf]);
  assert.match(recall(sb, '--show', 'ex-20261006-001').stdout, /全文は agent-exchanges\/raw\/ex-20261006-001-a\.txt/);
  rmSync(sb.d, { recursive: true });
});

test('テストは実リポの exchanges.jsonl を書き換えていない（このテスト自体は読むだけ）', () => {
  const real = join(DIR, 'exchanges.jsonl');
  if (!existsSync(real)) return;
  for (const l of readFileSync(real, 'utf8').split('\n').filter(Boolean)) JSON.parse(l);
});

test('秘密検出: CamelCase の識別子は除外するが、鍵らしい混在文字列は検出', () => {
  assert.deepEqual(findSecretKinds('NoConsoleScreenBufferError CreateProcessAsUserW'), []);
  assert.ok(findSecretKinds('aB3dE5gH7jK9mN1pQ3sT5').length > 0);
  assert.ok(findSecretKinds('ABCDEFGHIJKLMNOPQRSTUV').length > 0);
  assert.ok(findSecretKinds('abcdefghijklmnopqrstuv').length > 0);
});

test('raw/ を指す raw 欄は、ファイルが実在しないと拒否される', () => {
  const sb = sandbox();
  const r = log(sb, { ...base(), raw: 'raw/nothing.txt' });
  assert.equal(r.status, 1);
  assert.ok(!existsSync(sb.log) || readFileSync(sb.log, 'utf8') === '');
  rmSync(sb.d, { recursive: true });
});

function recallL(sb, linksFile, ...a) {
  return spawnSync(process.execPath, [RECALL, ...a, '--log', sb.log, '--links', linksFile], { encoding: 'utf8' });
}

test('recall: Linear 番号で引ける。URL 指定・キーワード・--show・見出しにも出る。リンク無しは該当なし', () => {
  const sb = sandbox();
  log(sb, { ...base(), topic: '1件目' });
  log(sb, { ...base(), topic: '2件目' });
  log(sb, { ...base(), topic: '3件目' });
  const lf = join(sb.d, 'links.jsonl');
  const row = (ex_id, linear, note) => JSON.stringify({ ts: '2026-10-06T12:00:00+09:00', ex_id, linear, url: `https://linear.app/5-10/issue/${linear}/x`, note });
  writeFileSync(lf, [row('ex-20261006-001', '5-117', '理由A'), row('ex-20261006-002', '5-117', '理由B'), row('ex-20261006-002', '5-120', '理由C')].join('\n') + '\n');

  let r = recallL(sb, lf, '--linear', '5-117');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1件目[^\n]*Linear 5-117/);
  assert.match(r.stdout, /2件目[^\n]*Linear 5-117, 5-120/);
  assert.ok(!r.stdout.includes('3件目'));
  r = recallL(sb, lf, '--linear', 'https://linear.app/5-10/issue/5-120/abc');
  assert.match(r.stdout, /2件目/);
  assert.ok(!r.stdout.includes('1件目'));
  r = recallL(sb, lf, '5-120');
  assert.match(r.stdout, /2件目/);
  r = recallL(sb, lf, '--show', 'ex-20261006-002');
  assert.match(r.stdout, /\[linear\] 5-117 https:\/\/linear\.app\/5-10\/issue\/5-117\/x — 理由B/);
  assert.match(r.stdout, /\[linear\] 5-120 .* 理由C/);
  r = recallL(sb, lf, '--show', 'ex-20261006-003');
  assert.ok(!r.stdout.includes('[linear]'));
  r = recallL(sb, lf, '--linear', '5-999');
  assert.match(r.stdout, /該当なし/);
  r = recallL(sb, lf, '--list');
  assert.match(r.stdout, /3件目\n/); // リンク無しの件に Linear 表記が付かない
  rmSync(sb.d, { recursive: true });
});

test('recall: リンクファイルが無くても動き、壊れた行は行番号付きで失敗する', () => {
  const sb = sandbox();
  log(sb, base());
  const none = join(sb.d, 'nolinks.jsonl');
  let r = recallL(sb, none, '--list');
  assert.equal(r.status, 0);
  const bad = join(sb.d, 'bad.jsonl');
  writeFileSync(bad, '{"ex_id":"ex-20261006-001","linear":"5-1"}\nnot json\n');
  r = recallL(sb, bad, '--list');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /2 行目/);
  rmSync(sb.d, { recursive: true });
});

test('実リポの exchange-links.jsonl は全行が読め、ex_id が exchanges.jsonl に実在する（読むだけ）', async () => {
  const links = join(DIR, 'exchange-links.jsonl');
  const real = join(DIR, 'exchanges.jsonl');
  if (!existsSync(links) || !existsSync(real)) return;
  const ids = new Set(readFileSync(real, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id));
  for (const l of readFileSync(links, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    assert.match(r.linear, /^\d+-\d+$/);
    assert.ok(ids.has(r.ex_id), `${r.ex_id} が exchanges.jsonl に無い`);
  }
});

// ---- Linear コメント下書き（--linear / --linear-comment） ----
function logL(sb, entry, extra = []) {
  return log(sb, entry, ['--links', join(sb.d, 'links.jsonl'), ...extra]);
}

test('log-exchange --linear: 結び付け追記と下書き出力。下書きに全文は入らず上限で切れる', () => {
  const sb = sandbox();
  const long = 'あ'.repeat(1100);
  const r = logL(sb, { ...base(), answer_summary: long }, ['--linear', '5-117', '--linear', 'https://linear.app/5-10/issue/5-120/foo', '--linear', '5-117']);
  assert.equal(r.status, 0, r.stderr);
  const links = readFileSync(join(sb.d, 'links.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(links.map((l) => l.linear), ['5-117', '5-120']);
  assert.ok(links.every((l) => l.ex_id === 'ex-20261006-001'));
  assert.match(r.stdout, /## AI間のやり取りの記録（ex-20261006-001）/);
  assert.match(r.stdout, /### 回答の要旨/);
  assert.match(r.stdout, /以下略。全文は共有ログ/);
  assert.ok(!r.stdout.includes(long));
  assert.match(r.stdout, /recall\.mjs --show ex-20261006-001/);
});

test('log-exchange --linear 無しなら従来どおり（リンクも下書きも出ない）', () => {
  const sb = sandbox();
  const r = logL(sb, base());
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(sb.d, 'links.jsonl')));
  assert.ok(!r.stdout.includes('下書き'));
});

test('log-exchange --linear: 不正な番号は何も書かずに拒否', () => {
  const sb = sandbox();
  const r = logL(sb, base(), ['--linear', 'abc']);
  assert.notEqual(r.status, 0);
  assert.ok(!existsSync(sb.log) || readFileSync(sb.log, 'utf8') === '');
  assert.ok(!existsSync(join(sb.d, 'links.jsonl')));
});

test('下書きの秘密検査: 検出時は下書きを出さず、値も出さない（ログ側の検査とは別に下書き生成でも検査される）', async () => {
  const { renderLinearComment } = await import('../agent-exchanges/exchange-lib.mjs');
  const secret = 'sk-' + 'Q7'.repeat(12);
  const r = renderLinearComment({ ...base(), id: 'ex-x', question: `x ${secret}` });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(secret));
  assert.ok(renderLinearComment({ ...base(), id: 'ex-x' }).ok);
});

test('recall --linear-comment: 既存1件から下書きを再生成。無い id は失敗', () => {
  const sb = sandbox();
  assert.equal(logL(sb, base()).status, 0);
  const r = recall(sb, '--linear-comment', 'ex-20261006-001');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AI間のやり取りの記録（ex-20261006-001）/);
  assert.match(r.stdout, /妥当との回答/);
  assert.match(r.stdout, /次の一手・未決/);
  const n = recall(sb, '--linear-comment', 'ex-nope');
  assert.notEqual(n.status, 0);
});

test('実リポの1件から下書きが作れる（読むだけ・秘密検査を通る）', () => {
  const r = spawnSync(process.execPath, [RECALL, '--linear-comment', 'ex-20261006-027'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length < 6000);
});
