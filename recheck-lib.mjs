// 再判定（ハーネス改善提案）の検証ロジック。build.mjs と emit-recheck.mjs が共有する。
// 段階0: build.mjs から切り出し（挙動不変）。build.mjs は再 export する。
import { readdir, readFile } from 'node:fs/promises';
import { requiredSources } from './sources.mjs';

// 再判定レーダーの項目は recheck/<号>.json が正本。週次タスクがここへ直接書く。
// ファイルが無い号 = まだ確認していない。空配列 = 公式一次情報を確認して該当なし。
const sourceUrlById = new Map(requiredSources.map((source) => [source.id, source.url]));

// 出典は URL 直書きか {sourceId} で書ける。後者は sources.mjs から消えると build が止まる。
function resolveRecheckLink([label, target], where) {
  if (typeof target === 'string') return [label, target];
  const url = sourceUrlById.get(target?.sourceId);
  if (!url) throw new Error(`${where}: sources.mjs に無い sourceId です: ${target?.sourceId}`);
  return [label, url];
}

// この号以降は「ハーネス改善提案」形式(v2)。未満は旧「再判定」形式(v1)で、過去号へ遡って書き換えない。
export const HARNESS_PROPOSAL_SINCE = '2026-09-27';
export const HARNESS_FIELD_LABELS = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
export const HARNESS_STATUSES = ['改善提案', '回避策の撤去', '追従が必要'];
// 段階2: 任意フィールド agent（既定 claude）と alsoAffects（既定 []）。既存ファイルは agent 無し = claude。
export const RECHECK_AGENTS = ['claude', 'codex', 'agy', 'copilot', 'hermes'];
export const RECHECK_ALSO_AFFECTS_MAX = 5;
export const isHarnessProposalIssue = (issue) => typeof issue === 'string' && issue >= HARNESS_PROPOSAL_SINCE;
// 枠の名前は号の形式で決まる。紙面の見出しと knowledge の記事一覧で同じ名前を使う。
export const recheckSectionLabel = (issue) => isHarnessProposalIssue(issue) ? 'ハーネス改善提案' : 'AI自己更新・再判定レーダー';

export function validateRecheck(items, file, issue = file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]) {
  if (!Array.isArray(items)) throw new Error(`${file}: 配列ではありません`);
  const v2 = isHarnessProposalIssue(issue);
  return items.map((item, index) => {
    const where = `${file}[${index}]`;
    for (const key of ['status', 'title']) {
      if (typeof item?.[key] !== 'string' || !item[key].trim()) throw new Error(`${where}: ${key} が空です`);
    }
    if (!Array.isArray(item.fields) || !item.fields.length) throw new Error(`${where}: fields が空です`);
    if (!Array.isArray(item.links) || !item.links.length) throw new Error(`${where}: links が空です（公式一次情報の出典は必須）`);
    const fields = item.fields.map((field) => {
      if (!Array.isArray(field) || field.length !== 2 || typeof field[1] !== 'string') {
        throw new Error(`${where}: fields は [ラベル, 値] の組で書きます`);
      }
      return field;
    });
    const agent = item.agent === undefined ? 'claude' : item.agent;
    if (typeof agent !== 'string' || !RECHECK_AGENTS.includes(agent)) {
      throw new Error(`${where}: agent は ${JSON.stringify(RECHECK_AGENTS)} のいずれかです（省略時 claude。実際: ${JSON.stringify(item.agent)}）`);
    }
    const alsoAffects = item.alsoAffects === undefined ? [] : item.alsoAffects;
    if (!Array.isArray(alsoAffects)) throw new Error(`${where}: alsoAffects は配列で書きます（実際: ${JSON.stringify(item.alsoAffects)}）`);
    if (alsoAffects.length > RECHECK_ALSO_AFFECTS_MAX) throw new Error(`${where}: alsoAffects は最大${RECHECK_ALSO_AFFECTS_MAX}件です`);
    if (alsoAffects.some((a) => typeof a !== 'string' || !RECHECK_AGENTS.includes(a) || a === agent) || new Set(alsoAffects).size !== alsoAffects.length) {
      throw new Error(`${where}: alsoAffects は agent（${agent}）以外の ${JSON.stringify(RECHECK_AGENTS)} から重複なしで書きます（実際: ${JSON.stringify(item.alsoAffects)}）`);
    }
    if (item.work !== undefined && (!Array.isArray(item.work) || item.work.some((k) => typeof k !== 'string' || !k.trim()))) {
      throw new Error(`${where}: work は空でない文字列の配列で書きます`);
    }
    if (item.workComment !== undefined && typeof item.workComment !== 'string') {
      throw new Error(`${where}: workComment は文字列で書きます`);
    }
    const result = {
      status: item.status,
      title: item.title,
      fields,
      links: item.links.map((link) => resolveRecheckLink(link, where)),
      agent,
      alsoAffects,
    };
    if (item.work !== undefined) result.work = item.work;
    if (item.workComment !== undefined) result.workComment = item.workComment;
    if (v2) {
      const labels = fields.map(([label]) => label);
      if (labels.length !== HARNESS_FIELD_LABELS.length || labels.some((label, i) => label !== HARNESS_FIELD_LABELS[i])) {
        throw new Error(`${where}: fields のラベルは順に ${JSON.stringify(HARNESS_FIELD_LABELS)} でなければなりません（実際: ${JSON.stringify(labels)}）`);
      }
      if (!Array.isArray(item.harness) || !item.harness.length || item.harness.some((h) => typeof h !== 'string' || !h.trim())) {
        throw new Error(`${where}: harness は空でない文字列の配列で書きます（対象ファイルパス等）`);
      }
      if (!HARNESS_STATUSES.includes(item.status)) {
        throw new Error(`${where}: status は ${JSON.stringify(HARNESS_STATUSES)} のいずれかでなければなりません（実際: ${JSON.stringify(item.status)}）`);
      }
      result.harness = item.harness;
    }
    return result;
  });
}

