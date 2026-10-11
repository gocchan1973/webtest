import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  generateQueuedDiagram,
  queueDiagramJob,
  resyncRetrievedDiagram,
  verifyDiagramEmbedded
} from './diagram-jobs.mjs';

const execFileAsync = promisify(execFile);
const rootUrl = new URL('./', import.meta.url);
const leaseDurationMs = 40 * 60 * 1000;

function runnerPath(issue) {
  return new URL(`./assets/diagrams/${issue}.runner.json`, rootUrl);
}

function lockPath(issue) {
  return new URL(`./assets/diagrams/${issue}.runner.lock`, rootUrl);
}

function jobsPath(issue) {
  return new URL(`./assets/diagrams/${issue}.jobs.json`, rootUrl);
}

export function createRunnerLease({ issue, articleId = null, now = new Date().toISOString(), runId = randomUUID(), processId = null } = {}) {
  const started = new Date(now);
  return {
    issue,
    runId,
    status: 'running',
    articleId,
    processId,
    startedAt: started.toISOString(),
    heartbeatAt: started.toISOString(),
    expiresAt: new Date(started.getTime() + leaseDurationMs).toISOString()
  };
}

export function isLeaseActive(lease, now = new Date()) {
  return lease?.status === 'running' && new Date(lease.expiresAt).getTime() > new Date(now).getTime();
}

function isProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId < 1) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

export function chooseNextArticle(jobs = []) {
  return jobs.find((job) => ['queued', 'fallback-inline-svg'].includes(job.status))?.articleId ?? null;
}

export function planIssueRun(jobs = []) {
  const retrieved = jobs.find((job) => job.status === 'retrieving');
  if (retrieved) return { action: 'embed-retrieved', articleId: retrieved.articleId };
  const generating = jobs.find((job) => job.status === 'generating');
  if (generating) return { action: 'blocked-generating', articleId: generating.articleId };
  const failed = jobs.find((job) => job.status === 'failed' || job.status === 'waiting-capacity');
  if (failed) return { action: 'blocked-terminal', articleId: failed.articleId, status: failed.status };
  const articleId = chooseNextArticle(jobs);
  return articleId ? { action: 'generate', articleId } : { action: 'complete', articleId: null };
}

async function loadJobs(issue) {
  return JSON.parse(await readFile(jobsPath(issue), 'utf8'));
}

