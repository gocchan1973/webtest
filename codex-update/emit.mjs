// codex-update の派生物を生成する。検証に落ちたら何も書かない。
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { loadInjectionData } from './inject.mjs';
import { renderMarkdown } from './render-md.mjs';
import { renderIndexHtml, renderFactsHtml, renderIssueHtml } from './render-html.mjs';
import { syncGlobal } from './sync-global.mjs';
import { formatJapanDate } from './date.mjs';

const DEFAULT_DIR = fileURLToPath(new URL('.', import.meta.url));

export async function emit(dir = DEFAULT_DIR) {
  const data = await loadInjectionData(dir);
  const generated = formatJapanDate();
  const markdown = renderMarkdown({ ...data, generated });
  const indexHtml = renderIndexHtml({ ...data, generated });
  const factsHtml = renderFactsHtml({ ...data, generated });
  const issueHtml = data.issues.map(({ issue, entries }) => ({
    issue,
    html: renderIssueHtml({ issue, entries, generated }),
  }));
  await mkdir(`${dir}/articles`, { recursive: true });
  await writeFile(`${dir}/latest.md`, markdown, 'utf8');
  await writeFile(`${dir}/index.html`, indexHtml, 'utf8');
  await writeFile(`${dir}/articles/facts.html`, factsHtml, 'utf8');
  await Promise.all(issueHtml.map(({ issue, html }) => writeFile(`${dir}/articles/${issue}.html`, html, 'utf8')));
  return {
    factCount: data.facts.filter((f) => f.status === 'active').length,
    hitCount: data.hits.length,
    issueCount: data.issues.length,
  };
}

export function parseCliArgs(argv) {
  let sync = false;
  let targetPath;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sync-global') {
      sync = true;
    } else if (argv[i] === '--target') {
      targetPath = argv[++i];
      if (!targetPath || targetPath.startsWith('--')) throw new Error('--target の値がありません');
    } else {
      throw new Error(`不明な引数: ${argv[i]}`);
    }
  }
  if (targetPath && !sync) throw new Error('--target には --sync-global が必要です');
  return { sync, ...(targetPath ? { targetPath } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { sync, targetPath } = parseCliArgs(process.argv.slice(2));
    const r = await emit();
    if (sync) await syncGlobal({ ...(targetPath ? { targetPath } : {}) });
    console.log(`codex-update: 有効な事実 ${r.factCount} 件 / 参照記録 ${r.hitCount} 件 / ${r.issueCount} 号${sync ? ' / AGENTS.md 同期済み' : ''}`);
  } catch (error) {
    console.error(`[codex-update] ${error.message}`);
    console.error('usage: node emit.mjs [--sync-global] [--target <AGENTS.md>]');
    process.exitCode = 1;
  }
}