// recheck/<号>.json を全件読み、validateRecheck を通した Map(号 -> 項目[]) を返す。
// 検証失敗は throw（build.mjs もこの関数を使う。二重の読み込みは持たない）。
export async function loadRecheckByIssue(dir = new URL('./recheck/', import.meta.url)) {
  const byIssue = new Map();
  for (const file of (await readdir(dir)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const items = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
    const issueDate = file.replace('.json', '');
    const validated = validateRecheck(items, file, issueDate);
    // Claude 直下に他エージェントの項目を置かせない（Claude の latest-recheck.md へ誤配信される）。
    // 他エージェントの提案は recheck/<agent>/ へ。agent は省略か claude のみ許可。
    const wrong = validated.findIndex((item) => item.agent !== 'claude');
    if (wrong >= 0) {
      throw new Error(`${file}[${wrong}]: recheck/ 直下は Claude の提案です。agent は claude か省略のみ（実際: ${JSON.stringify(validated[wrong].agent)}）。他エージェントの提案は recheck/${validated[wrong].agent}/ に置きます`);
    }
    byIssue.set(issueDate, validated);
  }
  return byIssue;
}

// 段階3: recheck/<agent>/<号>.json（Claude 以外のエージェントの提案）を読む。
// Claude 本体（recheck/<号>.json）は不正なら throw で止める（loadRecheckByIssue）。
// こちらは書き手が別で、1つの不正で TechNews 全体と他エージェントを止めない。
// 不正なファイルは警告のうえ丸ごと除外し、failures に残す（{agent, file, issue, reason}。§3(d) の checkFailures へ繋げる形）。
// 黙って捨てない: 号の名前でない .json、未知の agent ディレクトリ、claude ディレクトリ（Claude は直下）も failures に入れる。
// byAgent は Map(agent -> Map(号 -> 項目[]))。agent 省略の項目は dir 名の agent になり、明記が dir 名と違えば不正。
export async function loadAgentRecheck(dir = new URL('./recheck/', import.meta.url)) {
  const byAgent = new Map();
  const failures = [];
  const fail = (agent, file, issue, reason) => failures.push({ agent, file, issue, reason });
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { byAgent, failures };
    throw error;
  }
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const agent = entry.name;
    if (agent === 'claude' || !RECHECK_AGENTS.includes(agent)) {
      fail(agent, agent, null, agent === 'claude'
        ? 'claude の提案は recheck/<号>.json（直下）に置く。recheck/claude/ は読まない'
        : `未知のエージェントのディレクトリです（${JSON.stringify(RECHECK_AGENTS.filter((a) => a !== 'claude'))} のいずれか）`);
      continue;
    }
    const subdir = new URL(`${agent}/`, dir);
    let names;
    try {
      names = (await readdir(subdir)).sort();
    } catch (error) {
      fail(agent, agent, null, `ディレクトリを読めませんでした: ${error.message}`);
      continue;
    }
    for (const name of names) {
      const file = `${agent}/${name}`;
      const m = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) {
        // <号>.status.json は別目的の状態ファイル（§3(d)）。それ以外の .json は号の名前の書き損じを疑う。
        if (name.endsWith('.json') && !/^\d{4}-\d{2}-\d{2}\.status\.json$/.test(name)) {
          fail(agent, file, null, '号の名前（YYYY-MM-DD.json）ではない .json です。読み込んでいません');
        }
        continue;
      }
      const issue = m[1];
      try {
        const raw = JSON.parse(await readFile(new URL(name, subdir), 'utf8'));
        const items = Array.isArray(raw)
          ? raw.map((it) => (it && typeof it === 'object' && !Array.isArray(it) && it.agent === undefined ? { ...it, agent } : it))
          : raw;
        const validated = validateRecheck(items, file, issue);
        const mismatch = validated.findIndex((it) => it.agent !== agent);
        if (mismatch >= 0) throw new Error(`${file}[${mismatch}]: agent が ディレクトリ名（${agent}）と違います（実際: ${JSON.stringify(validated[mismatch].agent)}）`);
        if (!byAgent.has(agent)) byAgent.set(agent, new Map());
        byAgent.get(agent).set(issue, validated);
      } catch (error) {
        fail(agent, file, issue, error.message);
      }
    }
  }
  return { byAgent, failures };
}

