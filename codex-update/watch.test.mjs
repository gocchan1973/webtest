import assert from 'node:assert/strict';
import test from 'node:test';
import { isTargetTitle, markCandidates } from './watch.mjs';

const channels = [
  { handle: 'tech_news_ati', label: 'テックニュース@ATI', toolWatch: true },
  { handle: 'other', label: '別チャンネル' },
];

test('isTargetTitle matches Codex, OpenAI, and GPT titles', () => {
  assert.ok(isTargetTitle('Codex CLI の承認モードが変わった'));
  assert.ok(isTargetTitle('OpenAI API の新しい制限'));
  assert.ok(isTargetTitle('GPT-6 のツール呼び出し'));
  assert.ok(isTargetTitle('コードエックス CLI の話'));
});

test('isTargetTitle ignores unrelated titles', () => {
  assert.equal(isTargetTitle('Claude Code の restricted モード'), false);
  assert.equal(isTargetTitle('Gemini の新機能'), false);
});

test('markCandidates keeps a behavior relevant title without update vocabulary', () => {
  const candidate = {
    channel: 'テックニュース@ATI', videoId: 'a',
    title: 'Codex の承認モードを回避する方法', url: 'u', published: '2026-09-05',
  };
  assert.deepEqual(markCandidates([candidate], channels), [candidate]);
});

test('markCandidates ignores channels without toolWatch', () => {
  const candidate = {
    channel: '別チャンネル', videoId: 'b',
    title: 'OpenAI のアップデート', url: 'u', published: '2026-09-05',
  };
  assert.deepEqual(markCandidates([candidate], channels), []);
});

test('markCandidates rejects a watched candidate with a missing field', () => {
  assert.throws(
    () => markCandidates([{ channel: 'テックニュース@ATI', title: 'Codex' }], channels),
    /candidate is missing/,
  );
});
