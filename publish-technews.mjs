import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIME_ZONE = 'Asia/Tokyo';
const WORKER_NAME = 'technews-private-auth-test';
const CONFIG_PATH = 'firebase-auth-poc/wrangler.toml';
const WRANGLER_VERSION = '4.134.0';
const FIRST_DEPLOY_STATE = '.technews-release-state.json';
const ACCEPTANCE_TEST_ARGS = [
  '--test',
  'tests/publish-technews.test.mjs',
  'tests/report-structure.test.mjs',
  'tests/diagram-jobs.test.mjs',
  'tests/firebase-auth-poc.test.mjs',
  'tests/youtube-discovery.test.mjs',
];

function fail(gate, message) {
  throw new Error(`${gate}: ${message}`);
}

function japanCalendarParts(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('date must be a valid Date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return { year: Number(value('year')), month: Number(value('month')), day: Number(value('day')) };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getIssuePeriod(date) {
  const { year, month, day } = japanCalendarParts(date);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (calendarDate.getUTCDay() + 6) % 7;
  const startDate = new Date(calendarDate);
  startDate.setUTCDate(calendarDate.getUTCDate() - daysSinceMonday);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  return { start: isoDate(startDate), end: isoDate(endDate), issue: isoDate(endDate) };
}

export function validateIssueArgument(issue) {
  if (typeof issue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(issue)) fail('issue-date', 'expected YYYY-MM-DD Sunday issue date');
  const [year, month, day] = issue.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (isoDate(calendarDate) !== issue || calendarDate.getUTCDay() !== 0) fail('issue-date', 'expected a real Sunday issue date');
  return issue;
}

function readRequired(rootDir, relativePath, gate) {
  const filePath = resolve(rootDir, relativePath);
  if (!existsSync(filePath)) fail(gate, `missing ${relativePath}`);
  return readFileSync(filePath, 'utf8');
}

function attributeValue(tag, name) {
  return new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1];
}

