import assert from 'node:assert/strict';
import test from 'node:test';
import { renderIndexHtml, renderFactsHtml, renderIssueHtml } from './render-html.mjs';

const fact = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'Codex CLI v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1', title: '発見動画', channel: 'テックニュース@ATI' }],
  status: 'active', supersededBy: null,
};
const issues = [{ issue: '2026-09-06', entries: [
  { videoId: 'v1', channel: 'テックニュース@ATI', title: '採った動画', url: 'https://youtu.be/v1', disposition: 'accepted', reason: '仕様が変わる', facts: ['demo-fact'] },
  { videoId: 'v2', channel: 'テックニュース@ATI', title: '外した動画', url: 'https://youtu.be/v2', disposition: 'rejected', reason: '企業ニュースで振る舞いは変わらない', facts: [] },
] }];

test('renderIssueHtml is standalone and shows candidate decisions', () => {
  const html = renderIssueHtml({ issue: issues[0].issue, entries: issues[0].entries });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.equal(/<script\s[^>]*src=|<link\s/.test(html), false);
  assert.ok(html.includes('仕様が変わる'));
  assert.ok(html.includes('企業ニュースで振る舞いは変わらない'));
});

test('renderFactsHtml distinguishes unused facts from recorded hits', () => {
  const unused = renderFactsHtml({ facts: [fact], hits: [] });
  assert.ok(unused.includes('参照記録なし'));
  assert.ok(unused.includes('実際に使われていない証明ではない'));
  const used = renderFactsHtml({ facts: [fact], hits: [{ ts: '2026-09-11T10:00:00+09:00', topic: '案件', item: 'demo-fact', effect: 'changed', note: '承認モードを選んだ' }] });
  assert.ok(used.includes('承認モードを選んだ'));
  assert.ok(used.includes('案件'));
  assert.equal(used.includes('まだ使われていない'), false);
});

test('renderFactsHtml displays UTC hit timestamps as Japan calendar dates', () => {
  const html = renderFactsHtml({
    facts: [fact],
    hits: [{ ts: '2026-09-10T15:30:00.000Z', topic: '深夜案件', item: 'demo-fact', effect: 'changed', note: '' }],
  });
  assert.ok(html.includes('2026-09-11'));
  assert.equal(html.includes('2026-09-10 ／ 深夜案件'), false);
});

test('renderFactsHtml explains the limits of self-reported hit records', () => {
  const html = renderFactsHtml({ facts: [fact], hits: [] });
  assert.ok(html.includes('弱い証拠'));
  assert.ok(html.includes('実際に読まれていない証明ではない'));
  assert.equal(html.includes('0 件が続く」という事実は強い証拠'), false);
});

test('renderFactsHtml escapes text and rejects unsafe links', () => {
  const nasty = { ...fact, fact: '<script>alert(1)</script>', source: 'javascript:alert(1)' };
  const html = renderFactsHtml({ facts: [nasty], hits: [] });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.includes('href="javascript:'), false);
});

test('renderFactsHtml keeps superseded facts visible as history and links discovery', () => {
  const gone = { ...fact, id: 'old-fact', fact: '古い事実', status: 'superseded', supersededBy: 'demo-fact' };
  const html = renderFactsHtml({ facts: [fact, gone], hits: [] });
  assert.ok(html.includes('古い事実'));
  assert.ok(html.includes('https://www.youtube.com/watch?v=v1'));
  assert.ok(html.includes('発見動画'));
});

test('renderFactsHtml marks old verification dates as stale', () => {
  const html = renderFactsHtml({ facts: [{ ...fact, verified: '2026-01-01' }], hits: [], generated: '2026-09-10' });
  assert.ok(html.includes('未再確認'));
});

test('renderIndexHtml is a concise archive overview with safe relative links', () => {
  const html = renderIndexHtml({ issues, facts: [fact], hits: [], generated: '2026-09-10' });
  assert.ok(html.includes('href="articles/facts.html"'));
  assert.ok(html.includes('href="articles/2026-09-06.html"'));
  assert.ok(html.includes('有効な事実 1 件'));
  assert.ok(html.includes('印 2 件'));
  assert.equal(html.includes('こう振る舞う'), false);
  assert.equal(html.includes('企業ニュースで振る舞いは変わらない'), false);
  assert.equal(/<script\s[^>]*src=|<link\s/.test(html), false);
});

test('renderIndexHtml rejects traversal in generated issue links', () => {
  const html = renderIndexHtml({ issues: [{ issue: '../../escape', entries: [] }], facts: [], hits: [] });
  assert.equal(html.includes('href="articles/../../escape.html"'), false);
  assert.ok(html.includes('href="#"'));
});

test('renderFactsHtml contains detailed facts and links back to the index', () => {
  const html = renderFactsHtml({ issues: [], facts: [fact], hits: [], generated: '2026-09-10' });
  assert.ok(html.includes('href="../index.html"'));
  assert.ok(html.includes('こう振る舞う'));
  assert.ok(html.includes('デモの事実'));
  assert.equal(/<script\s[^>]*src=|<link\s/.test(html), false);
});

test('renderIssueHtml contains only one issue and links back to the index', () => {
  const html = renderIssueHtml({ issue: '2026-09-06', entries: issues[0].entries, generated: '2026-09-10' });
  assert.ok(html.includes('href="../index.html"'));
  assert.ok(html.includes('採った動画'));
  assert.ok(html.includes('企業ニュースで振る舞いは変わらない'));
  assert.equal(html.includes('デモの事実'), false);
  assert.equal(/<script\s[^>]*src=|<link\s/.test(html), false);
});
