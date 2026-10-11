import assert from 'node:assert/strict';
import test from 'node:test';
import { isTargetTitle, markCandidates } from './watch.mjs';

const channels = [
  { handle: 'tech_news_ati', label: 'テックニュース@ATI', toolWatch: true },
  { handle: 'ai_masaou', label: 'まさおAIじっくり解説ch' },
];

test('isTargetTitle matches Claude and Anthropic in both scripts', () => {
  assert.ok(isTargetTitle('Claude Code v2.1.251 アップデートまとめ'));
  assert.ok(isTargetTitle('claude code の話'));
  assert.ok(isTargetTitle('Anthropic に音楽業界が集団提訴'));
  assert.ok(isTargetTitle('クロードコードの新機能'));
  assert.ok(isTargetTitle('アンソロピックの新モデル'));
});

test('isTargetTitle does not match unrelated titles', () => {
  assert.equal(isTargetTitle('Codex CLI 夏の目玉7選'), false);
  assert.equal(isTargetTitle('GPT-6 Astra が発表'), false);
});

// AND を入れない判断の回帰テスト。
// 対象語 かつ 更新語 の AND にすると、このタイトルが落ちる。
// しかし Claude の既定の安全性が変わる事実なので拾うべきもの。
test('markCandidates keeps a behaviour-relevant title that has no update vocabulary', () => {
  const candidates = [
    { channel: 'テックニュース@ATI', videoId: 'a', title: '週刊IT技術ニュース｜Claude Code の auto mode が破られる', url: 'u', published: '2026-09-05' },
  ];
  assert.equal(markCandidates(candidates, channels).length, 1);
});

test('markCandidates ignores channels without toolWatch', () => {
  const candidates = [
    { channel: 'まさおAIじっくり解説ch', videoId: 'b', title: 'Claude Fable 5.1 が登場', url: 'u', published: '2026-09-05' },
  ];
  assert.deepEqual(markCandidates(candidates, channels), []);
});

test('markCandidates returns the marked candidates unchanged', () => {
  const candidate = { channel: 'テックニュース@ATI', videoId: 'c', title: 'Claude Code v2.1.251', url: 'u', published: '2026-09-05' };
  assert.deepEqual(markCandidates([candidate], channels), [candidate]);
});

test('markCandidates rejects a candidate whose shape is unexpected', () => {
  assert.throws(
    () => markCandidates([{ channel: 'テックニュース@ATI', title: 'Claude' }], channels),
    /candidate is missing/,
  );
});
