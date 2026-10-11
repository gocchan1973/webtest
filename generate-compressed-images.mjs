import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

export const PNG_MAX_WIDTH = 1600;
export const PNG_COMPRESSION_LEVEL = 9;
export const PNG_PALETTE = true;

function resolveRootPath(rootUrl = new URL('./', import.meta.url)) {
  return fileURLToPath(rootUrl);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function diagramIdFromName(name) {
  return name.match(/^\d{4}-\d{2}-\d{2}__(.+)__infographic\.png$/)?.[1] ?? null;
}

export function getDiagramUsageMap() {
  return {
    'gpt-6-astra-safety': [{ issue: '2026-09-06', articleId: 'gpt-6-astra-safety' }],
    'gpt-6-astra-launch': [{ issue: '2026-09-06', articleId: 'gpt-6-astra-launch' }],
    'claude-fable-5-1': [{ issue: '2026-09-06', articleId: 'claude-fable-5-1' }],
    'anthropic-efs': [{ issue: '2026-09-06', articleId: 'anthropic-efs' }],
    'gemini-3-8-flash': [{ issue: '2026-09-06', articleId: 'gemini-3-8-flash' }],
    'copilot-content-exclusions': [{ issue: '2026-09-06', articleId: 'copilot-content-exclusions' }],
    'copilot-review-approval': [{ issue: '2026-09-06', articleId: 'copilot-review-approval' }],
    'npm-multiple-trusted-publishing': [{ issue: '2026-09-06', articleId: 'npm-multiple-trusted-publishing' }],
    'search-ai-controls': [{ issue: '2026-06-07', articleId: 'search-ai-controls' }],
    'sheets-formula-repair': [{ issue: '2026-06-28', articleId: 'sheets-formula-repair' }],
    'copilot-byok': [{ issue: '2026-06-28', articleId: 'copilot-byok' }],
    'npm-staged-controls': [{ issue: '2026-05-24', articleId: 'npm-staged-controls' }],
    'workspace-may-drops': [{ issue: '2026-05-31', articleId: 'workspace-may-drops' }],
    'chrome-speed-records': [{ issue: '2026-06-07', articleId: 'chrome-speed-records' }],
    'chrome-150-extension-limits': [{ issue: '2026-06-14', articleId: 'chrome-150-extension-limits' }],
    'copilot-agents-md': [{ issue: '2026-06-21', articleId: 'copilot-agents-md' }],
    'copilot-adoption-cohorts': [{ issue: '2026-05-31', articleId: 'copilot-adoption-cohorts' }],
    'copilot-ai-credits': [{ issue: '2026-06-21', articleId: 'copilot-ai-credits' }],
    'wasmer-wasm-node': [{ issue: '2026-06-07', articleId: 'wasmer-wasm-node' }],
    'chrome-hdr-2094-50': [{ issue: '2026-05-17', articleId: 'chrome-hdr-2094-50' }],
    'codeql-2-25-5': [{ issue: '2026-05-31', articleId: 'codeql-2-25-5' }],
    'copilot-app-preview': [{ issue: '2026-05-17', articleId: 'copilot-app-preview' }],
    'extensions-io-2026': [{ issue: '2026-05-24', articleId: 'extensions-io-2026' }],
    'github-issue-fields': [{ issue: '2026-05-24', articleId: 'github-issue-fields' }],
    'node-22-22-3': [{ issue: '2026-05-17', articleId: 'node-22-22-3' }],
    'workspace-studio-layered-protection': [{ issue: '2026-08-30', articleId: 'workspace-studio-layered-protection' }],
    'chatgpt-work-signed-in-browser': [{ issue: '2026-08-30', articleId: 'chatgpt-work-signed-in-browser' }],
    'webmcp-imperative-api-2026-08-20': [{ issue: '2026-08-23', articleId: 'webmcp-imperative-api-2026-08-20' }],
    'chatgpt-work-webhooks': [{ issue: '2026-08-30', articleId: 'chatgpt-work-webhooks' }],
    'temporary-chat-control-boundary': [{ issue: '2026-08-30', articleId: 'temporary-chat-control-boundary' }],
    'multiple-google-account-boundary': [{ issue: '2026-08-30', articleId: 'multiple-google-account-boundary' }],
    'microsoft-agentic-containment': [{ issue: '2026-08-30', articleId: 'microsoft-agentic-containment' }],
    'cursor-origin-code-hosting': [{ issue: '2026-08-23', articleId: 'cursor-origin-code-hosting' }],
    'youtube-gpt-token-efficiency': [{ issue: '2026-08-16', articleId: 'youtube-gpt-token-efficiency' }],
    'youtube-webmcp': [{ issue: '2026-08-16', articleId: 'youtube-webmcp' }],
    'youtube-workspace-video-manuals': [{ issue: '2026-08-16', articleId: 'youtube-workspace-video-manuals' }],
    'youtube-claude-hooks-html': [{ issue: '2026-08-16', articleId: 'youtube-claude-hooks-html' }],
    'youtube-npm-supply-chain': [{ issue: '2026-08-16', articleId: 'youtube-npm-supply-chain' }],
    'github-code-quality': [{ issue: '2026-07-26', articleId: 'github-code-quality' }],
    'sheets-comments-api': [{ issue: '2026-07-26', articleId: 'sheets-comments-api' }],
    'github-mcp-stateless': [{ issue: '2026-07-26', articleId: 'github-mcp-stateless' }],
    'copilot-linear-ga': [{ issue: '2026-07-26', articleId: 'copilot-linear-ga' }],
    'sheets-mcp-preview': [{ issue: '2026-07-19', articleId: 'sheets-mcp-preview' }],
    'ai-security-detections': [{ issue: '2026-07-19', articleId: 'ai-security-detections' }],
    'pr-archive': [{ issue: '2026-07-19', articleId: 'pr-archive' }],
    'setup-java-5-5': [{ issue: '2026-07-12', articleId: 'setup-java-5-5' }],
    'gpt-5-6-family': [{ issue: '2026-07-12', articleId: 'gpt-5-6-family' }],
    'chrome-150': [{ issue: '2026-07-05', articleId: 'chrome-150' }],
    'workspace-mdm-ou': [{ issue: '2026-07-05', articleId: 'workspace-mdm-ou' }],
    'github-models-retirement': [{ issue: '2026-07-05', articleId: 'github-models-retirement' }],
    'node-24-18': [{ issue: '2026-06-28', articleId: 'node-24-18' }],
    'gemini-classroom-boundary': [{ issue: '2026-06-21', articleId: 'gemini-classroom-boundary' }],
    'deno-2-9-5': [{ issue: '2026-08-09', articleId: 'deno-2-9-5' }],
    'agents-python-0-19-4': [{ issue: '2026-08-09', articleId: 'agents-python-0-19-4' }],
    'uv-0-12-3': [{ issue: '2026-08-09', articleId: 'uv-0-12-3' }],
    'electron-43-3-0': [{ issue: '2026-08-09', articleId: 'electron-43-3-0' }],
    'langchainjs-local-file-store': [{ issue: '2026-08-09', articleId: 'langchainjs-local-file-store' }],
    'npm-publish-scan': [{ issue: '2026-08-02', articleId: 'npm-publish-scan' }],
    'github-actions-approval': [{ issue: '2026-08-02', articleId: 'github-actions-approval' }],
    'copilot-managed-settings': [{ issue: '2026-08-02', articleId: 'copilot-managed-settings' }],
    'node-security-july-2026': [{ issue: '2026-08-02', articleId: 'node-security-july-2026' }],
  };
}

function usageLabel(usages) {
  if (!usages.length) return '未検出';
  return usages.map((usage) => `${usage.issue}.html / article: ${usage.articleId}`).join(', ');
}

function cleanupStatus(entry) {
  return entry.verified && entry.usageCount > 0 ? 'candidate' : 'keep';
}

function toCleanupAsset(entry) {
  return {
    name: entry.name,
    originalSize: entry.originalSize,
    originalSha256: entry.originalSha256,
    compressedSize: entry.compressedSize,
    compressedSha256: entry.compressedSha256,
    reductionRatio: entry.reductionRatio,
    verified: entry.verified,
    status: cleanupStatus(entry),
    usageCount: entry.usageCount,
    usageLabel: usageLabel(entry.usages),
    usages: entry.usages.map((usage) => `${usage.issue}.html / article: ${usage.articleId}`),
  };
}

export function renderAssetCleanupHtml(manifest) {
  const assets = manifest.images.map(toCleanupAsset);
  const assetJson = JSON.stringify(assets, null, 0);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TechNews Asset Cleanup</title>
  <style>
    :root { color-scheme: light; --bg: #e4ded1; --panel: #f5f0e7; --panel-strong: #fffaf2; --ink: #292722; --muted: #625d54; --line: #b9af9f; --accent: #3f6f70; --warn: #956c31; --danger: #8e3b2f; --danger-soft: #f3ddd8; --ok: #315f44; --ok-soft: #dce8de; }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at top right, #efe6d6 0, transparent 28rem), linear-gradient(180deg, #e9e1d4 0%, var(--bg) 100%); color: var(--ink); font-family: "Yu Gothic UI", "Hiragino Sans", system-ui, sans-serif; line-height: 1.6; }
    a { color: #214f6c; } button, input { font: inherit; }
    button { min-height: 44px; border: 1px solid var(--line); border-radius: 999px; padding: 0.7rem 1rem; background: var(--panel-strong); color: var(--ink); cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .shell { width: min(1280px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 2.5rem 0 1.5rem; }
    .eyebrow { color: var(--accent); font-size: 0.8rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { margin: 0.3rem 0 0.8rem; font-size: clamp(2rem, 5vw, 3.6rem); line-height: 1.1; }
    .lead { max-width: 58rem; color: var(--muted); font-size: 1rem; }
    .layout { display: grid; grid-template-columns: minmax(0, 2.5fr) minmax(280px, 0.9fr); gap: 1rem; align-items: start; padding-bottom: 2rem; }
    .panel { border: 1px solid var(--line); border-radius: 24px; background: rgba(245, 240, 231, 0.92); box-shadow: 0 14px 40px rgba(86, 72, 48, 0.08); }
    .panel-inner { padding: 1rem 1rem 1.2rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .summary-card { border: 1px solid var(--line); border-radius: 18px; background: var(--panel-strong); padding: 0.9rem 1rem; }
    .summary-card strong { display: block; font-size: 1.5rem; line-height: 1.1; }
    .summary-card span { color: var(--muted); font-size: 0.88rem; }
    .status-legend { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.45rem; border: 1px solid var(--line); border-radius: 999px; padding: 0.35rem 0.7rem; font-size: 0.84rem; background: var(--panel-strong); }
    .chip::before { content: ""; width: 0.7rem; height: 0.7rem; border-radius: 999px; background: var(--line); }
    .chip-keep::before { background: var(--ok); }
    .chip-candidate::before { background: var(--warn); }
    .notice { margin: 0 0 1rem; padding: 0.9rem 1rem; border-left: 4px solid var(--warn); border-radius: 0 16px 16px 0; background: #efe3cf; color: #5b4726; }
    table { width: 100%; border-collapse: collapse; font-size: 0.93rem; }
    th, td { padding: 0.8rem 0.7rem; border-top: 1px solid var(--line); vertical-align: top; text-align: left; }
    th { color: var(--muted); font-size: 0.82rem; letter-spacing: 0.04em; text-transform: uppercase; }
    tbody tr[data-status="candidate"] { background: rgba(239, 227, 207, 0.68); }
    tbody tr[data-status="keep"] { background: rgba(220, 232, 222, 0.75); }
    .asset-name { font-weight: 700; word-break: break-word; }
    .preview-stack { display: grid; gap: 0.45rem; }
    .thumbnail-link { display: inline-flex; align-items: center; justify-content: center; width: min(240px, 100%); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: #ede5d8; text-decoration: none; }
    .thumbnail-image { display: block; width: 100%; max-width: 240px; height: auto; aspect-ratio: 4 / 3; object-fit: cover; background: linear-gradient(180deg, rgba(255, 250, 242, 0.65), rgba(233, 225, 212, 0.88)); }
    .preview-asset-name { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.84rem; word-break: break-all; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.25rem 0.6rem; font-size: 0.78rem; font-weight: 700; border: 1px solid currentColor; }
    .badge-keep { color: var(--ok); background: var(--ok-soft); }
    .badge-candidate { color: var(--warn); background: #f1e4cf; }
    .usage-list { margin: 0; padding-left: 1rem; }
    .usage-list li + li { margin-top: 0.3rem; }
    aside h2, .table-title { margin: 0 0 0.7rem; font-size: 1.1rem; }
    aside p, .meta-copy { color: var(--muted); font-size: 0.92rem; }
    .action-stack { display: grid; gap: 0.75rem; }
    .action-box { border: 1px solid var(--line); border-radius: 18px; background: var(--panel-strong); padding: 0.95rem 1rem; }
    .action-box h3 { margin: 0 0 0.45rem; font-size: 1rem; }
    .action-box p { margin: 0 0 0.7rem; color: var(--muted); font-size: 0.9rem; }
    .danger-note { border-left: 4px solid var(--danger); background: var(--danger-soft); color: #61332a; border-radius: 0 16px 16px 0; padding: 0.9rem 1rem; }
    .review-list { margin: 0; padding-left: 1rem; }
    .review-list li + li { margin-top: 0.4rem; }
    .footer-note { margin: 0.8rem 0 0; font-size: 0.82rem; color: var(--muted); }
    @media (max-width: 900px) { .layout, .summary-grid { grid-template-columns: 1fr; } table, thead, tbody, tr, th, td { display: block; } thead { position: absolute; width: 1px; height: 1px; overflow: hidden; } tbody tr { border-top: 1px solid var(--line); padding: 0.4rem 0; } td { border-top: 0; padding: 0.35rem 0.7rem; } td::before { content: attr(data-label); display: block; color: var(--muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.16rem; } }
  </style>
</head>
<body>
  <header class="shell">
    <div class="eyebrow">TechNews local asset safety</div>
    <h1>原本画像の削除確認だけを、事故らない形に切り出す。</h1>
    <p class="lead">assets/diagrams/original 配下の原本PNGと assets/diagrams/compressed の圧縮PNGを対応づけて一覧化し、サイズ差・SHA-256・サムネイル・埋め込みHTMLの使用箇所を確認できます。安全のため実ファイルは削除しません。compressed が存在し、検証済みの原本だけを削除候補にできます。</p>
  </header>
  <main class="shell layout">
    <section class="panel">
      <div class="panel-inner">
        <div class="summary-grid" id="summary-grid"></div>
        <div class="status-legend">
          <span class="chip chip-keep">保持</span>
          <span class="chip chip-candidate">候補</span>
        </div>
        <p class="notice">このページは削除候補の確認専用です。compressed が存在し、manifest で検証済みと記録された原本だけが候補になります。実削除は行わず、ユーザー確認後に削除対象JSONだけを出力します。</p>
        <h2 class="table-title">原本PNG一覧</h2>
        <table aria-describedby="table-help">
          <thead><tr><th>選択</th><th>プレビュー</th><th>ファイル</th><th>サイズ</th><th>SHA-256</th><th>検証</th><th>状態</th><th>埋め込みHTMLの使用箇所</th></tr></thead>
          <tbody id="asset-table-body"></tbody>
        </table>
        <p class="footer-note" id="table-help">\`候補\` の行だけ選択できます。compressed がない、未検証、または使用箇所情報が欠ける原本は \`保持\` として残します。</p>
      </div>
    </section>
    <aside class="panel">
      <div class="panel-inner action-stack">
        <section class="action-box"><h2>選択状況</h2><p id="selection-summary" class="meta-copy">候補 0 件を選択中。</p><p id="selection-detail" class="meta-copy">検証済み候補だけ選択できます。</p></section>
        <section class="action-box"><h3>1. 候補を固める</h3><p>一覧で候補を選んだら、確認状態へ進みます。ここではまだ何も削除しません。</p><button id="review-button" type="button">確認状態へ進む</button></section>
        <section class="action-box"><h3>2. 削除対象JSONを出す</h3><p>レビュー済み候補だけを、後続の手作業削除や別ツール連携に渡せる JSON として保存します。</p><button id="download-button" type="button" disabled>削除対象JSONをダウンロード</button></section>
        <section class="action-box"><h3>確認対象</h3><ol class="review-list" id="review-list"><li>候補として選んだPNGだけが JSON に入ること</li><li>original と compressed の SHA-256 / サイズ差が後続確認に使えること</li><li>埋め込みHTMLの使用箇所と検証済み状態が残ること</li></ol></section>
        <section class="danger-note">ブラウザの file:// 制約と安全性のため、このページは削除APIを持ちません。実削除は別の確認工程で行ってください。</section>
      </div>
    </aside>
  </main>
  <script id="asset-data" type="application/json">${assetJson}</script>
  <script>
    (() => {
      'use strict';
      const assets = JSON.parse(document.querySelector('#asset-data').textContent);
      const body = document.querySelector('#asset-table-body');
      const summaryGrid = document.querySelector('#summary-grid');
      const selectionSummary = document.querySelector('#selection-summary');
      const selectionDetail = document.querySelector('#selection-detail');
      const reviewButton = document.querySelector('#review-button');
      const downloadButton = document.querySelector('#download-button');
      const reviewList = document.querySelector('#review-list');
      let reviewed = false;
      function formatBytes(size) { const units = ['B', 'KB', 'MB', 'GB']; let value = size; let index = 0; while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; } return \`\${value.toFixed(index === 0 ? 0 : 2)} \${units[index]}\`; }
      function statusLabel(status) { return status === 'candidate' ? '候補' : '保持'; }
      function statusClass(status) { return status === 'candidate' ? 'badge-candidate' : 'badge-keep'; }
      function assetPreviewPath(asset, kind) { return kind === 'compressed' ? \`assets/diagrams/compressed/\${encodeURIComponent(asset.name)}\` : \`assets/diagrams/original/\${encodeURIComponent(asset.name)}\`; }
      function selectedAssets() { return assets.filter((asset) => { const input = body.querySelector(\`input[data-name="\${CSS.escape(asset.name)}"]\`); return input && input.checked; }); }
      function renderSummary() {
        const keep = assets.filter((asset) => asset.status === 'keep').length;
        const candidate = assets.filter((asset) => asset.status === 'candidate').length;
        const selected = selectedAssets().length;
        summaryGrid.innerHTML = [{ value: assets.length, label: '対象PNG' }, { value: keep, label: '保持' }, { value: candidate, label: '候補' }, { value: assets.filter((asset) => asset.verified).length, label: '検証済み' }].map((item) => \`<article class="summary-card"><strong>\${item.value}</strong><span>\${item.label}</span></article>\`).join('');
        selectionSummary.textContent = \`候補 \${selected} 件を選択中。\`;
        selectionDetail.textContent = reviewed ? '確認状態です。JSON 出力前に右の一覧を見直してください。' : '検証済み候補だけ選択できます。';
        downloadButton.disabled = !reviewed || selected === 0;
        reviewButton.disabled = selected === 0;
      }
      function renderRows() {
        body.innerHTML = assets.map((asset) => {
          const usageMarkup = asset.usages.length ? \`<ul class="usage-list">\${asset.usages.map((usage) => \`<li>\${usage}</li>\`).join('')}</ul>\` : \`<span>\${asset.usageLabel}</span>\`;
          const reductionText = typeof asset.reductionRatio === 'number' ? \`\${asset.reductionRatio.toFixed(2)}%\` : '0.00%';
          return \`<tr data-status="\${asset.status}">
            <td data-label="選択"><input type="checkbox" data-name="\${asset.name}" aria-label="\${asset.name} を候補として選択"></td>
            <td data-label="プレビュー"><div class="preview-stack"><a class="thumbnail-link" href="\${assetPreviewPath(asset, 'original')}" target="_blank" rel="noopener noreferrer" aria-label="\${asset.name} の原本画像を開く"><span class="preview-asset-name">\${asset.name}</span><img class="thumbnail-image" src="\${assetPreviewPath(asset, 'original')}" alt="\${asset.name} の原本画像プレビュー" loading="lazy" decoding="async"></a><a class="thumbnail-link" href="\${assetPreviewPath(asset, 'compressed')}" target="_blank" rel="noopener noreferrer" aria-label="\${asset.name} の圧縮画像を開く"><span class="preview-asset-name">\${asset.name} compressed</span><img class="thumbnail-image" src="\${assetPreviewPath(asset, 'compressed')}" alt="\${asset.name} の圧縮画像プレビュー" loading="lazy" decoding="async"></a></div></td>
            <td data-label="ファイル"><div class="asset-name">\${asset.name}</div></td>
            <td data-label="サイズ">original \${formatBytes(asset.originalSize)} / compressed \${formatBytes(asset.compressedSize)}<br><span class="mono">\${asset.originalSize} -> \${asset.compressedSize} bytes</span><br><span class="mono">削減率 \${reductionText}</span></td>
            <td data-label="SHA-256"><span class="mono">original \${asset.originalSha256}</span><br><span class="mono">compressed \${asset.compressedSha256}</span></td>
            <td data-label="検証">\${asset.verified ? '検証済み' : '未検証'}</td>
            <td data-label="状態"><span class="badge \${statusClass(asset.status)}">\${statusLabel(asset.status)}</span></td>
            <td data-label="埋め込みHTMLの使用箇所">\${usageMarkup}</td>
          </tr>\`;
        }).join('');
        body.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          const asset = assets.find((entry) => entry.name === input.dataset.name);
          input.disabled = asset.status !== 'candidate';
          input.addEventListener('change', () => { reviewed = false; renderSummary(); });
        });
      }
      function updateReviewList(items) {
        reviewList.innerHTML = items.map((asset) => \`<li><strong>\${asset.name}</strong><br><span class="mono">\${asset.originalSha256}</span><br><span>\${asset.usageLabel}</span></li>\`).join('');
      }
      reviewButton.addEventListener('click', () => {
        const items = selectedAssets();
        if (items.length === 0) return;
        const ok = window.confirm(\`候補 \${items.length} 件をレビュー対象に固定します。実ファイル削除は行いません。続行しますか？\`);
        if (!ok) return;
        reviewed = true;
        updateReviewList(items);
        renderSummary();
      });
      downloadButton.addEventListener('click', () => {
        const items = selectedAssets();
        if (!reviewed || items.length === 0) return;
        const payload = { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceDirectory: 'assets/diagrams/original', compressedDirectory: 'assets/diagrams/compressed', mode: 'manifest-only', deleteCandidates: items.map((asset) => ({ name: asset.name, originalSize: asset.originalSize, originalSha256: asset.originalSha256, compressedSize: asset.compressedSize, compressedSha256: asset.compressedSha256, reductionRatio: asset.reductionRatio, verified: asset.verified, status: asset.status, usageCount: asset.usageCount, usageLabel: asset.usageLabel, usages: asset.usages })) };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = Object.assign(document.createElement('a'), { href: url, download: 'asset-cleanup-manifest.json' });
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      renderRows();
      renderSummary();
    })();
  </script>
</body>
</html>
`;
}

async function compressPngFile(sourcePath, destinationPath) {
  const sourceBuffer = await readFile(sourcePath);
  const metadata = await sharp(sourceBuffer).metadata();
  const width = Math.min(metadata.width ?? PNG_MAX_WIDTH, PNG_MAX_WIDTH);
  const compressedBuffer = await sharp(sourceBuffer)
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: PNG_COMPRESSION_LEVEL, palette: PNG_PALETTE })
    .toBuffer();

  await writeFile(destinationPath, compressedBuffer);

  return {
    width,
    originalWidth: metadata.width ?? width,
    originalHeight: metadata.height ?? 0,
    originalSize: sourceBuffer.length,
    originalSha256: sha256(sourceBuffer),
    compressedSize: compressedBuffer.length,
    compressedSha256: sha256(compressedBuffer),
  };
}

export async function generateCompressedImages({ rootUrl = new URL('./', import.meta.url), force = false, verified = true } = {}) {
  const rootPath = resolveRootPath(rootUrl);
  const originalDir = path.join(rootPath, 'assets', 'diagrams', 'original');
  const compressedDir = path.join(rootPath, 'assets', 'diagrams', 'compressed');
  const manifestPath = path.join(compressedDir, 'manifest.json');

  await mkdir(originalDir, { recursive: true });
  await mkdir(compressedDir, { recursive: true });

  const names = (await readdir(originalDir)).filter((name) => name.endsWith('.png')).sort();
  const usageMap = getDiagramUsageMap();
  const previousManifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"images":[]}'));
  const previousByName = new Map((previousManifest.images ?? []).map((entry) => [entry.name, entry]));
  const images = [];
  let changed = false;

  for (const name of names) {
    const sourcePath = path.join(originalDir, name);
    const destinationPath = path.join(compressedDir, name);
    const sourceBuffer = await readFile(sourcePath);
    const originalSha256 = sha256(sourceBuffer);
    const previous = previousByName.get(name);
    const destinationExists = await stat(destinationPath).then(() => true).catch(() => false);
    const reusedCompressedAsset = !force && destinationExists && previous && previous.originalSha256 === originalSha256 && previous.originalSize === sourceBuffer.length;

    let details;
    if (reusedCompressedAsset) {
      const destinationBuffer = await readFile(destinationPath);
      const metadata = await sharp(sourceBuffer).metadata();
      const width = Math.min(metadata.width ?? PNG_MAX_WIDTH, PNG_MAX_WIDTH);
      details = {
        width,
        originalWidth: metadata.width ?? width,
        originalHeight: metadata.height ?? 0,
        originalSize: sourceBuffer.length,
        originalSha256,
        compressedSize: destinationBuffer.length,
        compressedSha256: sha256(destinationBuffer),
      };
    } else {
      changed = true;
      details = await compressPngFile(sourcePath, destinationPath);
    }

    const diagramId = diagramIdFromName(name);
    const usages = diagramId ? (usageMap[diagramId] ?? []) : [];
    images.push({
      name,
      diagramId,
      originalPath: `assets/diagrams/original/${name}`,
      compressedPath: `assets/diagrams/compressed/${name}`,
      width: details.width,
      originalWidth: details.originalWidth,
      originalHeight: details.originalHeight,
      originalSize: details.originalSize,
      originalSha256: details.originalSha256,
      compressedSize: details.compressedSize,
      compressedSha256: details.compressedSha256,
      bytesSaved: details.originalSize - details.compressedSize,
      reductionRatio: details.originalSize === 0 ? 0 : Number(((1 - (details.compressedSize / details.originalSize)) * 100).toFixed(2)),
      verified,
      usages,
      usageCount: usages.length,
      generatedAt: reusedCompressedAsset ? previous.generatedAt : new Date().toISOString(),
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: changed ? new Date().toISOString() : previousManifest.generatedAt ?? new Date().toISOString(),
    generator: {
      maxWidth: PNG_MAX_WIDTH,
      compressionLevel: PNG_COMPRESSION_LEVEL,
      palette: PNG_PALETTE,
    },
    images,
  };

  const manifestText = stableStringify(manifest);
  const previousManifestText = stableStringify(previousManifest);
  if (manifestText !== previousManifestText) {
    await writeFile(manifestPath, manifestText, 'utf8');
  }
  await writeFile(path.join(rootPath, 'asset-cleanup.html'), `${renderAssetCleanupHtml(manifest)}\n`, 'utf8');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes('--force');
  const manifest = await generateCompressedImages({ force });
  console.log(`generated ${manifest.images.length} compressed PNGs`);
}
