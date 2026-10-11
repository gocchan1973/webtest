// 段1（機械）。discovery/<号>.json を読み取り専用の入力として、
// toolWatch チャンネル × 対象語 で候補へ印を付ける。
//
// ここは採否のルールではなく「取りこぼしを減らす拾い網」。
// 採否は段2（Claude が物差しで判定し公式一次情報で裏取りする）が決める。
//
// 更新語との AND を入れていない。2026-09-06 号の ATI 6本を実測したところ、
// AND だと「Claude Code の auto mode が破られる」が落ちる。これは既定の
// 安全性が変わる事実で拾うべきもの。日本語のタイトルは「アップデート」と
// 書かずに「破られる」「終了」「引き上げ」で更新を表すため、更新語の列挙は
// 必ず穴が空く。RSS が title と url しか返さないことも、段1を厳しくしない理由。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { youtubeChannels } from '../youtube-channels.mjs';

export const TARGET_PATTERN = /claude|anthropic|クロード|アンソロピック/i;

const REQUIRED = ['channel', 'videoId', 'title', 'url', 'published'];

export function isTargetTitle(title) {
  return TARGET_PATTERN.test(String(title ?? ''));
}

export function markCandidates(candidates, channels = youtubeChannels) {
  const watched = new Set(channels.filter((c) => c.toolWatch).map((c) => c.label));
  return candidates.filter((candidate) => {
    if (!watched.has(candidate?.channel)) return false;
    // 監視対象だけ検証する。本命の収集スキーマが変わったら黙って落とさず止める。
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
    console.error('usage: node claude-update/watch.mjs YYYY-MM-DD');
    process.exitCode = 2;
  } else {
    const marked = await markIssue(issue);
    console.log(JSON.stringify(marked, null, 2));
    console.error(`印: ${marked.length} 件（段2で物差し判定と裏取りが必要）`);
  }
}
