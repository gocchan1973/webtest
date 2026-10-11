// relevance.mjs の「記事→Linear」を反転し、「Linear/案件→関連する更新」の逆引きを出す。
// 目的: Issue や既存プロジェクトを触っているときに、関連する更新へ自分で気づけるようにする。
// 使い方: node emit-work-index.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relevance } from './relevance.mjs';

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

// 各号のHTMLから 記事ID → {タイトル, 号} を集める
const titles = new Map();
for (const file of (await readdir('.')).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort()) {
  const html = await readFile(file, 'utf8');
  for (const [, id, head] of html.matchAll(/<article data-article-id="(.*?)">([\s\S]*?)<\/article>/g)) {
    const title = head.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1];
    if (title) titles.set(id, { title: decode(title), issue: file.replace('.html', '') });
  }
}

// Linear/案件 → 記事 の逆引きを組む
const byWork = new Map();
for (const [articleId, entry] of Object.entries(relevance)) {
  for (const link of entry.links ?? []) {
    if (!link) continue;
    const [label, url] = link;
    if (!byWork.has(label)) byWork.set(label, { url, items: [] });
    byWork.get(label).items.push({ articleId, state: entry.state, comment: entry.comment, ...titles.get(articleId) });
  }
}

// 件数が多い順（＝更新が集まっている案件ほど上）
const sorted = [...byWork.entries()].sort((a, b) => b[1].items.length - a[1].items.length || a[0].localeCompare(b[0]));

const priority = { '設計へ反映': 0, '導入候補': 1, '小さく試験': 2, '継続監視': 3 };
const lines = [
  '# 案件・Linear からの逆引き索引',
  '',
  `生成: ${new Date().toISOString().slice(0, 10)} ／ 出典: relevance.mjs + 各号HTML`,
  '',
  '**使い方**: Linear の Issue や既存プロジェクトの作業に入る前にここを引く。',
  '該当があれば、その更新が今の作業に影響するかを判断し、関係するならユーザーへ提案する。',
  '該当が無ければ何も言わない（無理に結びつけない）。',
  '',
];

for (const [label, { url, items }] of sorted) {
  lines.push(`## ${label}`, '', `- 参照: ${url}`);
  items.sort((a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9) || (b.issue ?? '').localeCompare(a.issue ?? ''));
  for (const item of items) {
    lines.push(`- **[${item.state}]** ${item.title ?? item.articleId}（${item.issue ?? '号不明'}）`);
    lines.push(`  - ${item.comment}`);
  }
  lines.push('');
}

const out = lines.join('\n');
await writeFile('work-index.md', out, 'utf8');
console.log(`work-index.md を書き出しました（${sorted.length}案件 / ${Object.keys(relevance).length}記事 / ${out.length}文字）`);
