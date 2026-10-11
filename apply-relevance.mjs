import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relevance } from './relevance.mjs';

const snapshot = '2026-08-16';
const css = `.work-relevance{margin:20px 0 2px;padding:16px 17px;border:1px solid #4c4565;border-radius:14px;background:linear-gradient(135deg,#1d1929,#13131b)}.work-relevance-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.work-relevance h3{margin:0;color:var(--gold);font-size:.9rem}.relevance-state{padding:3px 9px;border:1px solid #6f608e;border-radius:999px;background:#2d2440;color:#e8dcff;font-size:.74rem;font-weight:800}.work-relevance p{margin:9px 0;color:#d4d0df;font-size:.92rem}.work-links{display:flex;flex-wrap:wrap;gap:7px}.work-link{padding:5px 9px;border:1px solid #434050;border-radius:9px;background:#15151d;font-size:.78rem;text-decoration:none}.work-snapshot{display:block;margin-top:8px;color:var(--muted);font-size:.7rem}`;
const markerPattern = /<!-- work-relevance:start -->[\s\S]*?<!-- work-relevance:end -->/g;

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function block(item) {
  const links = item.links.map(([label, url]) => `<a class="work-link" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(label)} →</a>`).join('');
  return `<!-- work-relevance:start --><section class="work-relevance" data-linear-snapshot="${snapshot}"><div class="work-relevance-head"><h3>既存案件への接続</h3><span class="relevance-state">${escapeHtml(item.state)}</span></div><p>${escapeHtml(item.comment)}</p>${links ? `<div class="work-links">${links}</div>` : ''}<small class="work-snapshot">Linear照合: ${snapshot}時点</small></section><!-- work-relevance:end -->`;
}

export async function applyRelevance(directoryUrl = new URL('.', import.meta.url)) {
  const files = (await readdir(directoryUrl)).filter((name) => /^2026-\d{2}-\d{2}\.html$/.test(name));
  const seen = new Set();
  for (const name of files) {
    const url = new URL(name, directoryUrl);
    let html = (await readFile(url, 'utf8')).replaceAll(markerPattern, '');
    if (!html.includes('.work-relevance{')) html = html.replace('</style>', `${css}</style>`);
    html = html.replace(/<article\b[^>]*data-article-id="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, (article, id) => {
      const item = relevance[id];
      if (!item) throw new Error(`missing relevance mapping: ${name}#${id}`);
      seen.add(id);
      if (!article.includes('<div class="feedback">')) throw new Error(`missing feedback insertion point: ${name}#${id}`);
      return article.replace('<div class="feedback">', `${block(item)}<div class="feedback">`);
    });
    await writeFile(url, html, 'utf8');
  }
  const unused = Object.keys(relevance).filter((id) => !seen.has(id));
  if (unused.length) throw new Error(`unused relevance mappings: ${unused.join(', ')}`);
  return { files: files.length, articles: seen.size };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:///').href) {
  console.log(await applyRelevance());
}