async function writeLease(issue, lease) {
  await writeFile(runnerPath(issue), `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
}

async function acquireClaimLock(issue) {
  const path = lockPath(issue);
  try {
    return await open(path, 'wx');
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const ageMs = Date.now() - (await stat(path)).mtimeMs;
    if (ageMs < 2 * 60 * 1000) throw new Error(`Diagram runner start already in progress for ${issue}`);
    await unlink(path);
    return open(path, 'wx');
  }
}

export async function claimRunnerLease({ issue, articleId = null, now, runId, processId = process.pid } = {}) {
  const lock = await acquireClaimLock(issue);
  try {
    let prior = null;
    try { prior = JSON.parse(await readFile(runnerPath(issue), 'utf8')); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (isLeaseActive(prior) && (!prior.processId || isProcessAlive(prior.processId))) {
      throw new Error(`Diagram runner already owns ${issue} through ${prior.expiresAt} (article: ${prior.articleId ?? 'none'})`);
    }
    const lease = createRunnerLease({ issue, articleId, now, runId, processId });
    await writeLease(issue, lease);
    return lease;
  } finally {
    await lock.close();
    await unlink(lockPath(issue)).catch(() => {});
  }
}

async function runNode(script, args = []) {
  await execFileAsync(process.execPath, [fileURLToPath(new URL(script, rootUrl)), ...args], { cwd: fileURLToPath(rootUrl) });
}

const defaultOperations = {
  queue: queueDiagramJob,
  generate: generateQueuedDiagram,
  resync: resyncRetrievedDiagram,
  verify: verifyDiagramEmbedded,
  materialize: async () => runNode('./generate-compressed-images.mjs'),
  build: async () => runNode('./build.mjs')
};

async function setLeaseState(issue, lease, values) {
  const next = { ...lease, ...values, heartbeatAt: new Date().toISOString() };
  await writeLease(issue, next);
  return next;
}

async function embedRetrieved(issue, articleId, operations) {
  await operations.resync({ issue, articleId });
  await operations.materialize();
  await operations.build();
  await operations.verify({ issue, articleId });
}

export async function runIssue({ issue, operations = defaultOperations, now, runId } = {}) {
  if (!issue) throw new Error('Diagram runner requires an issue date');
  let lease = await claimRunnerLease({ issue, now, runId, processId: process.pid });
  const finalizedFallbackIds = new Set();
  try {
    while (true) {
      const document = await loadJobs(issue);
      const plan = planIssueRun(document.jobs.filter((job) => !finalizedFallbackIds.has(job.articleId)));
      lease = await setLeaseState(issue, lease, { articleId: plan.articleId, action: plan.action });
      if (plan.action === 'complete') {
        lease = await setLeaseState(issue, lease, { status: 'completed', completedAt: new Date().toISOString() });
        return lease;
      }
      if (plan.action === 'blocked-generating' || plan.action === 'blocked-terminal') {
        lease = await setLeaseState(issue, lease, { status: plan.action, blockedAt: new Date().toISOString() });
        return lease;
      }
      if (plan.action === 'embed-retrieved') {
        await embedRetrieved(issue, plan.articleId, operations);
        continue;
      }
      if (plan.action === 'generate') {
        const document = await loadJobs(issue);
        const job = document.jobs.find((item) => item.articleId === plan.articleId);
        if (job.status === 'fallback-inline-svg') await operations.queue({ issue, articleId: plan.articleId });
        try {
          await operations.generate({ issue, articleId: plan.articleId });
        } catch {
          const afterDocument = await loadJobs(issue);
          const generatedJob = afterDocument.jobs.find((item) => item.articleId === plan.articleId);
          if (generatedJob?.status === 'fallback-inline-svg') {
            // Authentication fallback is final for this issue run.  It remains
            // visible in the job document and becomes eligible on a later run.
            await operations.build();
            finalizedFallbackIds.add(plan.articleId);
            continue;
          }
          const after = planIssueRun(afterDocument.jobs);
          if (after.action === 'blocked-terminal') {
            lease = await setLeaseState(issue, lease, { status: after.status, blockedAt: new Date().toISOString() });
            return lease;
          }
          throw new Error(`Diagram generation failed without a durable job state for ${plan.articleId}`);
        }
      }
    }
  } catch (error) {
    await setLeaseState(issue, lease, { status: 'failed', error: String(error?.message ?? error), failedAt: new Date().toISOString() });
    throw error;
  }
}

export async function abandonRunnerLease(issue) {
  const lease = JSON.parse(await readFile(runnerPath(issue), 'utf8'));
  if (lease.processId && isProcessAlive(lease.processId)) {
    throw new Error(`Cannot abandon active diagram runner process ${lease.processId}`);
  }
  const abandoned = {
    ...lease,
    status: 'abandoned',
    abandonedAt: new Date().toISOString(),
    reason: 'runner process is not active'
  };
  await writeLease(issue, abandoned);
  return abandoned;
}

export async function startIssueRunner(issue) {
  if (!issue) throw new Error('Diagram runner requires an issue date');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', issue], {
    cwd: fileURLToPath(rootUrl),
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return { issue, pid: child.pid, status: 'starting' };
}

async function main() {
  const [action, issue] = process.argv.slice(2);
  if (!['start', 'run', 'status', 'abandon'].includes(action) || !issue) {
    throw new Error('Usage: node diagram-runner.mjs <start|run|status|abandon> <issue-date>');
  }
  if (action === 'start') console.log(JSON.stringify(await startIssueRunner(issue)));
  else if (action === 'run') console.log(JSON.stringify(await runIssue({ issue })));
  else if (action === 'abandon') console.log(JSON.stringify(await abandonRunnerLease(issue)));
  else {
    console.log(await readFile(runnerPath(issue), 'utf8'));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
