import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtml } from './render-html.mjs';

const fact = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'デモ v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }], status: 'active', supersededBy: null,
};
const issues = [{
  issue: '2026-09-06',
  entries: [
    { videoId: 'v1', channel: 'テックニュース@ATI', title: '採った動画', url: 'https://youtu.be/v1', disposition: 'accepted', reason: '仕様が変わる', facts: ['demo-fact'] },
    { videoId: 'v2', channel: 'テックニュース@ATI', title: '外した動画', url: 'https://youtu.be/v2', disposition: 'rejected', reason: '訴訟であり振る舞いは変わらない', facts: [] },
  ],
}];

test('renderHtml opens standalone with no external assets', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.equal(/<script\s[^>]*src=|<link\s/.test(html), false);
});

test('renderHtml shows why each candidate was kept or dropped', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('訴訟であり振る舞いは変わらない'));
  assert.ok(html.includes('仕様が変わる'));
});

test('renderHtml marks an unused fact as not yet referenced', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('まだ使われていない'));
});

test('renderHtml shows the hit reason next to the fact it belongs to', () => {
  const hits = [{ ts: '2026-09-11T10:00:00+09:00', topic: 'Linear 5-99', item: 'demo-fact', effect: 'changed', note: '調査依頼で --restricted を提案した' }];
  const html = renderHtml({ issues, facts: [fact], hits });
  assert.ok(html.includes('調査依頼で --restricted を提案した'));
  assert.ok(html.includes('Linear 5-99'));
  assert.equal(html.includes('まだ使われていない'), false);
});

test('renderHtml states that self-reported hits are weak evidence', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('弱い証拠'));
  assert.ok(html.includes('強い証拠'));
});

test('renderHtml escapes values that would otherwise break the markup', () => {
  const nasty = { ...fact, fact: '<script>alert(1)</script>' };
  const html = renderHtml({ issues: [], facts: [nasty], hits: [] });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderHtml keeps a superseded fact visible as history', () => {
  const gone = { ...fact, id: 'old-fact', fact: '古い事実', status: 'superseded', supersededBy: 'demo-fact' };
  const html = renderHtml({ issues: [], facts: [fact, gone], hits: [] });
  assert.ok(html.includes('古い事実'));
});

test('renderHtml links the discovery origin to its video', () => {
  const html = renderHtml({ issues: [], facts: [fact], hits: [] });
  assert.ok(html.includes('https://www.youtube.com/watch?v=v1'));
  assert.ok(html.includes('>2026-09-06</a>'));
});

test('renderHtml still shows the issue when a discovery entry has no videoId', () => {
  const noVideo = { ...fact, discoveredIn: [{ issue: '2026-08-30' }] };
  const html = renderHtml({ issues: [], facts: [noVideo], hits: [] });
  assert.ok(html.includes('2026-08-30'));
  assert.equal(html.includes('watch?v=undefined'), false);
});

test('renderHtml shows the discovery video title, not just the issue', () => {
  const withTitle = { ...fact, discoveredIn: [{ issue: '2026-09-06', videoId: 'v1', title: '動画のタイトル', channel: 'テックニュース@ATI' }] };
  const html = renderHtml({ issues: [], facts: [withTitle], hits: [] });
  assert.ok(html.includes('動画のタイトル'));
  assert.ok(html.includes('テックニュース@ATI'));
  assert.ok(html.includes('https://www.youtube.com/watch?v=v1'));
});

test('renderHtml marks a fact whose verification has gone stale', () => {
  const old = { ...fact, verified: '2026-01-01' };
  const html = renderHtml({ issues: [], facts: [old], hits: [], generated: '2026-09-10' });
  assert.ok(html.includes('未再確認'));
});

test('renderHtml does not mark a recently verified fact as stale', () => {
  const html = renderHtml({ issues: [], facts: [fact], hits: [], generated: '2026-09-10' });
  assert.equal(html.includes('未再確認'), false);
});

test('renderHtml shows dispositions in Japanese, not raw enum values', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('採用'));
  assert.ok(html.includes('不採用'));
  assert.equal(/<dd>accepted<\/dd>|<dd>rejected<\/dd>/.test(html), false);
});

test('renderHtml falls back to the raw value for an unknown disposition', () => {
  const odd = [{ issue: '2026-09-06', entries: [{ videoId: 'v9', channel: 'c', title: 't', url: 'u', disposition: 'maybe', reason: 'r', facts: [] }] }];
  const html = renderHtml({ issues: odd, facts: [], hits: [] });
  assert.ok(html.includes('maybe'));
});
