import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { RECHECK_AGENTS, RECHECK_ALSO_AFFECTS_MAX, loadRecheckByIssue, validateRecheck } from '../recheck-lib.mjs';

// 段階2: 任意フィールド agent / alsoAffects。agent 無し = claude（既存の recheck/*.json は全てこれ）。
const labels = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
const v2 = {
  status: '改善提案',
  title: '追従する',
  harness: ['~/.codex/AGENTS.md'],
  fields: labels.map((label) => [label, `${label}の内容`]),
  links: [['公式一次情報', 'https://example.com/official']],
};
const v1 = { status: '判断更新', title: 'v1', fields: [['以前の判断', '…']], links: [['出典', 'https://example.com']] };
const run = (item, file = '2026-09-27.json') => validateRecheck([item], file)[0];

test('agent 無しは claude、alsoAffects 無しは空配列として戻る（v1・v2 とも）', () => {
  assert.equal(run(v2).agent, 'claude');
  assert.deepEqual(run(v2).alsoAffects, []);
  assert.equal(run(v1, '2026-09-20.json').agent, 'claude');
  assert.deepEqual(run(v1, '2026-09-20.json').alsoAffects, []);
});

test('agent は既知のエージェント名のみ受理する', () => {
  for (const agent of RECHECK_AGENTS) assert.equal(run({ ...v2, agent }).agent, agent);
  assert.ok(RECHECK_AGENTS.includes('claude') && RECHECK_AGENTS.includes('codex'));
});

test('agent の不正値は throw する（空・未知・大文字・非文字列・all）', () => {
  for (const agent of ['', 'Claude', 'gpt', 'all', 1, null, ['claude']]) {
    assert.throws(() => run({ ...v2, agent }), /agent は/, JSON.stringify(agent));
  }
});

test('alsoAffects は他エージェント名の配列として受理する', () => {
  assert.deepEqual(run({ ...v2, agent: 'codex', alsoAffects: ['claude', 'agy'] }).alsoAffects, ['claude', 'agy']);
  assert.deepEqual(run({ ...v2, alsoAffects: [] }).alsoAffects, []);
});

test('alsoAffects の形式不正は throw する（非配列・未知名・重複・自分自身・非文字列）', () => {
  for (const alsoAffects of [null, 'codex', {}, ['gpt'], ['codex', 'codex'], ['claude'], [1], [''], ['all']]) {
    assert.throws(() => run({ ...v2, alsoAffects }), /alsoAffects は/, JSON.stringify(alsoAffects));
  }
  // agent を指定したとき、自分自身が対象外になる基準は agent の側
  assert.throws(() => run({ ...v2, agent: 'codex', alsoAffects: ['codex'] }), /alsoAffects は/);
});

test('alsoAffects の件数は上限を超えたら throw する', () => {
  const others = RECHECK_AGENTS.filter((a) => a !== 'claude');
  assert.ok(others.length <= RECHECK_ALSO_AFFECTS_MAX);
  assert.equal(run({ ...v2, alsoAffects: others }).alsoAffects.length, others.length);
  // 件数検査は重複検査と別に落ちる（メッセージで識別）
  assert.throws(() => run({ ...v2, alsoAffects: Array(RECHECK_ALSO_AFFECTS_MAX + 1).fill('codex') }), /alsoAffects は最大/);
});

test('work / workComment は型だけ検証し、結果に残る（逆引きの別系統読みと矛盾させない）', () => {
  const ok = run({ ...v2, work: ['x'], workComment: 'c' });
  assert.deepEqual(ok.work, ['x']);
  assert.equal(ok.workComment, 'c');
  assert.equal(run(v2).work, undefined);
  assert.equal(Object.hasOwn(run(v2), 'work'), false);
  assert.equal(Object.hasOwn(run(v2), 'workComment'), false);
  assert.deepEqual(run({ ...v2, work: [], workComment: '' }).work, []);
  for (const work of ['x', [1], [''], ['  '], null]) assert.throws(() => run({ ...v2, work }), /work は/);
  for (const workComment of [1, null]) assert.throws(() => run({ ...v2, workComment }), /workComment は/);
});

test('既存 recheck/*.json は全件従来どおり通り、agent は全て claude になる', async () => {
  const byIssue = await loadRecheckByIssue();
  const files = (await readdir(new URL('../recheck/', import.meta.url))).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
  assert.equal(byIssue.size, files.length);
  for (const [issue, items] of byIssue) {
    const raw = JSON.parse(await readFile(new URL(`../recheck/${issue}.json`, import.meta.url), 'utf8'));
    assert.equal(items.length, raw.length);
    items.forEach((item, i) => {
      // 省略時の既定値を検査する（将来 agent を持つ正当な項目が増えても落ちない）。現状の実データは全て省略。
      assert.equal(item.agent, raw[i].agent ?? 'claude');
      assert.deepEqual(item.alsoAffects, raw[i].alsoAffects ?? []);
      // 逆引き(emit-work-reverse-index)が生ファイルから読む work と、検証済みの値が一致する
      assert.deepEqual(item.work, raw[i].work);
      assert.equal(item.workComment, raw[i].workComment);
    });
  }
});

test('各 agent は自分以外の全エージェントを alsoAffects に持てる / v1 号でも検証が働く', () => {
  for (const agent of RECHECK_AGENTS) {
    const others = RECHECK_AGENTS.filter((a) => a !== agent);
    assert.deepEqual(run({ ...v2, agent, alsoAffects: others }).alsoAffects, others);
  }
  assert.equal(run({ ...v1, agent: 'codex' }, '2026-09-20.json').agent, 'codex');
  assert.throws(() => run({ ...v1, agent: 'gpt' }, '2026-09-20.json'), /agent は/);
});