function articleBlocks(html) {
  return [...html.matchAll(/<article\b[^>]*data-article-id=["'][^"']+["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => ({ html: match[0], id: attributeValue(match[0], 'data-article-id') }))
    .filter((article) => article.id && article.id !== 'ai-self-update-recheck');
}

function hasAccessibleSvg(articleHtml) {
  return /<svg\b[^>]*\brole=["']img["'][^>]*>[\s\S]*?<\/svg>/i.test(articleHtml)
    && (/<svg\b[^>]*\baria-(?:label|labelledby)=["'][^"']+["']/i.test(articleHtml) || /<svg\b[^>]*>[\s\S]*?<title\b[^>]*>\s*\S[\s\S]*?<\/title>/i.test(articleHtml));
}

function hasEmbeddedPngDataUri(articleHtml) {
  const visibleHtml = articleHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  return /<img\b[^>]*\bsrc\s*=\s*(["'])data:image\/png;base64,[^"']+\1[^>]*>/i.test(visibleHtml);
}

function validateIssueArtifacts(rootDir, issue) {
  const issueHtml = readRequired(rootDir, `${issue}.html`, 'issue-artifacts');
  if (!new RegExp(`\\bdata-issue-date=["']${issue}["']`, 'i').test(issueHtml)) fail('issue-artifacts', 'issue page date does not match');
  const articles = articleBlocks(issueHtml);
  if (!articles.length) fail('issue-artifacts', 'issue page has no primary articles');

  const indexHtml = readRequired(rootDir, 'index.html', 'issue-artifacts');
  const cards = [...indexHtml.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const issueCard = cards.find((card) => /\bclass=["'][^"']*\bissue-card\b[^"']*["']/i.test(card)
    && new RegExp(`\\bdata-issue-date=["']${issue}["']`, 'i').test(card));
  if (!issueCard || !new RegExp(`\\bhref=["']${issue}\\.html["']`, 'i').test(issueCard)) fail('issue-artifacts', 'index is missing matching issue-card link');
  return articles;
}

function validateDiagrams(rootDir, issue, articles) {
  let payload;
  try {
    payload = JSON.parse(readRequired(rootDir, `assets/diagrams/${issue}.jobs.json`, 'diagram-state'));
  } catch (error) {
    if (String(error.message).startsWith('diagram-state:')) throw error;
    fail('diagram-state', `invalid jobs JSON: ${error.message}`);
  }
  const jobs = payload?.jobs;
  if (!Array.isArray(jobs) || jobs.length !== articles.length) fail('diagram-state', 'job count does not match primary articles');
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const jobIds = jobs.map((job) => job?.articleId);
  if (new Set(jobIds).size !== jobIds.length || jobIds.some((id) => !articleById.has(id)) || articleById.size !== new Set(jobIds).size) fail('diagram-state', 'jobs do not map one-to-one to primary articles');

  for (const job of jobs) {
    const article = articleById.get(job.articleId);
    if (job.status === 'embedded' && job.embedded === true) {
      const metadata = job.verification;
      if (metadata?.mimeType !== 'image/png' || !(metadata.bytes > 0) || !(metadata.width > 0) || !(metadata.height > 0) || !/^[a-f0-9]{64}$/i.test(metadata.sha256 ?? '') || !hasEmbeddedPngDataUri(article.html)) {
        fail('diagram-state', `embedded PNG verification failed for ${job.articleId}`);
      }
    } else if (job.status === 'fallback-inline-svg' && hasAccessibleSvg(article.html)) {
      continue;
    } else {
      fail('diagram-state', `unaccepted diagram state for ${job.articleId}`);
    }
  }
}

function validateDeploymentBoundary(rootDir) {
  const wrangler = readRequired(rootDir, CONFIG_PATH, 'deployment-boundary');
  const workerName = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(wrangler)?.[1];
  const assetDirectory = /^\s*directory\s*=\s*["']([^"']+)["']/m.exec(wrangler)?.[1];
  if (workerName !== WORKER_NAME || assetDirectory !== '..') fail('deployment-boundary', 'Worker name or asset root is not approved');
  const assetsIgnore = readRequired(rootDir, '.assetsignore', 'deployment-boundary');
  for (const required of ['assets/diagrams/original/', '.git/', 'node_modules/', FIRST_DEPLOY_STATE]) {
    if (!assetsIgnore.split(/\r?\n/).includes(required)) fail('deployment-boundary', `missing .assetsignore exclusion ${required}`);
  }
  const gitIgnore = readRequired(rootDir, '.gitignore', 'deployment-boundary');
  if (!gitIgnore.split(/\r?\n/).includes(FIRST_DEPLOY_STATE)) fail('deployment-boundary', `missing .gitignore exclusion ${FIRST_DEPLOY_STATE}`);
  return workerName;
}

function hasVerifiedFirstDeployState(rootDir, workerName) {
  const statePath = join(rootDir, FIRST_DEPLOY_STATE);
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const expectedSmokeChecks = [
      ['/firebase-auth-poc/', 200],
      ['/index.html', 401],
      [`/${state.issue}.html`, 401],
    ];
    return state?.version === 1
      && state.workerName === workerName
      && typeof state.issue === 'string'
      && typeof state.deploymentUrl === 'string'
      && Array.isArray(state.smokeChecks)
      && state.smokeChecks.length === expectedSmokeChecks.length
      && expectedSmokeChecks.every(([path, status], index) => state.smokeChecks[index]?.path === path && state.smokeChecks[index]?.status === status);
  } catch {
    return false;
  }
}

async function persistFirstDeployState(rootDir, release, deploymentUrl, smokeChecks) {
  const statePath = join(rootDir, FIRST_DEPLOY_STATE);
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const state = {
    version: 1,
    workerName: release.workerName,
    issue: release.issue,
    deploymentUrl,
    smokeChecks,
  };
  try {
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tempPath, statePath);
  } catch (error) {
    fail('first-deploy-state', `could not persist smoke-verified first-deploy state: ${error.message}`);
  }
}

export function resolveWranglerCli(rootDir) {
  const cliPath = resolve(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(cliPath)) fail('wrangler-auth', `missing pinned Wrangler CLI: ${cliPath}`);
  return cliPath;
}

export function validateRelease({ rootDir, issue }) {
  const validIssue = validateIssueArgument(issue);
  const resolvedRoot = resolve(rootDir);
  const articles = validateIssueArtifacts(resolvedRoot, validIssue);
  validateDiagrams(resolvedRoot, validIssue, articles);
  const workerName = validateDeploymentBoundary(resolvedRoot);
  return { issue: validIssue, articleIds: articles.map((article) => article.id), workerName, configPath: CONFIG_PATH };
}

async function defaultRunCommand(command, args, { cwd } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd, windowsHide: true });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return { exitCode: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message ?? '' };
  }
}

function successful(result) {
  return result?.exitCode === 0;
}

export function deploymentUrl(output, workerName) {
  const urls = [...String(output).matchAll(/https:\/\/[^\s)]+/ig)].map((match) => match[0]);
  if (urls.length === 0) fail('deploy', 'Wrangler output has no deployment URL');
  const parsed = urls.map((url) => {
    try { return new URL(url); } catch { return null; }
  }).find((candidate) => candidate?.hostname.startsWith(`${workerName}.`));
  if (!parsed) fail('deploy', 'Wrangler output targets an unexpected Worker');
  return parsed.origin;
}

async function runSmokeChecks(baseUrl, issue, fetchImpl) {
  const expected = [
    ['/firebase-auth-poc/', 200],
    ['/index.html', 401],
    [`/${issue}.html`, 401],
  ];
  const checks = [];
  for (const [path, status] of expected) {
    let response;
    try {
      response = await fetchImpl(new URL(path, baseUrl).href, { redirect: 'manual' });
    } catch (error) {
      fail('post-deploy-smoke', `${path} request failed: ${error.message}`);
    }
    if (response.status !== status) fail('post-deploy-smoke', `${path} returned ${response.status}, expected ${status}`);
    checks.push({ path, status: response.status });
  }
  return checks;
}

export async function publishIssue({ rootDir, issue, firstDeploy = false, runCommand = defaultRunCommand, fetchImpl = globalThis.fetch }) {
  const resolvedRoot = resolve(rootDir);
  const release = validateRelease({ rootDir: resolvedRoot, issue });
  if (!firstDeploy && !hasVerifiedFirstDeployState(resolvedRoot, release.workerName)) {
    fail('first-deploy-confirmation', 'ordinary publish is blocked until a smoke-verified first deploy is recorded');
  }
  const wranglerCli = resolveWranglerCli(resolvedRoot);
  const testResult = await runCommand('node', ACCEPTANCE_TEST_ARGS, { cwd: resolvedRoot });
  if (!successful(testResult)) fail('build/test', testResult?.stderr || 'release acceptance suite failed');

  const versionResult = await runCommand(process.execPath, [wranglerCli, '--version'], { cwd: resolvedRoot });
  const whoamiResult = await runCommand(process.execPath, [wranglerCli, 'whoami'], { cwd: resolvedRoot });
  if (!successful(versionResult) || !new RegExp(`\\b${WRANGLER_VERSION.replaceAll('.', '\\.') }\\b`).test(`${versionResult.stdout ?? ''}\n${versionResult.stderr ?? ''}`) || !successful(whoamiResult)) {
    fail('wrangler-auth', 'pinned Wrangler is unavailable, the wrong version, or unauthenticated');
  }

  const deployResult = await runCommand(process.execPath, [wranglerCli, 'deploy', '--config', release.configPath], { cwd: resolvedRoot });
  if (!successful(deployResult)) fail('deploy', deployResult?.stderr || 'Wrangler deploy failed');
  const url = deploymentUrl(`${deployResult.stdout ?? ''}\n${deployResult.stderr ?? ''}`, release.workerName);
  const smokeChecks = await runSmokeChecks(url, release.issue, fetchImpl);
  if (firstDeploy) await persistFirstDeployState(resolvedRoot, release, url, smokeChecks);
  return { issue: release.issue, deploymentUrl: url, smokeChecks };
}

async function main(argv) {
  const [first, second, third] = argv;
  const preflight = first === '--preflight';
  const firstDeploy = first === '--first-deploy';
  const issue = preflight || firstDeploy ? second : first;
  if (third || !issue) validateIssueArgument('');
  if (preflight) {
    const release = validateRelease({ rootDir: process.cwd(), issue });
    console.log(`preflight passed for ${release.issue}`);
    return;
  }
  const result = await publishIssue({ rootDir: process.cwd(), issue, firstDeploy });
  console.log(`published ${result.issue} to ${result.deploymentUrl}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
