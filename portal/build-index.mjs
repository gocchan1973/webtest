import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestUrl = new URL('./portal-index.json', import.meta.url);
const outputUrl = new URL('./index.html', import.meta.url);

export const portalEntries = JSON.parse(await readFile(manifestUrl, 'utf8'));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function buildPortalIndex(entries = portalEntries) {
  const cards = entries.map((entry) => `
    <article class="collection-card" data-status="${escapeHtml(entry.status)}">
      <div class="card-meta"><span>${escapeHtml(entry.cadence)}</span><span>${escapeHtml(entry.status)}</span></div>
      <h2><a href="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</a></h2>
      <p>${escapeHtml(entry.description)}</p>
      <small>最終更新: ${escapeHtml(entry.updatedAt)}</small>
    </article>`).join('');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Private Information Hub</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; color: #f4f6fb; background: #10131a; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 90% 0, #253b59, transparent 34rem), #10131a; }
    main { width: min(1080px, calc(100% - 40px)); margin: auto; padding: 64px 0; }
    .eyebrow { color: #8ab4f8; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: .3rem 0; font-size: clamp(2rem, 6vw, 4rem); }
    .lead { max-width: 680px; color: #c8d0df; line-height: 1.8; }
    .collection-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 18px; margin-top: 42px; }
    .collection-card { padding: 24px; border: 1px solid #3d485b; border-radius: 18px; background: #1a202b; box-shadow: 0 16px 40px #0004; }
    .collection-card[data-status="archived"] { opacity: .68; }
    .card-meta { display: flex; justify-content: space-between; gap: 10px; color: #9eabc0; font-size: .78rem; text-transform: uppercase; }
    h2 { margin: 16px 0 8px; } h2 a { color: #b9d3ff; text-underline-offset: 4px; }
    p { color: #d4dae5; line-height: 1.7; } small { color: #aeb8c8; }
  </style>
</head>
<body><main>
  <div class="eyebrow">Private Information Hub</div>
  <h1>情報ハブ</h1>
  <p class="lead">認証済みの本人だけが、定期調査ごとのインデックスへ進めます。調査はフォルダ単位で追加・停止・統合できます。</p>
  <section class="collection-grid" aria-label="登録済み情報源">${cards}
  </section>
</main></body>
</html>`;
}

export async function writePortalIndex() {
  const html = buildPortalIndex();
  await writeFile(outputUrl, html, 'utf8');
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writePortalIndex();
  console.log(`generated portal index: ${portalEntries.length} collections`);
}
