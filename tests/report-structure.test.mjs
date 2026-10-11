import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const periods = [
  ['2026-05-17', '2026-05-11', '2026-05-17'],
  ['2026-05-24', '2026-05-18', '2026-05-24'],
  ['2026-05-31', '2026-05-25', '2026-05-31'],
  ['2026-06-07', '2026-06-01', '2026-06-07'],
  ['2026-06-14', '2026-06-08', '2026-06-14'],
  ['2026-06-21', '2026-06-15', '2026-06-21'],
  ['2026-06-28', '2026-06-22', '2026-06-28'],
  ['2026-07-05', '2026-06-29', '2026-07-05'],
  ['2026-07-12', '2026-07-06', '2026-07-12'],
  ['2026-07-19', '2026-07-13', '2026-07-19'],
  ['2026-07-26', '2026-07-20', '2026-07-26'],
  ['2026-08-02', '2026-07-27', '2026-08-02'],
  ['2026-08-09', '2026-08-03', '2026-08-09'],
  ['2026-08-16', '2026-08-10', '2026-08-16'],
  ['2026-08-23', '2026-08-17', '2026-08-23'],
  ['2026-08-30', '2026-08-24', '2026-08-30'],
  ['2026-09-06', '2026-08-31', '2026-09-06'],
  ['2026-09-13', '2026-09-07', '2026-09-13'],
  ['2026-09-20', '2026-09-14', '2026-09-20'],
  ['2026-09-27', '2026-09-21', '2026-09-27'],
  ['2026-10-04', '2026-09-28', '2026-10-04'],
];

const reports = periods.map(([issue, start, end]) => ({
  file: new URL(`../${issue}.html`, import.meta.url),
  issue,
  start,
  end,
}));

