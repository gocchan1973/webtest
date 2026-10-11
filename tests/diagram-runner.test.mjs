import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseNextArticle,
  createRunnerLease,
  isLeaseActive,
  planIssueRun
} from '../diagram-runner.mjs';

test('runner lease remains active for the full NotebookLM wait window', () => {
  const lease = createRunnerLease({
    issue: '2026-10-04',
    articleId: 'one',
    now: '2026-10-04T12:00:00.000Z',
    runId: 'test-run'
  });

  assert.equal(lease.status, 'running');
  assert.equal(lease.articleId, 'one');
  assert.equal(isLeaseActive(lease, new Date('2026-10-04T12:30:00.000Z')), true);
  assert.equal(isLeaseActive(lease, new Date('2026-10-04T12:41:00.000Z')), false);
});

test('runner plans exactly one serial article and never steals a generating job', () => {
  const jobs = [
    { articleId: 'already', status: 'embedded' },
    { articleId: 'live', status: 'generating' },
    { articleId: 'next', status: 'fallback-inline-svg' }
  ];

  assert.equal(chooseNextArticle(jobs), 'next');
  assert.deepEqual(planIssueRun(jobs), {
    action: 'blocked-generating',
    articleId: 'live'
  });
});

test('runner resumes a retrieved PNG before starting a new generation', () => {
  const jobs = [
    { articleId: 'downloaded', status: 'retrieving' },
    { articleId: 'next', status: 'queued' }
  ];

  assert.deepEqual(planIssueRun(jobs), {
    action: 'embed-retrieved',
    articleId: 'downloaded'
  });
});