export function warnAgentRecheckFailures(failures, log = console.warn) {
  for (const f of failures) log(`[warn] 確認失敗（${f.agent}）: ${f.file} を除外しました — ${f.reason}`);
}

// ---- 状態（確認日・対象期間・確認失敗）。設計メモ §3(d)・§9 ----
// <号>.status.json は「出典を確認した側」だけが書く。build 時の検証失敗（loadAgentRecheck の failures）は
// ここへ書き戻さない。毎回の build で計算し直す派生物であり、build が status の書き手になるのを避ける。
// 古さの閾値（日）。根拠なしの仮置き。運用実績が出てから決め直す。
export const STALE_DAYS = 14;
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const isRealDate = (text) => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

// スキーマ: {schema:1, agent, issue, checkedAt(ISO日時・タイムゾーン付き), period:{start,end}(YYYY-MM-DD), sources:[{id, ok, reason?}]}
// checkFailures は別に持たず sources の ok:false から導く（戻り値に付ける）。
export function validateRecheckStatus(raw, file, { agent, issue }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file}: オブジェクトではありません`);
  if (raw.schema !== 1) throw new Error(`${file}: schema は 1 です（実際: ${JSON.stringify(raw.schema)}）`);
  if (raw.agent !== agent) throw new Error(`${file}: agent は ${agent} です（実際: ${JSON.stringify(raw.agent)}）`);
  if (raw.issue !== issue) throw new Error(`${file}: issue は ${issue} です（実際: ${JSON.stringify(raw.issue)}）`);
  if (typeof raw.checkedAt !== 'string' || !ISO_WITH_TZ.test(raw.checkedAt) || Number.isNaN(Date.parse(raw.checkedAt))) {
    throw new Error(`${file}: checkedAt はタイムゾーン付きの ISO 日時です（例 2026-10-05T09:00:00+09:00。実際: ${JSON.stringify(raw.checkedAt)}）`);
  }
  const { period } = raw;
  if (!period || !isRealDate(period.start) || !isRealDate(period.end) || period.start > period.end) {
    throw new Error(`${file}: period は {start, end}（YYYY-MM-DD・start <= end）です（実際: ${JSON.stringify(period)}）`);
  }
  if (!Array.isArray(raw.sources) || !raw.sources.length) throw new Error(`${file}: sources が空です（確認した出典が無い状態を「確認済み」にしない）`);
  const seen = new Set();
  const sources = raw.sources.map((src, i) => {
    const where = `${file}.sources[${i}]`;
    if (!src || typeof src.id !== 'string' || !src.id.trim()) throw new Error(`${where}: id が空です`);
    if (typeof src.ok !== 'boolean') throw new Error(`${where}: ok は true / false です`);
    if (src.reason !== undefined && typeof src.reason !== 'string') throw new Error(`${where}: reason は文字列です`);
    if (seen.has(src.id)) throw new Error(`${where}: id が重複しています: ${src.id}`);
    seen.add(src.id);
    return src.reason === undefined ? { id: src.id, ok: src.ok } : { id: src.id, ok: src.ok, reason: src.reason };
  });
  return {
    schema: 1, agent, issue, checkedAt: raw.checkedAt, period: { start: period.start, end: period.end },
    sources, checkFailures: sources.filter((src) => !src.ok),
  };
}

// recheck/<agent>/<号>.status.json と、Claude 直下の recheck/<号>.status.json を読む。
// 不正は除外して failures に残す（throw しない。書き戻しもしない）。未知の agent ディレクトリは loadAgentRecheck 側が報告する。
export async function loadRecheckStatuses(dir = new URL('./recheck/', import.meta.url)) {
  const byAgent = new Map();
  const failures = [];
  const readOne = async (agent, base, name, file) => {
    const issue = name.match(/^(\d{4}-\d{2}-\d{2})\.status\.json$/)?.[1];
    if (!issue) return;
    try {
      const status = validateRecheckStatus(JSON.parse(await readFile(new URL(name, base), 'utf8')), file, { agent, issue });
      if (!byAgent.has(agent)) byAgent.set(agent, new Map());
      byAgent.get(agent).set(issue, status);
    } catch (error) {
      failures.push({ agent, file, issue, reason: error.message });
    }
  };
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { byAgent, failures };
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile()) await readOne('claude', dir, entry.name, entry.name);
    else if (entry.isDirectory() && entry.name !== 'claude' && RECHECK_AGENTS.includes(entry.name)) {
      const subdir = new URL(`${entry.name}/`, dir);
      let names = [];
      try { names = (await readdir(subdir)).sort(); } catch (error) {
        failures.push({ agent: entry.name, file: entry.name, issue: null, reason: `ディレクトリを読めませんでした: ${error.message}` });
      }
      for (const name of names) await readOne(entry.name, subdir, name, `${entry.name}/${name}`);
    }
  }
  return { byAgent, failures };
}

// 状態を導く純関数。recheck = 検証済みの項目配列（無ければ undefined）、status = 検証済みの status（無ければ undefined）、
// failures = その agent・号の読み込み失敗（.status.json 以外の失敗 = 提案 JSON が検証除外された）。
// 状態: 未確認 / 確認不能 / 確認失敗 / 部分確認 / 該当なし / N件 / 状態不明
export function deriveCheckState(agent, issue, { recheck, status, failures = [] } = {}) {
  const jsonFailed = failures.some((f) => !f.file.endsWith('.status.json'));
  const statusFailed = failures.some((f) => f.file.endsWith('.status.json'));
  const count = Array.isArray(recheck) ? recheck.length : null;
  const result = (state, detail) => ({ agent, issue, state, count, detail, checkedAt: status?.checkedAt ?? null });
  if (jsonFailed) return result('確認不能', '提案 JSON が検証で除外された。内容は読めていない（提案が無いのではない）');
  if (recheck === undefined) {
    if (status) return result('状態不明', 'status.json はあるが提案 JSON が無い。確認の結果を判定できない');
    if (statusFailed) return result('状態不明', 'status.json が不正で除外された。確認の結果を判定できない');
    return result('未確認', 'この号は確認していない（該当が無かったのではない）');
  }
  if (!status) {
    return result('状態不明', statusFailed
      ? 'status.json が不正で除外された。確認日・出典の成否が分からない'
      : '提案 JSON はあるが status.json が無い（旧形式）。いつ・どの出典を確認したか分からない');
  }
  const failed = status.sources.filter((src) => !src.ok).length;
  if (failed === status.sources.length) return result('確認失敗', '確認した全出典が失敗した。提案が無いのではなく、確認できていない');
  if (failed > 0) return result('部分確認', `出典 ${status.sources.length} 件のうち ${failed} 件が失敗。確認できた範囲の結果で、残りは未確認（[] でも「該当なし」ではない）`);
  return result(count === 0 ? '該当なし' : `${count}件`, count === 0 ? '予定の出典をすべて確認し、該当する提案は無かった' : `予定の出典をすべて確認し、提案 ${count} 件`);
}

// 古さは状態と別軸。{days, stale}。status が無ければ null。
export function checkAge(status, now = new Date(), thresholdDays = STALE_DAYS) {
  if (!status) return null;
  const days = Math.floor((now.getTime() - Date.parse(status.checkedAt)) / 86400000);
  return { days, stale: days > thresholdDays };
}

// 最新号は「実在する号」の一覧から決める。提案が除外された号を飛ばして古い号が最新に見えるのを防ぐ。
export const latestIssue = (issues) => issues.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().at(-1) ?? null;

// 1項目の Markdown 行（latest-recheck.md と共通）。
export function renderRecheckItemLines(item) {
  const lines = [`## [${item.status}] ${item.title}`, ''];
  const harness = item.harness ?? [];
  if (harness.length) lines.push(`- **対象**: ${harness.map((h) => `\`${h}\``).join(', ')}`);
  for (const [label, value] of item.fields) lines.push(`- **${label}**: ${value}`);
  if (item.links.length) lines.push(`- 出典: ${item.links.map(([t, u]) => `[${t}](${u})`).join(' / ')}`);
  lines.push('');
  return lines;
}

const AGENT_LABELS = { claude: 'Claude', codex: 'Codex', agy: 'Agy', copilot: 'Copilot', hermes: 'Hermes' };

// Claude 以外のエージェント用の注入 Markdown（リポ内に置くだけ。~/ 側への書き込み・注入経路は別）。
// 状態行を必ず出す。提案が実在するときだけ項目を出し、0件・未確認・確認不能では状態のみ（提案を捏造しない）。
export function renderAgentRecheckMd(agent, { issue, recheck, status, failures = [], now = new Date() }) {
  const label = AGENT_LABELS[agent] ?? agent;
  const derived = deriveCheckState(agent, issue, { recheck, status, failures });
  const lines = [
    `# ハーネス改善提案（${label}・最新号）`, '',
    `対象号: ${issue} ／ 生成: ${now.toISOString().slice(0, 10)}`, '',
    '提案は候補であり、採用済みのルールではない。採用するかは別に判断する。', '',
    `状態: ${derived.state} — ${derived.detail}`,
  ];
  if (status) {
    lines.push(`- 確認日時: ${status.checkedAt} ／ 対象期間: ${status.period.start} 〜 ${status.period.end}`);
    lines.push(`- 出典: ${status.sources.map((src) => `${src.id}${src.ok ? '' : `（失敗${src.reason ? `: ${src.reason}` : ''}）`}`).join(', ')}`);
    const age = checkAge(status, now);
    if (age.stale) lines.push(`- **古い確認**: 確認から ${age.days} 日（目安 ${STALE_DAYS} 日。仮置き）。現在の状況とは限らない`);
  }
  for (const f of failures) lines.push(`- 読み込み失敗: ${f.file} — ${f.reason}`);
  lines.push('');
  const showItems = Array.isArray(recheck) && recheck.length && derived.state !== '確認不能' && derived.state !== '確認失敗';
  if (showItems) for (const item of recheck) lines.push(...renderRecheckItemLines(item));
  return lines.join('\n');
}

// finalize.mjs の warnings 用。build が除外した他エージェントのファイルを、呼び出し側へ伝える。
export const agentRecheckWarnings = (failures) =>
  failures.map((f) => `確認失敗（${f.agent}）: ${f.file} を除外しました — ${f.reason}`);