for (const report of reports) {
  test(`${report.issue} is a standalone, dated report`, async () => {
    const html = await readFile(report.file, 'utf8');

    assert.match(html, /<!doctype html>/i);
    assert.match(html, new RegExp(`data-issue-date=["']${report.issue}["']`));
    assert.match(html, new RegExp(`data-period-start=["']${report.start}["']`));
    assert.match(html, new RegExp(`data-period-end=["']${report.end}["']`));
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
    assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i);
    assert.doesNotMatch(html, /<svg\b[^>]*\bheight=["']auto["']/i);
  });

  test(`${report.issue} articles expose evidence and four feedback controls`, async () => {
    const html = await readFile(report.file, 'utf8');
    const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
    const primaryArticleBlocks = articleBlocks.filter((article) => !/data-article-id=["']ai-self-update-recheck["']/.test(article));
    const articleCount = primaryArticleBlocks.length;

    const explicitlyEmpty = /有意な更新なし/.test(html);
    assert.ok(articleCount >= 1 || explicitlyEmpty, `expected at least 1 article or an explicit no-update report, got ${articleCount}`);
    assert.ok((html.match(/class=["'][^"']*source-link/gi) ?? []).length >= articleCount);
    for (const article of primaryArticleBlocks) {
      for (const value of ['important', 'try', 'watch', 'dismiss']) {
        const count = (article.match(new RegExp(`data-feedback=["']${value}["']`, 'gi')) ?? []).length;
        assert.equal(count, 1, `${value} must appear once per article`);
      }
    }
  });

  test(`${report.issue} articles connect news to current work without forced matches`, async () => {
    const html = await readFile(report.file, 'utf8');
    const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);

    for (const article of articleBlocks) {
      assert.equal((article.match(/<section\b[^>]*class=["']work-relevance["']/gi) ?? []).length, 1, 'one work relevance block per article');
      assert.equal((article.match(/class=["'][^"']*relevance-state\b/gi) ?? []).length, 1, 'one adoption state per article');
      assert.match(article, /data-linear-snapshot=["']2026-08-16["']/);
      const hasLinearLink = /href=["']https:\/\/linear\.app\/5-10\/(?:issue|project)\//.test(article);
      const explicitlyUnmatched = /直接該当なし/.test(article);
      assert.ok(hasLinearLink || explicitlyUnmatched, 'link verified Linear work or state that no direct match exists');
    }
  });

  test(`${report.issue} persists and exports feedback locally`, async () => {
    const html = await readFile(report.file, 'utf8');

    assert.match(html, new RegExp(`p-p-TechNews:${report.issue}`));
    assert.match(html, /localStorage\.getItem/);
    assert.match(html, /localStorage\.setItem/);
    assert.match(html, /new Blob\s*\(/);
    assert.match(html, /URL\.createObjectURL/);
    assert.match(html, new RegExp(`technews-feedback-${report.issue}\\.json`));
    assert.match(html, /aria-pressed/);
  });
}

test('at least one report contains an inline explanatory diagram', async () => {
  const html = (await Promise.all(reports.map(({ file }) => readFile(file, 'utf8')))).join('\n');
  assert.match(html, /<svg\b[^>]*role=["']img["']/i);
});

test('final SVG fallbacks are embedded in every affected article, not deferred to a later issue', async () => {
  for (const issue of ['2026-09-20', '2026-09-27']) {
    const html = await readFile(new URL(`../${issue}.html`, import.meta.url), 'utf8');
    const jobs = JSON.parse(await readFile(new URL(`../assets/diagrams/${issue}.jobs.json`, import.meta.url), 'utf8'));
    for (const job of jobs.jobs.filter((entry) => entry.status === 'fallback-inline-svg')) {
      const article = html.match(new RegExp(`<article\\b[^>]*data-article-id=["']${job.articleId}["'][^>]*>[\\s\\S]*?<\\/article>`, 'i'))?.[0];
      assert.ok(article, `missing article ${job.articleId}`);
      assert.match(article, /<svg\b[^>]*\brole=["']img["'][^>]*\baria-labelledby=["'][^"']+["']/i);
      assert.match(article, /<title\b[^>]*>\s*\S[\s\S]*?<\/title>/i);
      assert.match(article, /NotebookLM図解の最終フォールバック/);
    }
  }
});
test('index links every completed weekly report without external assets', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i);
  for (const [issue] of periods) {
    assert.match(html, new RegExp(`href=["']${issue}\\.html["']`));
  }
  assert.equal((html.match(/class=["'][^"']*issue-card/gi) ?? []).length, periods.length);
});

test('weekly reports expose accumulated knowledge when an article is linked', async () => {
  const html = await readFile(new URL('../2026-06-07.html', import.meta.url), 'utf8');
  assert.match(html, /class=["'][^"']*knowledge-relevance/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /検証日: 2026-08-27/);
  assert.match(html, /https:\/\/developer\.mozilla\.org\/en-US\/docs\/Web\/API\/Intersection_Observer_API/);
  assert.match(html, /href=["']knowledge\/wiki\/js-intersection-observer\.html["']/);
  assert.match(html, /href=["']knowledge\/wiki\/html-image-dimensions\.html["']/);
  assert.match(html, /逆リンク/);
});

test('weekly reports distinguish registered article coverage from missing related knowledge', async () => {
  const html = await readFile(new URL('../2026-05-17.html', import.meta.url), 'utf8');
  const article = html.match(/<article\b[^>]*data-article-id=["']node-22-22-3["'][^>]*>[\s\S]*?<\/article>/i)?.[0];
  assert.ok(article, 'missing node-22-22-3 article');
  assert.match(article, /class=["'][^"']*knowledge-relevance/);
  assert.match(article, /この記事は記事として登録済み/);
  assert.match(article, /関連知識なし/);
  assert.doesNotMatch(article, /現行知識では未登録/);
});

test('index shows chronological issue numbers for every completed report', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  periods.forEach(([issue], index) => {
    const number = String(index + 1).padStart(2, '0');
    const card = html.match(new RegExp(`<article\\b[^>]*class=["'][^"']*issue-card[^"']*["'][^>]*data-issue-date=["']${issue}["'][^>]*>[\\s\\S]*?<\\/article>`))?.[0];
    assert.ok(card, `missing card for ${issue}`);
    assert.match(card, new RegExp(`href=["']${issue}\\.html["']`));
    assert.match(card, new RegExp(`class=["'][^"']*issue-number[^"']*["'][^>]*>第${number}号<`));
  });
});

test('2026-08-16 distinguishes YouTube discovery from primary evidence', async () => {
  const html = await readFile(new URL('../2026-08-16.html', import.meta.url), 'utf8');
  const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);

  assert.equal(articleBlocks.length, 6);
  for (const article of articleBlocks) {
    assert.match(article, /class=["'][^"']*discovery-link/);
    assert.match(article, /href=["']https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.match(article, /発見元YouTube/);
    assert.match(article, /class=["'][^"']*source-link/);
  }
  assert.match(html, /<svg\b[^>]*role=["']img["'][^>]*aria-labelledby=["']youtube-pipeline-title youtube-pipeline-desc["']/i);
});

test('2026-08-30 turns the collected YouTube signals into a substantive weekly selection', async () => {
  const html = await readFile(new URL('../2026-08-30.html', import.meta.url), 'utf8');
  const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => match[0])
    .filter((article) => !/data-article-id=["']ai-self-update-recheck["']/.test(article));

  assert.ok(articleBlocks.length >= 6, 'the 81 collected candidates must yield at least six primary-source-verified items');
  assert.ok(articleBlocks.some((article) => /data-article-id=["']microsoft-agentic-containment["']/.test(article)), 'missing the verified Microsoft agentic-containment addition');
  for (const article of articleBlocks) {
    assert.match(article, /class=["'][^"']*discovery-link/);
    assert.match(article, /class=["'][^"']*source-link/);
  }
});

test('2026-09-06 records the weekly discovery, official-primary selection, and NotebookLM diagram state', async () => {
  const html = await readFile(new URL('../2026-09-06.html', import.meta.url), 'utf8');
  const discovery = JSON.parse(await readFile(new URL('../discovery/2026-09-06.json', import.meta.url), 'utf8'));
  const diagramJobs = JSON.parse(await readFile(new URL('../assets/diagrams/2026-09-06.jobs.json', import.meta.url), 'utf8'));
  const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => match[0])
    .filter((article) => !/data-article-id=["']ai-self-update-recheck["']/.test(article));

  assert.equal(discovery.failures.length, 0);
  assert.equal(discovery.candidates.length, 94);
  assert.equal(articleBlocks.length, 8);
  assert.equal(diagramJobs.jobs.length, articleBlocks.length);
  assert.ok(diagramJobs.jobs.every((job) => job.status === 'embedded' && job.embedded));
  assert.ok(diagramJobs.jobs.every((job) => job.verification.mimeType === 'image/png'));
  assert.ok(diagramJobs.jobs.every((job) => /^[a-f0-9]{64}$/.test(job.verification.sha256)));
  for (const article of articleBlocks) {
    assert.match(article, /class=["'][^"']*discovery-link/);
    assert.match(article, /class=["'][^"']*source-link/);
  }
  assert.match(html, /高能力化を、モデル選択で終わらせず制御面へ戻す。/);
  assert.match(html, /<svg\b[^>]*role=["']img["'][^>]*aria-labelledby=["']youtube-pipeline-title youtube-pipeline-desc["']/i);
});

test('2026-09-13 records the weekly discovery, official-primary selection, and embedded NotebookLM PNGs', async () => {
  const html = await readFile(new URL('../2026-09-13.html', import.meta.url), 'utf8');
  const discovery = JSON.parse(await readFile(new URL('../discovery/2026-09-13.json', import.meta.url), 'utf8'));
  const diagramJobs = JSON.parse(await readFile(new URL('../assets/diagrams/2026-09-13.jobs.json', import.meta.url), 'utf8'));
  const articleBlocks = [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => match[0])
    .filter((article) => !/data-article-id=["']ai-self-update-recheck["']/.test(article));

  assert.equal(discovery.failures.length, 0);
  assert.equal(discovery.candidates.length, 87);
  assert.equal(articleBlocks.length, 7);
  assert.equal(diagramJobs.jobs.length, articleBlocks.length);
  assert.ok(diagramJobs.jobs.every((job) => job.status === 'embedded' && job.embedded === true));
  assert.ok(diagramJobs.jobs.every((job) => job.sourceCleanup === 'completed'));
  assert.ok(diagramJobs.jobs.every((job) => job.verification?.mimeType === 'image/png' && job.verification.bytes > 0));
  for (const article of articleBlocks) {
    assert.match(article, /class=["'][^"']*discovery-link/);
    assert.match(article, /class=["'][^"']*source-link/);
    assert.match(article, /data:image\/png;base64,/);
  }
});

test('2026-08-16 has a separate AI self-update re-evaluation radar', async () => {
  const html = await readFile(new URL('../2026-08-16.html', import.meta.url), 'utf8');
  const radar = html.match(/<section\b[^>]*class=["'][^"']*recheck-radar[^"']*["'][^>]*>[\s\S]*?<\/article><\/section>/i)?.[0];

  assert.ok(radar, 'missing independent re-evaluation radar');
  assert.match(radar, /AI自己更新・再判定レーダー/);
  assert.match(radar, /以前の判断/);
  assert.match(radar, /現在の再判定/);
  assert.match(radar, /次の一手/);
  assert.match(radar, /今週、判断を変える更新なし/);
  assert.match(radar, /発見元YouTube/);
  assert.match(radar, /公式一次情報/);
  assert.equal((radar.match(/class=["'][^"']*recheck-item\b/gi) ?? []).length, 5);
  const recheckGrid = radar.match(/<div\b[^>]*class=["'][^"']*recheck-grid[^"']*["'][^>]*>[\s\S]*?<\/div><p class=["']recheck-empty-rule["']/i)?.[0];
  assert.ok(recheckGrid, 'missing complete re-evaluation grid');
  assert.equal((recheckGrid.match(/class=["'][^"']*recheck-item\b/gi) ?? []).length, 5);
  assert.equal((radar.match(/data-feedback=["'](?:important|try|watch|dismiss)["']/gi) ?? []).length, 4);
  assert.match(radar, /<article\b[^>]*data-article-id=["']ai-self-update-recheck["'][^>]*>[\s\S]*?<h2\b/);
  assert.match(radar, /AIごとにスキルを別管理するしかない、を再判定/);
  assert.match(radar, /https:\/\/agent-plugins\.org\/specification/);
  assert.match(radar, /https:\/\/www\.youtube\.com\/watch\?v=WDCRNBB3Xhs/);
  assert.match(radar, /AI自身の更新をYouTube経由で知れば足りる、を再判定/);
  assert.match(radar, /Desktop app／Codex CLI／Remote／General/);
  assert.match(radar, /https:\/\/learn\.chatgpt\.com\/docs\/changelog/);
  assert.match(radar, /サブエージェントへ文脈を手作業で渡すしかない、を再判定/);
  assert.match(radar, /v2\.1\.232/);
  assert.match(radar, /https:\/\/github\.com\/anthropics\/claude-code\/releases\/tag\/v2\.1\.232/);
  assert.match(radar, /https:\/\/github\.com\/anthropics\/claude-code\/blob\/main\/CHANGELOG\.md/);
  assert.match(radar, /https:\/\/www\.anthropic\.com\/news/);
  assert.match(html, /選択済み 0 \/ 6 項目/);
});

test('index summarizes linked Linear work and leaves unmatched work unlabelled', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /直接該当なし/);
  const issueCards = [...html.matchAll(/<article\b[^>]*class=["'][^"']*issue-card[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const cardsWithRelatedWork = issueCards.filter((card) => /class=["'][^"']*index-relevance\b/.test(card));
  assert.equal((html.match(/class=["'][^"']*index-relevance\b/gi) ?? []).length, cardsWithRelatedWork.length);
  const july26 = html.match(/<article\b[^>]*class=["'][^"']*issue-card[^"']*["'][^>]*data-issue-date=["']2026-07-26["'][^>]*>[\s\S]*?<\/article>/)?.[0];
  assert.ok(july26);
  assert.match(july26, /href=["']https:\/\/linear\.app\/5-10\/issue\/5-8\//);
  assert.match(july26, />5-8 帳票構造JSON基盤 →<\/a>/);
  assert.match(july26, /Linear照合: 2026-08-16時点/);
  assert.doesNotMatch(july26, /(?:に有効|で試験候補|に反映候補|に関連)/);
});

test('all reports and the index use the muted ivory theme', async () => {
  const files = [...reports.map(({ file }) => file), new URL('../index.html', import.meta.url)];
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    assert.match(html, /<html\b[^>]*data-theme=["']muted-ivory["']/);
    assert.match(html, /color-scheme:\s*light/);
    assert.match(html, /--bg:\s*#e4ded1/i);
    assert.match(html, /--ink:\s*#292722/i);
  }
});

test('reports support a11y focus-visible, touch targets and print layout', async () => {
  const html = await readFile(new URL('../2026-08-16.html', import.meta.url), 'utf8');
  assert.match(html, /:focus-visible/);
  assert.match(html, /min-height:\s*44px/);
  assert.match(html, /@media\s+print/);
  assert.match(html, /break-inside:\s*avoid/);
  assert.match(html, /attr\(href\)/);
});

test('muted ivory theme keeps redesigned links readable', async () => {
  const html = await readFile(new URL('../2026-06-07.html', import.meta.url), 'utf8');
  assert.match(html, /\.source-link\{[^}]*background:#f5f0e7[^}]*color:#40364a/);
  assert.match(html, /\.knowledge-relevance\{[^}]*background:#f5f0e7[^}]*color:#292722/);
  assert.match(html, /\.knowledge-empty\{[^}]*color:#4a4640/);
  assert.match(html, /\.discovery-link\{[^}]*background:#e2eeee[^}]*color:#28585a/);
  assert.match(html, /\.decision\{[^}]*background:#dce8de[^}]*color:#28583d/);
});

test('selected articles include distinct explanatory diagrams', async () => {
  const html = await readFile(new URL('../2026-06-07.html', import.meta.url), 'utf8');
  const diagrams = [...html.matchAll(/<figure class=["'][^"']*article-diagram[^"']*["'][\s\S]*?<\/figure>/gi)].map((match) => match[0]);
  assert.ok(diagrams.length >= 2, `expected at least 2 article diagrams, got ${diagrams.length}`);
  assert.match(diagrams[0], /role=["']img["']/);
  assert.match(html, /処理ボトルネック/);
  assert.match(html, /出典の鎖/);
});

test('article diagrams provide structured infographic visuals with accessible semantics', async () => {
  const html = await readFile(new URL('../2026-06-07.html', import.meta.url), 'utf8');
  const diagrams = [...html.matchAll(/<figure class=["'][^"']*article-diagram[^"']*["'][\s\S]*?<\/figure>/gi)].map((match) => match[0]);
  const svgDiagrams = diagrams.filter((diagram) => diagram.includes('<svg'));

  for (const diagram of diagrams) {
    if (diagram.includes('generated-infographic')) {
      assert.match(diagram, /<img\b[^>]*alt=["'][^"']+["']/);
      assert.match(diagram, /src=["']data:image\/png;base64,/);
      continue;
    }
    assert.match(diagram, /<svg\b[^>]*\brole=["']img["']/);
    assert.match(diagram, /<title\b[^>]*id=["'][^"']+["']/);
    assert.match(diagram, /<desc\b[^>]*id=["'][^"']+["']/);
    assert.match(diagram, /aria-labelledby=/);
    assert.match(diagram, /class=["'][^"']*diag-card/);
    assert.match(diagram, /class=["'][^"']*diag-badge-/);
    assert.match(diagram, /class=["'][^"']*diag-text-title/);
    assert.match(diagram, /class=["'][^"']*diag-text-sub/);
  }

  assert.match(svgDiagrams.join('\n'), /DECISION/);
  assert.match(svgDiagrams.join('\n'), />YES</);
  assert.match(svgDiagrams.join('\n'), />NO</);
  assert.match(svgDiagrams.join('\n'), /ブラウザ内完結/);
  assert.match(svgDiagrams.join('\n'), /Worker \/ CLIへ分離/);

  assert.match(html, /generated-infographic/);
  assert.match(html, /出典の鎖：発見入口から公式資料への再照合/);
});

test('system concept page explains the cross-project job architecture', async () => {
  const html = await readFile(new URL('../system-concept.html', import.meta.url), 'utf8');
  assert.match(html, /共通ジョブ正本/);
  assert.match(html, /Workspace Studio/);
  assert.match(html, /GAS/);
  assert.match(html, /CLI/);
  assert.match(html, /queued/);
  assert.match(html, /done/);
  assert.match(html, /failed/);
  assert.match(html, /<svg\b[^>]*role=["']img["']/);
  assert.match(html, /5-114/);
});
