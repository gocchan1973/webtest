import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { generateDiagram, getArticleMetadata } from './generate-diagram.mjs';

const rootUrl = new URL('./', import.meta.url);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jobPath(issue) {
  return new URL(`./assets/diagrams/${issue}.jobs.json`, rootUrl);
}

function requireField(value, name) {
  if (!value) throw new Error(`Diagram job requires ${name}`);
}

export function prepareDiagramJob(job, { issue, now = new Date().toISOString() } = {}) {
  requireField(issue, 'issue');
  requireField(job?.articleId, 'articleId');
  requireField(job?.centerMessage, 'centerMessage');
  requireField(job?.source, 'source');
  const sourceRevision = sha256(JSON.stringify({
    articleId: job.articleId,
    centerMessage: job.centerMessage,
    source: job.source,
    visualStyle: job.visualStyle ?? 'auto',
    audience: job.audience ?? 'general'
  }));
  return {
    ...job,
    sourceRevision,
    promptVersion: job.promptVersion ?? 1,
    fileName: `${issue}__${job.articleId}__infographic.png`,
    status: 'queued',
    requestedAt: now,
    sourceCleanup: 'pending',
    embedded: false,
    artifact: undefined,
    verification: undefined,
    error: undefined
  };
}

export async function verifyGeneratedPng(imageUrl) {
  const buffer = await readFile(fileURLToPath(imageUrl));
  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== 'png') throw new Error(`Expected PNG, received ${metadata.format ?? 'unknown'}`);
  if (buffer.length === 0) throw new Error('Generated PNG is empty');
  return {
    bytes: buffer.length,
    mimeType: 'image/png',
    sha256: sha256(buffer),
    width: metadata.width ?? 0,
    height: metadata.height ?? 0
  };
}

export function markRetrievedDiagramJob(job, verification, { artifactPath, now = new Date().toISOString() } = {}) {
  requireField(artifactPath, 'artifactPath');
  return {
    ...job,
    status: 'retrieving',
    embedded: false,
    sourceCleanup: 'completed',
    artifact: { ...(job.artifact ?? {}), originalPath: artifactPath },
    verification,
    retrievedAt: now
  };
}

async function loadIssue(issue) {
  return JSON.parse(await readFile(jobPath(issue), 'utf8'));
}

