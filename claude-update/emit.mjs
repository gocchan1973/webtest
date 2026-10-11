// claude-update の派生物を生成する。
// 使い方: node claude-update/emit.mjs
//
// 自分のフォルダの中だけを書く。本命の生成物には一切触らない。
// 検証に落ちたら書かずに止める（壊れた派生物を注入させないため）。
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadAll } from './load.mjs';
import { renderMarkdown } from './render-md.mjs';
import { renderHtml } from './render-html.mjs';

export async function emit(dir = 'claude-update') {
  const data = await loadAll(dir);
  // 片方だけが先へ進むと、Claude が読む latest.md と人が見る index.html がズレる。
  // 生成を全て済ませてから書き、途中で落ちたらどちらも書かれないようにする。
  const markdown = renderMarkdown(data);
  const html = renderHtml(data);
  await writeFile(`${dir}/latest.md`, markdown, 'utf8');
  await writeFile(`${dir}/index.html`, html, 'utf8');
  return {
    factCount: data.facts.filter((f) => f.status === 'active').length,
    hitCount: data.hits.length,
    issueCount: data.issues.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await emit();
  console.log(`claude-update: 有効な事実 ${r.factCount} 件 / 参照記録 ${r.hitCount} 件 / ${r.issueCount} 号`);
}
