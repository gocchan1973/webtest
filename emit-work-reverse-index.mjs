// relevance.mjs と生成済みHTMLから、Linear Issue／Project起点の逆引き索引を作る。
// relevance.mjs が正本、このMarkdownはAIが安く検索するための派生物。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relevance, work as workMap } from './relevance.mjs';

const decode = (value) => value
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .trim();

const files = (await readdir('.')).filter((name) => /^\d{4}-\d{2}-\d{2}\.html$/.test(name)).sort();
const byWork = new Map();
const snapshots = [];

for (const file of files) {
  const html = await readFile(file, 'utf8');
  snapshots.push(...[...html.matchAll(/data-linear-snapshot="(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1]));

  for (const match of html.matchAll(/<article\b[^>]*data-article-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)) {
    const [, articleId, article] = match;
    const connection = relevance[articleId];
    if (!connection?.links?.length) continue;

    const title = decode(article.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? articleId);
    for (const [workLabel, workUrl] of connection.links) {
      const group = byWork.get(workUrl) ?? { label: workLabel, url: workUrl, entries: [] };
      group.entries.push({
        issue: file.replace('.html', ''),
        file,
        articleId,
        title,
        state: connection.state,
        comment: connection.comment,
      });
      byWork.set(workUrl, group);
    }
  }
}

// 再判定レーダーは枠ごと1記事なので、relevance だけでは項目ごとに案件を分けられない。
// recheck/<号>.json の項目が work キーを持つ場合、その項目単位で逆引きへ載せる。
for (const file of (await readdir('recheck')).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
  const issue = file.replace('.json', '');
  for (const item of JSON.parse(await readFile(`recheck/${file}`, 'utf8'))) {
    for (const key of item.work ?? []) {
      const target = workMap[key];
      if (!target) throw new Error(`recheck/${file}: relevance.mjs の work に無いキーです: ${key}`);
      const [workLabel, workUrl] = target;
      const group = byWork.get(workUrl) ?? { label: workLabel, url: workUrl, entries: [] };
      group.entries.push({
        issue,
        file: `${issue}.html`,
        articleId: 'ai-self-update-recheck',
        title: `再判定：${item.title}`,
        state: item.status,
        comment: item.workComment ?? item.title,
      });
      byWork.set(workUrl, group);
    }
  }
}

if (!byWork.size) throw new Error('既存案件へ接続された記事が見つかりません。build.mjs を実行してください。');

const snapshot = snapshots.sort().at(-1) ?? '不明';
const groups = [...byWork.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja', { numeric: true }));
const lines = [
  '# TechNews × 既存案件 逆引き',
  '',
  `Linear照合: ${snapshot}時点 ／ 生成: ${new Date().toISOString().slice(0, 10)}`,
  '',
  'Linear Issue番号またはProject名から、関連するTechNews・再判定・導入コメントへ戻るためのAI向け索引。',
  '`relevance.mjs` が正本で、このファイルは週次生成される派生物。現在状態が必要な場合だけLinearを再確認する。',
  '',
];

let connectionCount = 0;
for (const group of groups) {
  lines.push(`## ${group.label}`, '', `- Linear: ${group.url}`, '');
  for (const entry of group.entries.sort((a, b) => b.issue.localeCompare(a.issue) || a.title.localeCompare(b.title, 'ja'))) {
    connectionCount += 1;
    lines.push(`- [${entry.issue}号](${entry.file}) — **${entry.title}** \`${entry.articleId}\` — ${entry.state}`);
    lines.push(`  - 接続理由: ${entry.comment}`);
  }
  lines.push('');
}

lines.push('---', '', `案件・Project: ${groups.length}件 ／ 記事接続: ${connectionCount}件`, '');

const output = lines.join('\n');
await writeFile('work-reverse-index.md', output, 'utf8');
console.log(`work-reverse-index.md を書き出しました（${groups.length}案件 / ${connectionCount}接続 / ${output.length}文字）`);
