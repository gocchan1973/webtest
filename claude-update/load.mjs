// claude-update の保存物を読み、壊れた状態で先へ進ませない。
//
// 検証を強めにしているのは、段2が Claude の手作業だから。
// 判断のばらつきは構造では消せないが、書き漏らしと参照切れは止められる。
import { readdir, readFile } from 'node:fs/promises';

const DISPOSITIONS = new Set(['accepted', 'rejected', 'pending']);
const STATUSES = new Set(['active', 'superseded']);
const FACT_FIELDS = ['id', 'fact', 'behavior', 'scope', 'source', 'verified', 'status'];

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${path} を読めません: ${e.message}`);
  }
};

export async function loadIssues(dir = 'claude-update') {
  let files;
  try {
    files = await readdir(`${dir}/issues`);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const names = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const issues = [];
  for (const name of names) {
    const entries = await readJson(`${dir}/issues/${name}`, []);
    if (!Array.isArray(entries)) throw new Error(`${dir}/issues/${name} は配列であること`);
    issues.push({ issue: name.replace('.json', ''), entries });
  }
  return issues;
}

export async function loadFacts(dir = 'claude-update') {
  const facts = await readJson(`${dir}/facts.json`, []);
  if (!Array.isArray(facts)) throw new Error(`${dir}/facts.json は配列であること`);
  return facts;
}

export async function loadHits(dir = 'claude-update') {
  let text;
  try {
    text = await readFile(`${dir}/hits.jsonl`, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  // 壊れた行は捨てる。record_recheck_hit.py の load() と同じ扱い。
  // 集計のために全体を止めない。
  return text.split('\n').flatMap((line) => {
    const t = line.trim();
    if (!t) return [];
    try {
      return [JSON.parse(t)];
    } catch {
      return [];
    }
  });
}

export function validate({ issues, facts, hits }) {
  const ids = new Set();
  for (const fact of facts) {
    for (const field of FACT_FIELDS) {
      if (!fact[field]) throw new Error(`fact ${fact.id ?? '(id なし)'}: ${field} が空。物差しを満たさない事実は採らない`);
    }
    if (fact.discoveredIn !== undefined && !Array.isArray(fact.discoveredIn)) {
      throw new Error(`fact ${fact.id}: discoveredIn は配列であること`);
    }
    if (!STATUSES.has(fact.status)) throw new Error(`fact ${fact.id}: status は active か superseded`);
    if (fact.status === 'superseded' && !fact.supersededBy) {
      throw new Error(`fact ${fact.id}: superseded なら supersededBy に後継の id を書く`);
    }
    if (ids.has(fact.id)) throw new Error(`duplicate fact id: ${fact.id}`);
    ids.add(fact.id);
  }
  for (const fact of facts) {
    if (fact.supersededBy && !ids.has(fact.supersededBy)) {
      throw new Error(`fact ${fact.id}: supersededBy ${fact.supersededBy} が facts.json に無い`);
    }
  }
  for (const { issue, entries } of issues) {
    for (const entry of entries) {
      if (!DISPOSITIONS.has(entry.disposition)) {
        throw new Error(`${issue} / ${entry.videoId}: disposition は accepted / rejected / pending`);
      }
      if (!entry.reason) throw new Error(`${issue} / ${entry.videoId}: reason が空。採否の理由を残す`);
      for (const id of entry.facts ?? []) {
        if (!ids.has(id)) throw new Error(`${issue} / ${entry.videoId}: 未知の fact id ${id}`);
      }
    }
  }
  // hits の item は過去の fact を指すこともあるので参照切れを許す。
  // 記録を消さずに残すため、ここでは件数だけ数える。
  return { factCount: facts.length, hitCount: hits.length };
}

export async function loadAll(dir = 'claude-update') {
  const data = {
    issues: await loadIssues(dir),
    facts: await loadFacts(dir),
    hits: await loadHits(dir),
  };
  validate(data);
  return data;
}
