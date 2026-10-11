// recheck/<号>.json（正本）から latest-recheck.md を生成する。HTML は読まない（段階1）。
// 以前は生成済みHTMLを正規表現で読み戻していたが、描画の変更で注入元が静かに空になる脆さがあった。
// 「号が存在するか」だけは <号>.html の有無で見る（未確認の号の判定。従来と同じ根拠）。
// 使い方: node emit-recheck.mjs
import { readdir, stat, writeFile } from 'node:fs/promises';
import {
  isHarnessProposalIssue, latestIssue, loadAgentRecheck, loadRecheckByIssue, loadRecheckStatuses,
  renderAgentRecheckMd, renderRecheckItemLines, warnAgentRecheckFailures,
} from './recheck-lib.mjs';

const files = (await readdir('.')).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort();
const recheckByIssue = await loadRecheckByIssue();
// 他エージェント分は latest-recheck.md（Claude 用）に混ぜない。不正は警告を出し、下で別ファイルの状態に反映する。
const agentRecheck = await loadAgentRecheck();
const agentStatuses = await loadRecheckStatuses();
warnAgentRecheckFailures(agentRecheck.failures);
warnAgentRecheckFailures(agentStatuses.failures);
const issues = [];
for (const file of files) {
  const issue = file.replace('.html', '');
  // 項目0件でも JSON があれば「確認して該当なし」の週。JSON が無い週と混ぜない。
  // 号 HTML が無い JSON は、まだ紙面に載っていない号なので対象にしない（従来の radar 検出と同じ範囲）。
  if (!recheckByIssue.has(issue)) continue;
  issues.push({ issue, items: recheckByIssue.get(issue).map((item) => ({ ...item, harness: item.harness ?? [] })) });
}

if (!issues.length) throw new Error('再判定（recheck/*.json）を持つ号が見つかりません。');

const latest = issues.at(-1);
// 2026-09-27 号以降は「ハーネス改善提案」形式（recheck-lib.mjs の HARNESS_PROPOSAL_SINCE）。
const v2 = isHarnessProposalIssue(latest.issue);
const lines = v2 ? [
  '# ハーネス改善提案（最新号）',
  '',
  `対象号: ${latest.issue} ／ 生成: ${new Date().toISOString().slice(0, 10)} ／ 出典: ${latest.issue}.html`,
  '',
  '公式のバグ修正・新機能・既定値の変更を材料に、いまのハーネスをどう変えると',
  '良くなるかを、公式一次情報の裏取り付きで提案したもの。ハーネスのどこに効くかを',
  '言えない新機能は載せない。学習カットオフ以降の変化はここに載る。',
  '提案は候補であり、採用済みのルールではない。関連する話題が出たら、記憶より先に',
  '参照して判断材料にするが、採用するかは別に判断する。',
  '',
] : [
  '# AI自己更新・再判定レーダー（最新号）',
  '',
  `対象号: ${latest.issue} ／ 生成: ${new Date().toISOString().slice(0, 10)} ／ 出典: ${latest.issue}.html`,
  '',
  'これは新機能カタログではない。**AIが過去に出した「不可・複雑・保留」の判断を、',
  '公式一次情報で再判定した差分**。学習カットオフ以降の変化はここに載る。',
  '再判定は候補であり、採用済みのルールではない。関連する話題が出たら、記憶より先に',
  '参照して判断材料にするが、採用するかは別に判断する。',
  '',
];

if (!latest.items.length) {
  lines.push(v2
    ? '**今週、ハーネスに効く更新なし。** 公式一次情報を確認した結果であって、確認していないのではない。'
    : '**今週、判断を変える更新なし。** 公式一次情報を確認した結果であって、確認していないのではない。', '');
}

for (const item of latest.items) lines.push(...renderRecheckItemLines(item));

const total = issues.reduce((sum, i) => sum + i.items.length, 0);
// radar を載せ始めた号より後で radar が無い号は、判断していないのではなく「確認していない」。
const unverified = files
  .map((f) => f.replace('.html', ''))
  .filter((d) => d > issues[0].issue && !issues.some((i) => i.issue === d));

lines.push('---', '', `過去号の${v2 ? '提案・再判定' : '再判定'}:${issues.map((i) => i.issue).join(', ')}（各 \`<号>.html\` 内）／通算 ${total} 件`, '');
if (unverified.length) {
  lines.push(`**未確認の号: ${unverified.join(', ')}。** この週は再判定を行っていない（該当が無かったのではない）。`, '');
}

const out = lines.join('\n');
await writeFile('latest-recheck.md', out, 'utf8');
console.log(`latest-recheck.md を書き出しました（${latest.issue} / ${latest.items.length}件 / ${out.length}文字）`);

// Claude 以外の注入用 Markdown（リポ内に置くだけ。~/.codex 等への書き込みや注入経路への接続はしない）。
// recheck/<agent>/ が実在するときだけ作る。無いのに「未確認」ファイルを増やさない（現状 codex は書き手が無い）。
// 最新号は実在する号（<号>.html）から決める。提案が除外された号を飛ばして古い号を最新に見せない。
const EMIT_AGENTS = ['codex'];
const newest = latestIssue(files.map((f) => f.replace('.html', '')));
for (const agent of EMIT_AGENTS) {
  if (!(await stat(`recheck/${agent}`).then((s) => s.isDirectory(), () => false))) continue;
  const failures = [...agentRecheck.failures, ...agentStatuses.failures].filter((f) => f.agent === agent && f.issue === newest);
  const agentOut = renderAgentRecheckMd(agent, {
    issue: newest,
    recheck: agentRecheck.byAgent.get(agent)?.get(newest),
    status: agentStatuses.byAgent.get(agent)?.get(newest),
    failures,
  });
  await writeFile(`latest-recheck-${agent}.md`, agentOut, 'utf8');
  console.log(`latest-recheck-${agent}.md を書き出しました（${newest}）`);
}

// 既存の一コマンド導線を保ち、再判定と案件逆引きを同時に更新する。
await import('./emit-work-reverse-index.mjs');