async function saveIssue(issue, document) {
  await writeFile(jobPath(issue), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function findJob(document, articleId) {
  const job = document.jobs?.find((item) => item.articleId === articleId);
  if (!job) throw new Error(`No diagram job for ${articleId}`);
  return job;
}

function copyJob(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

export async function queueDiagramJob({ issue, articleId, now } = {}) {
  const document = await loadIssue(issue);
  const job = findJob(document, articleId);
  copyJob(job, prepareDiagramJob(job, { issue, now }));
  document.generatedAt = new Date().toISOString();
  await saveIssue(issue, document);
  return job;
}

export function failureStatus(error) {
  const detail = `${error?.message ?? error}`.toLowerCase();
  if (/(rate|quota|capacity|limit|busy|queue)/.test(detail)) return 'waiting-capacity';
  if (/(auth|login|credential|unauthori[sz]ed)/.test(detail)) return 'fallback-inline-svg';
  return 'failed';
}

export async function generateQueuedDiagram({ issue, articleId } = {}) {
  const document = await loadIssue(issue);
  const job = findJob(document, articleId);
  if (job.status !== 'queued') throw new Error(`Diagram job ${articleId} must be queued before generation (current: ${job.status})`);
  job.status = 'generating';
  job.generationStartedAt = new Date().toISOString();
  document.generatedAt = new Date().toISOString();
  await saveIssue(issue, document);

  try {
    const metadata = getArticleMetadata(articleId);
    const generated = await generateDiagram({
      articleId,
      title: metadata.title,
      summary: job.centerMessage,
      date: issue,
      style: job.visualStyle,
      force: true
    });
    const originalPath = new URL(`./assets/diagrams/original/${generated.output}`, rootUrl);
    const verification = await verifyGeneratedPng(originalPath);
    const retrievedJob = markRetrievedDiagramJob(job, verification, {
      artifactPath: `assets/diagrams/original/${generated.output}`,
      now: new Date().toISOString()
    });
    job.status = retrievedJob.status;
    job.artifact = {
      artifactId: generated.artifactId ?? null,
      sourceId: generated.sourceId ?? null,
      ...retrievedJob.artifact
    };
    job.verification = verification;
    job.sourceCleanup = generated.sourceId ? 'completed' : 'not-needed';
    job.retrievedAt = retrievedJob.retrievedAt;
    document.generatedAt = new Date().toISOString();
    await saveIssue(issue, document);
    return job;
  } catch (error) {
    job.status = failureStatus(error);
    job.error = { message: String(error?.message ?? error), recordedAt: new Date().toISOString() };
    if (job.status === 'waiting-capacity') job.nextCheckAt = new Date(Date.now() + (5 * 60 * 60 * 1000)).toISOString();
    document.generatedAt = new Date().toISOString();
    await saveIssue(issue, document);
    throw error;
  }
}

export async function resyncRetrievedDiagram({ issue, articleId } = {}) {
  const document = await loadIssue(issue);
  const job = findJob(document, articleId);
  const artifactPath = `assets/diagrams/original/${job.fileName}`;
  const verification = await verifyGeneratedPng(new URL(`./${artifactPath}`, rootUrl));
  copyJob(job, markRetrievedDiagramJob(job, verification, { artifactPath }));
  document.generatedAt = new Date().toISOString();
  await saveIssue(issue, document);
  return job;
}

export async function verifyDiagramEmbedded({ issue, articleId } = {}) {
  const document = await loadIssue(issue);
  const job = findJob(document, articleId);
  if (job.status !== 'retrieving') throw new Error(`Diagram job ${articleId} must be retrieving before embedding verification (current: ${job.status})`);
  const manifest = JSON.parse(await readFile(new URL('./assets/diagrams/compressed/manifest.json', rootUrl), 'utf8'));
  const image = manifest.images?.find((entry) => entry.diagramId === articleId);
  const page = await readFile(new URL(`./${issue}.html`, rootUrl), 'utf8');
  const articleStart = page.indexOf(`data-article-id="${articleId}"`);
  const articleEnd = articleStart === -1 ? -1 : page.indexOf('</article>', articleStart);
  const articleHtml = articleStart === -1 || articleEnd === -1 ? '' : page.slice(articleStart, articleEnd);
  if (!image || !articleHtml.includes('data:image/png;base64,')) {
    throw new Error(`Compressed PNG was not embedded for ${articleId}`);
  }
  job.status = 'embedded';
  job.embedded = true;
  job.embeddedAt = new Date().toISOString();
  job.artifact.compressedPath = image.compressedPath;
  job.artifact.compressedSha256 = image.compressedSha256;
  job.artifact.compressedBytes = image.compressedSize;
  document.generatedAt = new Date().toISOString();
  await saveIssue(issue, document);
  return job;
}

async function main() {
  const [action, issue, articleId] = process.argv.slice(2);
  if (!['queue', 'generate', 'resync-retrieved', 'verify-embedded'].includes(action) || !issue || !articleId) {
    throw new Error('Usage: node diagram-jobs.mjs <queue|generate|resync-retrieved|verify-embedded> <issue-date> <article-id>');
  }
  const result = action === 'queue'
    ? await queueDiagramJob({ issue, articleId })
    : action === 'generate'
      ? await generateQueuedDiagram({ issue, articleId })
      : action === 'resync-retrieved'
        ? await resyncRetrievedDiagram({ issue, articleId })
        : await verifyDiagramEmbedded({ issue, articleId });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
