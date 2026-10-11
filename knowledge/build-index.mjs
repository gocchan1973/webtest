import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { aiSearchEntry, loadKnowledgeItems } from './load-items.mjs';

const root = new URL('./', import.meta.url);
const wikiDirUrl = new URL('./wiki/', root);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugFile(id) {
  return `${id}.html`;
}

async function loadArticleCoverage() {
  try {
    return JSON.parse(await readFile(new URL('./article-links.json', root), 'utf8'));
  } catch {
    return null;
  }
}

function renderSearch(items) {
  const lines = ['# Web実装知識検索インデックス', '', `AI検索入口: \`${aiSearchEntry.path}\``, '生成元: modern-web-practices.md, entries', ''];
  for (const item of items) {
    lines.push(`## ${item.id} | ${item.title}`);
    lines.push(`- ${item.topic} / ${item.status}`);
    lines.push(`- 本質: ${item.essence}`);
    lines.push(`- 適用: ${item.use_when}`);
    lines.push(`- 避ける: ${item.avoid_when}`);
    lines.push(`- 注意: ${item.pitfalls}`);
    lines.push(`- 互換性: ${item.compatibility}`);
    lines.push(`- アクセシビリティ: ${item.accessibility}`);
    lines.push(`- 検証日: ${item.verified_at}`);
    if (item.related_articles.length) lines.push(`- 関連週次記事: ${item.related_articles.join(', ')}`);
    if (item.related_knowledge.length) lines.push(`- 関連知識: ${item.related_knowledge.join(', ')}`);
    if (item.backlinks.length) lines.push(`- 逆リンク: ${item.backlinks.join(', ')}`);
    lines.push(`- 根拠: ${item.sources.map((source) => `[${source.label}](${source.url})`).join(', ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderWikiCss() {
  return ':root{color-scheme:light;--bg:#f5f0e7;--panel:#fffaf2;--line:#d0c5b6;--ink:#292722;--muted:#6b655d;--accent:#28585a;--accent-soft:#e2eeee;--gold:#8b6a2b;--gold-soft:#f3ead7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#efe4cf,transparent 28rem),var(--bg);color:var(--ink);font-family:"Yu Gothic UI","Hiragino Sans",system-ui,sans-serif;line-height:1.7}a{color:#28585a;text-underline-offset:3px}.shell{width:min(1080px,calc(100% - 32px));margin:auto}header{padding:40px 0 24px;border-bottom:1px solid var(--line)}main{padding:28px 0 40px}.layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:20px}.panel{padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}.topic-list,.entry-list,.link-list{display:grid;gap:10px}.topic-chip,.status-chip{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:700}.topic-chip{background:var(--accent-soft);color:var(--accent)}.status-chip{background:var(--gold-soft);color:var(--gold)}.entry-card{padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.entry-card h2,.entry-main h1{margin:.2rem 0 .6rem}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.body{white-space:pre-wrap}.section-title{margin:0 0 8px;font-size:1rem}.small{color:var(--muted);font-size:.88rem}@media(max-width:800px){.layout{grid-template-columns:1fr}}';
}

function renderWikiIndex(items, articleCoverage) {
  const topicMap = new Map();
  for (const item of items) {
    if (!topicMap.has(item.topic)) topicMap.set(item.topic, []);
    topicMap.get(item.topic).push(item);
  }
  const topicCards = [...topicMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([topic, entries]) => `<section class="panel"><h2 class="section-title">トピック</h2><div class="topic-chip">${escapeHtml(topic)}</div><p class="small">${entries.length}項目</p><div class="entry-list">${entries.map((item) => `<a href="${slugFile(item.id)}">${escapeHtml(item.title)}</a>`).join('')}</div></section>`).join('');
  const entryCards = items.map((item) => `<article class="entry-card"><div class="meta"><span class="topic-chip">${escapeHtml(item.topic)}</span><span class="status-chip">${escapeHtml(item.status)}</span></div><h2><a href="${slugFile(item.id)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.essence)}</p><p class="small">検証日: ${escapeHtml(item.verified_at)}</p></article>`).join('');
  const guidePanel = `<section class="panel"><h2 class="section-title">AI検索入口</h2><p class="small">まず <a href="../AI_SEARCH.md">AI_SEARCH.md</a> を読み、用途に応じて search / index / graph / articles へ進む。</p></section>`;
  const coveragePanel = articleCoverage ? `<section class="panel"><h2 class="section-title">記事関連付け</h2><p class="small">全記事 ${articleCoverage.summary.totalArticles} 件 / 登録済み ${articleCoverage.summary.registeredArticles} 件 / 関連あり ${articleCoverage.summary.linkedArticles} 件 / 未登録 ${articleCoverage.summary.unregisteredArticles} 件</p><div class="entry-list"><a href="articles.html">記事関連付け一覧</a><a href="../article-links.json">article-links.json</a></div></section>` : `<section class="panel"><h2 class="section-title">記事関連付け</h2><div class="entry-list"><a href="articles.html">記事関連付け一覧</a><a href="../article-links.json">article-links.json</a></div></section>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karpathy Wiki</title><style>${renderWikiCss()}</style></head><body><header><div class="shell"><p class="small">knowledge/wiki</p><h1>Karpathy Wiki</h1><p>TechNews の再利用可能な知識項目を、トピック・関連・逆リンクで辿るための静的索引。</p></div></header><main class="shell"><div class="layout"><aside>${guidePanel}${coveragePanel}${topicCards}</aside><section class="panel"><h2 class="section-title">知識項目</h2><div class="entry-list">${entryCards}</div></section></div></main></body></html>`;
}

function renderLinkList(title, items, mapper) {
  if (!items.length) return '';
  return `<section class="panel"><h2 class="section-title">${title}</h2><div class="link-list">${items.map(mapper).join('')}</div></section>`;
}

function renderEntryPage(item, byId) {
  const relatedKnowledge = item.related_knowledge.map((id) => byId.get(id)).filter(Boolean);
  const backlinks = item.backlinks.map((id) => byId.get(id)).filter(Boolean);
  const guidePanel = `<section class="panel"><h2 class="section-title">AI検索入口</h2><div class="link-list"><a href="../AI_SEARCH.md">AI_SEARCH.md</a><a href="../search.md">search.md</a><a href="../index.json">index.json</a><a href="../graph.json">graph.json</a></div></section>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(item.title)} | Karpathy Wiki</title><style>${renderWikiCss()}</style></head><body><header><div class="shell"><p class="small"><a href="index.html">Karpathy Wiki</a></p><h1>${escapeHtml(item.title)}</h1><div class="meta"><span class="topic-chip">${escapeHtml(item.topic)}</span><span class="status-chip">${escapeHtml(item.status)}</span><span class="small">検証日: ${escapeHtml(item.verified_at)}</span></div></div></header><main class="shell"><div class="layout"><aside>${guidePanel}${renderLinkList('関連知識', relatedKnowledge, (entry) => `<a href="${slugFile(entry.id)}">${escapeHtml(entry.id)} | ${escapeHtml(entry.title)}</a>`)}${renderLinkList('関連週次記事', item.related_articles, (articleId) => `<a href="../../${articleId.includes('2026-') ? `${articleId}.html` : '2026-06-07.html'}">${escapeHtml(articleId)}</a>`)}${renderLinkList('関連案件', item.related_work, (work) => `<span>${escapeHtml(work)}</span>`)}${renderLinkList('逆リンク', backlinks, (entry) => `<a href="${slugFile(entry.id)}">${escapeHtml(entry.id)} | ${escapeHtml(entry.title)}</a>`)}${renderLinkList('出典', item.sources, (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`)}</aside><article class="panel entry-main"><div class="body">${escapeHtml(item.body)}</div></article></div></main></body></html>`;
}

function buildGraph(items) {
  const nodes = items.map((item) => ({
    nodeType: 'knowledge',
    id: item.id,
    title: item.title,
    topic: item.topic,
    status: item.status,
    verified_at: item.verified_at,
    links: [
      ...item.related_articles.map((target) => ({ type: 'article', target })),
      ...item.related_work.map((target) => ({ type: 'work', target })),
      ...item.sources.map((source) => ({ type: 'source', target: source.url, label: source.label })),
    ],
  }));

  const edges = [];
  for (const item of items) {
    for (const target of item.related_knowledge) {
      edges.push({ source: item.id, target, type: 'related' });
    }
  }
  return { schemaVersion: 2, nodes, edges };
}

function addArticleCoverageToGraph(graph, articleCoverage) {
  if (!articleCoverage) return graph;
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  for (const article of articleCoverage.articles) {
    nodes.push({
      nodeType: 'article',
      id: article.articleId,
      title: article.titleDisplay ?? article.title ?? article.articleId,
      issue: article.issue,
      pageStatus: article.pageStatus,
      registrationType: article.registrationType,
      status: article.status,
      canonicalUrl: article.canonicalUrl,
      links: [
        ...(article.sourceHtmlPath ? [{ type: 'html', target: article.sourceHtmlPath }] : []),
        ...(article.canonicalUrl ? [{ type: 'source', target: article.canonicalUrl, label: '公式原典URL' }] : []),
      ],
    });
    for (const knowledgeId of article.knowledgeIds ?? []) {
      edges.push({ source: article.articleId, target: knowledgeId, type: 'article-link' });
      edges.push({ source: knowledgeId, target: article.articleId, type: 'evidence-from-article' });
    }
  }
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.type.localeCompare(b.type));
  return { schemaVersion: 2, nodes, edges };
}

async function writeWiki(items) {
  await mkdir(wikiDirUrl, { recursive: true });
  const byId = new Map(items.map((item) => [item.id, item]));
  const articleCoverage = await loadArticleCoverage();
  await writeFile(new URL('./index.html', wikiDirUrl), `${renderWikiIndex(items, articleCoverage)}\n`, 'utf8');
  for (const item of items) {
    await writeFile(new URL(`./${slugFile(item.id)}`, wikiDirUrl), `${renderEntryPage(item, byId)}\n`, 'utf8');
  }
}

const items = await loadKnowledgeItems();
const articleCoverage = await loadArticleCoverage();
const graph = addArticleCoverageToGraph(buildGraph(items), articleCoverage);
const index = {
  schemaVersion: 2,
  aiSearchEntry,
  generatedFrom: ['modern-web-practices.md', 'entries'],
  items: Object.fromEntries(items.map((item) => [item.id, item])),
};

await writeFile(new URL('./index.json', root), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
await writeFile(new URL('./graph.json', root), `${JSON.stringify({ ...graph, aiSearchEntry }, null, 2)}\n`, 'utf8');
await writeFile(new URL('./search.md', root), renderSearch(items), 'utf8');
await writeWiki(items);
console.log(`generated knowledge index: ${items.length} items`);
