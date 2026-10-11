// 段1（機械）。discovery/<号>.json を読み取り専用の入力として、
// toolWatch チャンネル × Codex/OpenAI 対象語で候補へ印を付ける。
//
// これは採否のルールではなく取りこぼしを減らす拾い網。
// 採否は段2で「次のセッションの振る舞いが変わるか」を公式一次情報で判定する。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { youtubeChannels } from '../youtube-channels.mjs';

export const TARGET_PATTERN = /codex|openai|chatgpt|gpt|コードエックス|オープン(?:ai|ＡＩ|エーアイ)/i;

const REQUIRED = ['channel', 'videoId', 'title', 'url', 'published'];

export function isTargetTitle(title) {
  return TARGET_PATTERN.test(String(title ?? ''));
}

export function markCandidates(candidates, channels = youtubeChannels) {
  const watched = new Set(channels.filter((c) => c.toolWatch).map((c) => c.label));
  return candidates.filter((candidate) => {
    if (!watched.has(candidate?.channel)) return false;
    const missing = REQUIRED.filter((key) => !candidate[key]);
    if (missing.length) {
      throw new Error(`candidate is missing ${missing.join(', ')}: ${JSON.stringify(candidate)}`);
    }
    return isTargetTitle(candidate.title);
  });
}

export async function markIssue(issue, { dir = 'discovery' } = {}) {
  const raw = JSON.parse(await readFile(`${dir}/${issue}.json`, 'utf8'));
  if (!Array.isArray(raw?.candidates)) {
    throw new Error(`${dir}/${issue}.json に candidates 配列がありません`);
  }
  return markCandidates(raw.candidates);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issue = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue ?? '')) {
    console.error('usage: node codex-update/watch.mjs YYYY-MM-DD');
    process.exitCode = 2;
  } else {
    const marked = await markIssue(issue);
    console.log(JSON.stringify(marked, null, 2));
    console.error(`印: ${marked.length} 件（段2で物差し判定と裏取りが必要）`);
  }
}
