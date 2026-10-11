import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const projectRoot = new URL('../', import.meta.url);

test('AI context generation provides Linear-to-TechNews reverse lookup', async () => {
  const { stdout } = await run(process.execPath, ['emit-recheck.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.match(stdout, /work-reverse-index\.md/);
  const markdown = await readFile(new URL('../work-reverse-index.md', import.meta.url), 'utf8');
  const issue523 = markdown.match(/## 5-23 AI／CLIの振り分け軸[\s\S]*?(?=\n## |\n---)/)?.[0];

  assert.ok(issue523, 'missing reverse lookup section for Linear 5-23');
  assert.match(issue523, /2026-08-16/);
  assert.match(issue523, /GPT-5\.6は、モデル名より仕事あたりの総トークンで測る/);
  assert.match(issue523, /AI自己更新・再判定レーダー/);
  assert.match(issue523, /https:\/\/linear\.app\/5-10\/issue\/5-23\//);
});

test('web practice knowledge index exposes verified reusable rules', async () => {
  const index = JSON.parse(await readFile(new URL('../knowledge/index.json', import.meta.url), 'utf8'));
  for (const id of ['html-image-dimensions', 'html-dialog', 'css-grid-gap', 'js-fetch-response-ok', 'js-abort-controller']) {
    assert.ok(index.items[id], `missing knowledge item: ${id}`);
    assert.ok(index.items[id].essence);
    assert.ok(index.items[id].sources.length >= 1);
  }
  assert.ok(index.items['js-intersection-observer'].body);
  assert.ok(index.items['js-intersection-observer'].related_articles.includes('chrome-speed-records'));
  assert.ok(index.items['js-intersection-observer'].backlinks.includes('html-image-dimensions'));
  assert.deepEqual(index.generatedFrom, ['modern-web-practices.md', 'entries']);
  assert.match(await readFile(new URL('../knowledge/search.md', import.meta.url), 'utf8'), /response\.ok/);
  assert.match(await readFile(new URL('../knowledge/search.md', import.meta.url), 'utf8'), /関連週次記事: chrome-speed-records/);
  assert.match(await readFile(new URL('../knowledge/search.md', import.meta.url), 'utf8'), /逆リンク:/);
});

test('knowledge index is reproducible and excludes source typos from examples', async () => {
  const { stdout } = await run(process.execPath, ['knowledge/build-index.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.match(stdout, /generated knowledge index/);
  const search = await readFile(new URL('../knowledge/search.md', import.meta.url), 'utf8');
  assert.doesNotMatch(search, /object-fit-position|marign-inline|singal/);
  const indexA = await readFile(new URL('../knowledge/index.json', import.meta.url), 'utf8');
  const graphA = await readFile(new URL('../knowledge/graph.json', import.meta.url), 'utf8');
  const wikiIndexA = await readFile(new URL('../knowledge/wiki/index.html', import.meta.url), 'utf8');
  const entryPageA = await readFile(new URL('../knowledge/wiki/js-intersection-observer.html', import.meta.url), 'utf8');

  const rerun = await run(process.execPath, ['knowledge/build-index.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.match(rerun.stdout, /generated knowledge index/);
  assert.equal(await readFile(new URL('../knowledge/index.json', import.meta.url), 'utf8'), indexA);
  assert.equal(await readFile(new URL('../knowledge/graph.json', import.meta.url), 'utf8'), graphA);
  assert.equal(await readFile(new URL('../knowledge/wiki/index.html', import.meta.url), 'utf8'), wikiIndexA);
  assert.equal(await readFile(new URL('../knowledge/wiki/js-intersection-observer.html', import.meta.url), 'utf8'), entryPageA);
});

test('knowledge graph and wiki pages expose topics, relations and backlinks', async () => {
  const graph = JSON.parse(await readFile(new URL('../knowledge/graph.json', import.meta.url), 'utf8'));
  const node = graph.nodes.find((item) => item.id === 'js-intersection-observer');
  assert.ok(node);
  assert.equal(node.topic, 'JavaScript / Performance');
  assert.ok(node.links.some((item) => item.type === 'article' && item.target === 'chrome-speed-records'));
  assert.ok(graph.edges.some((item) => item.source === 'js-intersection-observer' && item.target === 'html-image-dimensions' && item.type === 'related'));

  const html = await readFile(new URL('../knowledge/wiki/index.html', import.meta.url), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Karpathy Wiki/);
  assert.match(html, /トピック/);
  assert.match(html, /html-image-dimensions\.html/);
  assert.match(html, /js-intersection-observer\.html/);
  assert.match(html, /articles\.html/);
  assert.match(html, /article-links\.json/);

  const entryHtml = await readFile(new URL('../knowledge/wiki/js-intersection-observer.html', import.meta.url), 'utf8');
  assert.match(entryHtml, /IntersectionObserver/);
  assert.match(entryHtml, /関連知識/);
  assert.match(entryHtml, /関連週次記事/);
  assert.match(entryHtml, /逆リンク/);
  assert.match(entryHtml, /chrome-speed-records/);
  assert.match(entryHtml, /html-image-dimensions/);
});

test('article knowledge coverage records every TechNews article as registered article entries and preserves knowledge links', async () => {
  const links = JSON.parse(await readFile(new URL('../knowledge/article-links.json', import.meta.url), 'utf8'));
  assert.equal(links.schemaVersion, 2);
  assert.equal(links.summary.totalArticles, 55);
  assert.equal(links.summary.registeredArticles, 55);
  assert.equal(links.summary.unregisteredArticles, 0);
  assert.equal(links.summary.linkedArticles + links.summary.registeredWithoutKnowledge, 55);
  assert.equal(links.summary.totalArticles, links.articles.length);
  assert.match(links.summary.statusLegend, /registered/);
  assert.match(links.summary.statusLegend, /linked/);
  assert.match(links.summary.statusLegend, /related knowledgeなし/);

  const linked = links.articles.find((item) => item.articleId === 'chrome-speed-records');
  assert.ok(linked);
  assert.equal(linked.status, 'linked');
  assert.equal(linked.registrationType, 'article');
  assert.deepEqual(linked.knowledgeIds, ['html-image-dimensions', 'js-intersection-observer']);

  const supplyChain = links.articles.find((item) => item.articleId === 'setup-java-5-5');
  assert.ok(supplyChain);
  assert.equal(supplyChain.status, 'linked');
  assert.deepEqual(supplyChain.knowledgeIds, ['supply-chain-local-or-cdn']);

  const registeredNoKnowledge = links.articles.find((item) => item.articleId === 'youtube-webmcp');
  assert.ok(registeredNoKnowledge);
  assert.equal(registeredNoKnowledge.status, 'registered');
  assert.equal(registeredNoKnowledge.registrationType, 'article');
  assert.deepEqual(registeredNoKnowledge.knowledgeIds, []);
  assert.equal(registeredNoKnowledge.relatedKnowledgeCount, 0);
  assert.match(registeredNoKnowledge.title, /WebMCP/);
  assert.ok(registeredNoKnowledge.sourceHtmlPath);

  const provisional = links.articles.find((item) => item.articleId === 'agents-python-0-19-4');
  assert.ok(provisional);
  assert.equal(provisional.issue, '2026-08-09');
  assert.equal(provisional.pageStatus, 'provisional');
  assert.equal(provisional.status, 'registered');
  assert.equal(provisional.registrationType, 'article');
  assert.equal(provisional.title, null);
  assert.match(provisional.titleDisplay, /タイトル未展開/);

  const articlesHtml = await readFile(new URL('../knowledge/wiki/articles.html', import.meta.url), 'utf8');
  assert.match(articlesHtml, /Karpathy Wiki 記事関連付け一覧/);
  assert.match(articlesHtml, /全記事 55 件/);
  assert.match(articlesHtml, /登録済み 55 件/);
  assert.match(articlesHtml, /未登録 0 件/);
  assert.match(articlesHtml, /chrome-speed-records/);
  assert.match(articlesHtml, /setup-java-5-5/);
  assert.match(articlesHtml, /youtube-webmcp/);
  assert.match(articlesHtml, /関連知識なし/);
  assert.match(articlesHtml, /タイトル未展開/);
  assert.match(articlesHtml, /元HTML/);
  assert.match(articlesHtml, /公式原典URL/);
  assert.match(articlesHtml, /登録種別/);
});

test('AI search entry exists and points to the right canonical and derived assets', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /knowledge\/AI_SEARCH\.md/);
  assert.match(readme, /node build\.mjs[\s\S]*node knowledge\/build-index\.mjs/);

  const guide = await readFile(new URL('../knowledge/AI_SEARCH.md', import.meta.url), 'utf8');
  assert.match(guide, /最初に読む順序/);
  assert.match(guide, /正本/);
  assert.match(guide, /派生物/);
  assert.match(guide, /記事登録≠知識検証済み/);
  assert.match(guide, /knowledge\/search\.md/);
  assert.match(guide, /knowledge\/index\.json/);
  assert.match(guide, /knowledge\/graph\.json/);
  assert.match(guide, /knowledge\/article-links\.json/);
  assert.match(guide, /knowledge\/wiki\/index\.html/);
  assert.match(guide, /knowledge\/wiki\/articles\.html/);
  assert.match(guide, /\d{4}-\d{2}-\d{2}\.html/);
  assert.match(guide, /関連知識→記事→案件→原典/);
  assert.match(guide, /node knowledge\/build-index\.mjs/);
  assert.match(guide, /node build\.mjs/);
  assert.match(guide, /node build\.mjs[\s\S]*node knowledge\/build-index\.mjs/);

  const index = JSON.parse(await readFile(new URL('../knowledge/index.json', import.meta.url), 'utf8'));
  assert.equal(index.aiSearchEntry?.path, 'knowledge/AI_SEARCH.md');

  const graph = JSON.parse(await readFile(new URL('../knowledge/graph.json', import.meta.url), 'utf8'));
  assert.equal(graph.aiSearchEntry?.path, 'knowledge/AI_SEARCH.md');

  const links = JSON.parse(await readFile(new URL('../knowledge/article-links.json', import.meta.url), 'utf8'));
  assert.equal(links.aiSearchEntry?.path, 'knowledge/AI_SEARCH.md');

  const wikiIndex = await readFile(new URL('../knowledge/wiki/index.html', import.meta.url), 'utf8');
  assert.match(wikiIndex, /AI検索入口/);
  assert.match(wikiIndex, /..\/*AI_SEARCH\.md|AI_SEARCH\.md/);

  const articlesHtml = await readFile(new URL('../knowledge/wiki/articles.html', import.meta.url), 'utf8');
  assert.match(articlesHtml, /AI検索入口/);
  assert.match(articlesHtml, /AI_SEARCH\.md/);

  const weekly = await readFile(new URL('../2026-08-23.html', import.meta.url), 'utf8');
  assert.match(weekly, /AI検索入口/);
  assert.match(weekly, /knowledge\/AI_SEARCH\.md/);
  assert.match(weekly, /この記事は記事として登録済み/);
  assert.match(weekly, /関連知識なし/);
  assert.doesNotMatch(weekly, /現行知識では未登録/);
});

test('build then knowledge/build-index generates stable 48-article coverage without relying on prebuilt knowledge index', async () => {
  // build.mjs と knowledge/build-index.mjs は knowledge/ や assets/diagrams/compressed/manifest.json 等の実生成物を書き換える。
  // 実リポを汚さないよう、リポを一時ディレクトリへ複製してそちらで走らせる（.git・output・node_modules は複製しない。
  // node_modules は読み取り専用の junction で参照する）。
  const repoRoot = fileURLToPath(projectRoot);
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'ai-context-build-'));
  const skip = new Set(['.git', 'node_modules', 'output', '.wrangler', '.playwright-cli']);
  const rootUrl = pathToFileURL(`${tmpRoot}${path.sep}`);
  try {
    await cp(repoRoot, tmpRoot, {
      recursive: true,
      filter: (src) => !skip.has(path.relative(repoRoot, src).split(path.sep)[0]),
    });
    await symlink(path.join(repoRoot, 'node_modules'), path.join(tmpRoot, 'node_modules'), 'junction');

    const indexPath = new URL('knowledge/index.json', rootUrl);
    const graphPath = new URL('knowledge/graph.json', rootUrl);
    const linksPath = new URL('knowledge/article-links.json', rootUrl);
    const wikiIndexPath = new URL('knowledge/wiki/index.html', rootUrl);
    const wikiArticlesPath = new URL('knowledge/wiki/articles.html', rootUrl);

    await writeFile(indexPath, `${JSON.stringify({ schemaVersion: 0, items: {} }, null, 2)}
`, 'utf8');

    const buildRun = await run(process.execPath, ['build.mjs'], { cwd: tmpRoot, encoding: 'utf8' });
    assert.match(buildRun.stdout, /knowledge coverage \d+\/55/);

    const articleLinksAfterBuild = JSON.parse(await readFile(linksPath, 'utf8'));
    assert.equal(articleLinksAfterBuild.summary.totalArticles, 55);
    assert.equal(articleLinksAfterBuild.summary.registeredArticles, 55);
    assert.equal(articleLinksAfterBuild.summary.unregisteredArticles, 0);

    const indexRun = await run(process.execPath, ['knowledge/build-index.mjs'], { cwd: tmpRoot, encoding: 'utf8' });
    assert.match(indexRun.stdout, /generated knowledge index/);

    const graphAfterIndex = JSON.parse(await readFile(graphPath, 'utf8'));
    const articleNodes = graphAfterIndex.nodes.filter((item) => item.nodeType === 'article');
    assert.equal(articleNodes.length, 55);
    assert.equal(articleNodes.filter((item) => item.status === 'linked' || item.status === 'registered').length, 55);

    const linksTextA = await readFile(linksPath, 'utf8');
    const indexTextA = await readFile(indexPath, 'utf8');
    const graphTextA = await readFile(graphPath, 'utf8');
    const wikiIndexTextA = await readFile(wikiIndexPath, 'utf8');
    const wikiArticlesTextA = await readFile(wikiArticlesPath, 'utf8');

    assert.match(wikiArticlesTextA, /全記事 55 件/);
    assert.match(wikiArticlesTextA, /登録済み 55 件/);

    await run(process.execPath, ['build.mjs'], { cwd: tmpRoot, encoding: 'utf8' });
    await run(process.execPath, ['knowledge/build-index.mjs'], { cwd: tmpRoot, encoding: 'utf8' });

    assert.equal(await readFile(linksPath, 'utf8'), linksTextA);
    assert.equal(await readFile(indexPath, 'utf8'), indexTextA);
    assert.equal(await readFile(graphPath, 'utf8'), graphTextA);
    assert.equal(await readFile(wikiIndexPath, 'utf8'), wikiIndexTextA);
    assert.equal(await readFile(wikiArticlesPath, 'utf8'), wikiArticlesTextA);
  } finally {
    // junction は先に外す（再帰削除が実リポの node_modules へ入らないように）
    await unlink(path.join(tmpRoot, 'node_modules')).catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
