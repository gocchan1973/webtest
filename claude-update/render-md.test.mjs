import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from './render-md.mjs';

const active = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'デモ v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }], status: 'active', supersededBy: null,
};
const gone = { ...active, id: 'old-fact', status: 'superseded', supersededBy: 'demo-fact' };

test('renderMarkdown lists only active facts', () => {
  const md = renderMarkdown({ facts: [active, gone] });
  assert.ok(md.includes('デモの事実'));
  assert.equal(md.includes('old-fact'), false);
});

test('renderMarkdown always carries scope and source with the fact', () => {
  const md = renderMarkdown({ facts: [active] });
  assert.ok(md.includes('デモ v1〜'));
  assert.ok(md.includes('https://example.com/official'));
  assert.ok(md.includes('デモのときはこうする'));
});

test('renderMarkdown states plainly when nothing has been recorded yet', () => {
  const md = renderMarkdown({ facts: [] });
  assert.ok(md.includes('0 件'));
});

test('renderMarkdown warns that entries are scoped reference material', () => {
  const md = renderMarkdown({ facts: [active] });
  assert.ok(md.includes('適用条件'));
});
