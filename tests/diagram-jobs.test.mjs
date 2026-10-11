import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { failureStatus, markRetrievedDiagramJob, prepareDiagramJob, verifyGeneratedPng } from '../diagram-jobs.mjs';
import { runCli } from '../generate-diagram.mjs';

test('prepareDiagramJob turns a fallback record into a re-runnable queued job', () => {
  const job = prepareDiagramJob({
    articleId: 'gpt-6-astra-safety',
    visualStyle: 'professional',
    audience: 'general',
    centerMessage: '高能力化ほど隔離・監視・停止を先に置く',
    status: 'fallback-inline-svg',
    embedded: true,
    source: 'https://openai.com/index/safety-overview-gpt-6-astra/'
  }, {
    issue: '2026-09-06',
    now: '2026-09-07T01:00:00.000Z'
  });

  assert.equal(job.status, 'queued');
  assert.equal(job.fileName, '2026-09-06__gpt-6-astra-safety__infographic.png');
  assert.equal(job.requestedAt, '2026-09-07T01:00:00.000Z');
  assert.equal(job.embedded, false);
  assert.equal(job.sourceCleanup, 'pending');
  assert.match(job.sourceRevision, /^[a-f0-9]{64}$/);
});

test('verifyGeneratedPng records image dimensions, MIME type, size, and SHA-256', async () => {
  const sample = new URL('../assets/diagrams/original/2026-08-28__chrome-speed-records__infographic.png', import.meta.url);
  const verification = await verifyGeneratedPng(sample);

  assert.equal(verification.mimeType, 'image/png');
  assert.ok(verification.bytes > 0);
  assert.ok(verification.width > 0);
  assert.ok(verification.height > 0);
  assert.match(verification.sha256, /^[a-f0-9]{64}$/);
});

test('markRetrievedDiagramJob keeps downloaded verification separate from embedding', () => {
  const job = markRetrievedDiagramJob({
    articleId: 'example',
    status: 'generating',
    embedded: false,
    sourceCleanup: 'completed'
  }, {
    bytes: 123,
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
    width: 1600,
    height: 900
  }, {
    artifactPath: 'assets/diagrams/original/example.png',
    now: '2026-09-07T02:00:00.000Z'
  });

  assert.equal(job.status, 'retrieving');
  assert.equal(job.embedded, false);
  assert.equal(job.artifact.originalPath, 'assets/diagrams/original/example.png');
  assert.equal(job.verification.mimeType, 'image/png');
  assert.equal(job.retrievedAt, '2026-09-07T02:00:00.000Z');
});

test('runCli refreshes an expired NotebookLM session before retrying the command', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (calls.length === 1) throw new Error('Authentication expired or invalid');
    return 'ok';
  };

  assert.equal(await runCli(['source', 'add'], { exec }), 'ok');
  assert.deepEqual(calls, [
    ['source', 'add'],
    ['login', '--browser-timeout', '60'],
    ['source', 'add']
  ]);
});

test('failureStatus finalizes authentication failure with the documented SVG fallback', () => {
  assert.equal(failureStatus(new Error('Authentication expired or invalid')), 'fallback-inline-svg');
});
