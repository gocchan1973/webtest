// codex-update の保存物を読み、壊れた状態で先へ進ませない。
import { readdir, readFile } from 'node:fs/promises';

const DISPOSITIONS = new Set(['accepted', 'rejected', 'pending']);
const EFFECTS = new Set(['changed', 'confirmed', 'rejected']);
const STATUSES = new Set(['active', 'superseded']);
const FACT_FIELDS = ['id', 'fact', 'behavior', 'scope', 'source', 'verified', 'status'];
const MANAGED_MARKER_PATTERN = /<!--\s*codex-update:(?:start|end)\s*-->/i;

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${path} を読めません: ${e.message}`);
  }
};

const isHttpUrl = (value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export async function loadIssues(dir = 'codex-update') {
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

export async function loadFacts(dir = 'codex-update') {
  const facts = await readJson(`${dir}/facts.json`, []);
  if (!Array.isArray(facts)) throw new Error(`${dir}/facts.json は配列であること`);
  return facts;
}

export async function loadHits(dir = 'codex-update') {
  let text;
  try {
    text = await readFile(`${dir}/hits.jsonl`, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const hits = [];
  for (const [index, line] of text.split('\n').entries()) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed = JSON.parse(t);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('オブジェクトではない');
      if (typeof parsed.item !== 'string' || !parsed.item.trim()) throw new Error('item が空');
      if (typeof parsed.topic !== 'string' || !parsed.topic.trim()) throw new Error('topic が空');
      if (!EFFECTS.has(parsed.effect)) throw new Error('effect が不正');
      if (typeof parsed.ts !== 'string' || Number.isNaN(Date.parse(parsed.ts))) throw new Error('ts が有効な日時ではない');
      if (parsed.note !== undefined && typeof parsed.note !== 'string') throw new Error('note が文字列ではない');
      hits.push(parsed);
    } catch (error) {
      throw new Error(`${dir}/hits.jsonl ${index + 1} 行目を読めません: ${error.message}`);
    }
  }
  return hits;
}

export function validate({ issues, facts, hits }) {
  const ids = new Set();
  for (const fact of facts) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw new Error('fact はオブジェクトであること');
    if (MANAGED_MARKER_PATTERN.test(JSON.stringify(fact))) {
      throw new Error(`fact ${fact.id ?? '(id なし)'}: codex-update 管理マーカーを含めないこと`);
    }
    for (const field of FACT_FIELDS) {
      if (!fact[field]) throw new Error(`fact ${fact.id ?? '(id なし)'}: ${field} が空。物差しを満たさない事実は採らない`);
    }
    if (!isHttpUrl(fact.source)) throw new Error(`fact ${fact.id}: source は http(s) の公式一次情報 URL であること`);
    if (Number.isNaN(Date.parse(fact.verified))) throw new Error(`fact ${fact.id}: verified は日付であること`);
    if (fact.discoveredIn !== undefined && !Array.isArray(fact.discoveredIn)) {
      throw new Error(`fact ${fact.id}: discoveredIn は配列であること`);
    }
    for (const [index, discovery] of (fact.discoveredIn ?? []).entries()) {
      if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) {
        throw new Error(`fact ${fact.id}: discoveredIn[${index}] はオブジェクトであること`);
      }
      if (typeof discovery.issue !== 'string' || !discovery.issue.trim()) {
        throw new Error(`fact ${fact.id}: discoveredIn[${index}].issue が空`);
      }
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
      for (const field of ['videoId', 'channel', 'title', 'url', 'reason']) {
        if (!entry[field]) throw new Error(`${issue}: ${field} が空。候補の出典を残す`);
      }
      if (!isHttpUrl(entry.url)) throw new Error(`${issue} / ${entry.videoId}: url は http(s) であること`);
      if (!DISPOSITIONS.has(entry.disposition)) {
        throw new Error(`${issue} / ${entry.videoId}: disposition は accepted / rejected / pending`);
      }
      if (!Array.isArray(entry.facts)) throw new Error(`${issue} / ${entry.videoId}: facts は配列であること`);
      for (const id of entry.facts) {
        if (!ids.has(id)) throw new Error(`${issue} / ${entry.videoId}: 未知の fact id ${id}`);
      }
    }
  }
  for (const hit of hits) {
    if (hit.effect !== undefined && !EFFECTS.has(hit.effect)) {
      throw new Error(`hit ${hit.item ?? '(item なし)'}: effect は changed / confirmed / rejected`);
    }
    if (typeof hit.ts !== 'string' || Number.isNaN(Date.parse(hit.ts))) {
      throw new Error(`hit ${hit.item ?? '(item なし)'}: ts は有効な日時であること`);
    }
  }
  // hits の item は過去の fact を指すこともあるので参照切れを許す。
  return { factCount: facts.length, hitCount: hits.length };
}

export async function loadAll(dir = 'codex-update') {
  const data = {
    issues: await loadIssues(dir),
    facts: await loadFacts(dir),
    hits: await loadHits(dir),
  };
  validate(data);
  return data;
}
