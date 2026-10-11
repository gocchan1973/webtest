import assert from 'node:assert/strict';
import test from 'node:test';

import { validateWeeklySelection } from '../weekly-selection.mjs';

test('substantive weekly selection accepts five through ten verified articles', () => {
  assert.doesNotThrow(() => validateWeeklySelection({ issue: '2026-08-30', candidateCount: 81, articleCount: 5 }));
  assert.doesNotThrow(() => validateWeeklySelection({ issue: '2026-08-30', candidateCount: 81, articleCount: 10 }));
});

test('substantive weekly selection rejects an unexplained sparse issue', () => {
  assert.throws(
    () => validateWeeklySelection({ issue: '2026-08-30', candidateCount: 81, articleCount: 4 }),
    /at least 5 verified articles/,
  );
});

test('substantive weekly selection permits a documented exception', () => {
  assert.doesNotThrow(() => validateWeeklySelection({
    issue: '2026-08-30',
    candidateCount: 81,
    articleCount: 2,
    exception: '公式一次情報で対象週の公開日を確認できた候補が2件だけだった。',
  }));
});
