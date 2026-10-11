import assert from 'node:assert/strict';
import test from 'node:test';
import { formatJapanDate } from './date.mjs';

test('formatJapanDate uses the Japan calendar day across the UTC boundary', () => {
  assert.equal(formatJapanDate('2026-09-10T15:30:00.000Z'), '2026-09-11');
  assert.equal(formatJapanDate('2026-09-10T14:59:59.999Z'), '2026-09-10');
});

test('formatJapanDate rejects an invalid timestamp', () => {
  assert.throws(() => formatJapanDate('not-a-date'), /有効な日時/);
});
