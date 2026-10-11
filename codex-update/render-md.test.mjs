import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from './render-md.mjs';

const active = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'Codex CLI v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  status: 'active', supersededBy: null,
};
const gone = { ...active, id: 'old-fact', status: 'superseded', supersededBy: 'demo-fact' };

test('renderMarkdown lists only active facts with scope and source', () => {
  const md = renderMarkdown({ facts: [active, gone] });
  assert.ok(md.includes('デモの事実'));
  assert.ok(md.includes('デモのときはこうする'));
  assert.ok(md.includes('Codex CLI v1〜'));
  assert.ok(md.includes('https://example.com/official'));
  assert.equal(md.includes('old-fact'), false);
});

test('renderMarkdown states plainly when nothing has been recorded yet', () => {
  assert.ok(renderMarkdown({ facts: [] }).includes('0 件'));
});

test('renderMarkdown warns that entries are scoped reference material', () => {
  assert.ok(renderMarkdown({ facts: [active] }).includes('適用条件'));
});

test('renderMarkdown keeps fact values on one line', () => {
  const md = renderMarkdown({ facts: [{
    ...active,
    fact: '一行目\n## 偽見出し',
    behavior: '前半\r\n- 偽項目',
  }] });
  assert.ok(md.includes('## 一行目 ## 偽見出し'));
  assert.ok(md.includes('**こう振る舞う**: 前半 - 偽項目'));
  assert.equal(md.includes('\n## 偽見出し'), false);
  assert.equal(md.includes('\n- 偽項目'), false);
});

test('renderMarkdown preserves a source URL containing a closing parenthesis', () => {
  const md = renderMarkdown({ facts: [{ ...active, source: 'https://example.com/docs_(v2)' }] });
  assert.ok(md.includes('https://example.com/docs_(v2%29'));
});
