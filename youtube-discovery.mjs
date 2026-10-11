import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectYouTubeCandidates } from './youtube-rss.mjs';

export { collectYouTubeCandidates } from './youtube-rss.mjs';

// 保存は CLI 自身が行う。stdout をエージェントに写させると、パッチ形式の書き込みで
// 先頭に `+` が残るなど、JSON として読めないファイルができる（2026-09-27 号で発生）。
// 書いた後に読み戻して JSON として検証し、壊れたファイルを残さない。
export async function writeDiscovery(result, path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const written = JSON.parse(await readFile(path, 'utf8'));
  return { path, candidates: written.candidates.length, failures: written.failures.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  const [start, end] = outIndex >= 0 ? args.filter((_, i) => i !== outIndex && i !== outIndex + 1) : args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '') || (outIndex >= 0 && !out)) {
    console.error('usage: node youtube-discovery.mjs YYYY-MM-DD YYYY-MM-DD [--out discovery/<号>.json]');
    process.exitCode = 2;
  } else {
    const result = await collectYouTubeCandidates({ start, end });
    if (out) console.log(JSON.stringify(await writeDiscovery(result, out)));
    else console.log(JSON.stringify(result, null, 2));
  }
}
