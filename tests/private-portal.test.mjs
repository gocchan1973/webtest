import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { portalEntries, buildPortalIndex } from '../portal/build-index.mjs';

test('private portal keeps TechNews active and supports collection lifecycle metadata', () => {
  const technews = portalEntries.find((entry) => entry.id === 'technews');

  assert.ok(technews);
  assert.equal(technews.status, 'active');
  assert.equal(technews.cadence, 'weekly');
  assert.ok(technews.path);
  assert.ok(portalEntries.every((entry) => ['active', 'paused', 'archived'].includes(entry.status)));
});

test('private portal index links registered collections and separates archived entries', async () => {
  const html = await buildPortalIndex([...portalEntries, {
    id: 'retired-source',
    title: '終了した調査',
    description: '保管済みの調査',
    path: '/collections/retired-source/',
    cadence: 'monthly',
    status: 'archived',
    updatedAt: '2026-08-01',
  }]);

  assert.match(html, /TechNews/);
  assert.match(html, /collections\/technews/);
  assert.match(html, /data-status="active"/);
  assert.match(html, /data-status="archived"/);
  assert.match(await readFile(new URL('../portal/index.html', import.meta.url), 'utf8'), /情報ハブ/);
});
