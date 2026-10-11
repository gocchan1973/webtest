import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { deploymentUrl, getIssuePeriod, publishIssue, resolveWranglerCli, validateIssueArgument, validateRelease } from '../publish-technews.mjs';

const execFileAsync = promisify(execFile);
const issue = '2026-09-13';
const releaseAcceptanceArgs = [
  '--test',
  'tests/publish-technews.test.mjs',
  'tests/report-structure.test.mjs',
  'tests/diagram-jobs.test.mjs',
  'tests/firebase-auth-poc.test.mjs',
  'tests/youtube-discovery.test.mjs',
];

async function makeFixture({
  includeIssuePage = true,
  includeIndexLink = true,
  jobCount = 1,
  jobStatus = 'embedded',
  workerName = 'technews-private-auth-test',
  includeOriginalIgnore = true,
  includeStateGitignore = true,
  fallbackSvg = false,
  pngMarkup = '<img alt="Diagram" src="data:image/png;base64,iVBORw0KGgo=" />',
  firstDeployState = false,
} = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'technews-publish-'));
  await mkdir(join(rootDir, 'assets', 'diagrams'), { recursive: true });
  await mkdir(join(rootDir, 'firebase-auth-poc'), { recursive: true });
  await mkdir(join(rootDir, 'node_modules', 'wrangler', 'bin'), { recursive: true });
  await writeFile(join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '// fixture CLI');

  const articleBody = fallbackSvg
    ? '<svg role="img" aria-label="Diagram"><title>Diagram</title></svg>'
    : pngMarkup;
  if (includeIssuePage) {
    await writeFile(join(rootDir, `${issue}.html`), `<!doctype html><main data-issue-date="${issue}"><article data-article-id="article-a">${articleBody}</article></main>`);
  }
  const indexLink = includeIndexLink ? `<a href="${issue}.html">Issue</a>` : '';
  await writeFile(join(rootDir, 'index.html'), `<!doctype html><article class="issue-card" data-issue-date="${issue}">${indexLink}</article>`);

  const jobs = Array.from({ length: jobCount }, (_, index) => ({
    articleId: index === 0 ? 'article-a' : `article-${index}`,
    status: fallbackSvg ? 'fallback-inline-svg' : jobStatus,
    embedded: jobStatus === 'embedded' || fallbackSvg,
    verification: fallbackSvg ? undefined : {
      mimeType: 'image/png',
      bytes: 1,
      width: 1,
      height: 1,
      sha256: 'a'.repeat(64),
    },
  }));
  await writeFile(join(rootDir, 'assets', 'diagrams', `${issue}.jobs.json`), JSON.stringify({ jobs }));
  await writeFile(join(rootDir, 'firebase-auth-poc', 'wrangler.toml'), `name = "${workerName}"\n[assets]\ndirectory = ".."\n`);
  await writeFile(join(rootDir, '.assetsignore'), `${includeOriginalIgnore ? 'assets/diagrams/original/\n' : ''}.git/\nnode_modules/\n.technews-release-state.json\n`);
  await writeFile(join(rootDir, '.gitignore'), `${includeStateGitignore ? '.technews-release-state.json\n' : ''}`);
  if (firstDeployState) {
    await writeFile(join(rootDir, '.technews-release-state.json'), JSON.stringify({
      version: 1,
      workerName: 'technews-private-auth-test',
      issue: '2026-09-06',
      deploymentUrl: 'https://technews-private-auth-test.example.workers.dev',
      smokeChecks: [
        { path: '/firebase-auth-poc/', status: 200 },
        { path: '/index.html', status: 401 },
        { path: '/2026-09-06.html', status: 401 },
      ],
    }));
  }
  return rootDir;
}

async function withFixture(options, callback) {
  const rootDir = await makeFixture(options);
  try {
    return await callback(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('getIssuePeriod uses UTC calendar days for the Monday-through-Sunday issue', () => {
  assert.deepEqual(getIssuePeriod(new Date('2026-09-13T12:00:00+09:00')), {
    start: '2026-09-07', end: '2026-09-13', issue: '2026-09-13',
  });
  assert.deepEqual(getIssuePeriod(new Date('2026-09-07T00:01:00+09:00')), {
    start: '2026-09-07', end: '2026-09-13', issue: '2026-09-13',
  });
});

test('validateIssueArgument rejects malformed and non-Sunday issue dates before a command can run', async () => {
  for (const value of ['2026-09-12', '2026-02-30', '09/13/2026', '']) {
    assert.throws(() => validateIssueArgument(value), /issue-date/);
  }
  let calls = 0;
  await assert.rejects(
    publishIssue({ rootDir: 'not-used', issue: '2026-09-12', runCommand: async () => { calls += 1; } }),
    /issue-date/,
  );
  assert.equal(calls, 0);
});

test('CLI rejects malformed and non-Sunday dates before running release commands', async () => {
  for (const value of ['2026-09-12', '2026-02-30']) {
    await assert.rejects(
      execFileAsync(process.execPath, ['publish-technews.mjs', value], { cwd: new URL('..', import.meta.url) }),
      (error) => error.code === 1 && /issue-date/.test(error.stderr),
    );
  }
});

test('deploymentUrl selects the expected Worker URL when Wrangler output includes another URL first', () => {
  assert.equal(
    deploymentUrl('See https://developers.cloudflare.com/workers/ for help\nhttps://technews-private-auth-test.example.workers.dev', 'technews-private-auth-test'),
    'https://technews-private-auth-test.example.workers.dev',
  );
});

test('CLI preflight validates a completed issue without invoking Wrangler', async () => {
  await withFixture({}, async (rootDir) => {
    const scriptPath = fileURLToPath(new URL('../publish-technews.mjs', import.meta.url));
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, '--preflight', issue], { cwd: rootDir });
    assert.match(stdout, /preflight/);
    assert.equal(stderr, '');
  });
});

test('validateRelease accepts a completed embedded PNG issue', async () => {
  await withFixture({}, async (rootDir) => {
    assert.deepEqual(validateRelease({ rootDir, issue }), {
      issue,
      articleIds: ['article-a'],
      workerName: 'technews-private-auth-test',
      configPath: 'firebase-auth-poc/wrangler.toml',
    });
  });
});

test('validateRelease accepts an accessible inline SVG fallback issue', async () => {
  await withFixture({ fallbackSvg: true }, async (rootDir) => {
    assert.deepEqual(validateRelease({ rootDir, issue }).articleIds, ['article-a']);
  });
});

for (const [name, pngMarkup] of [
  ['article text', '<p>data:image/png;base64,iVBORw0KGgo=</p>'],
  ['a non-src attribute', '<div data-preview="data:image/png;base64,iVBORw0KGgo="></div>'],
  ['an HTML comment', '<!-- <img src="data:image/png;base64,iVBORw0KGgo=" /> -->'],
]) {
  test(`validateRelease rejects PNG marker in ${name}`, async () => {
    await withFixture({ pngMarkup }, async (rootDir) => {
      assert.throws(() => validateRelease({ rootDir, issue }), /diagram-state/);
    });
  });
}

test('resolveWranglerCli uses the pinned local JS entrypoint', async () => {
  await withFixture({}, async (rootDir) => {
    assert.equal(resolveWranglerCli(rootDir), join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'));
  });
});

for (const [name, options, gate] of [
  ['missing issue page', { includeIssuePage: false }, 'issue-artifacts'],
  ['missing index link', { includeIndexLink: false }, 'issue-artifacts'],
  ['unmatched article and job counts', { jobCount: 2 }, 'diagram-state'],
  ['generating diagram job', { jobStatus: 'generating' }, 'diagram-state'],
  ['wrong Worker name', { workerName: 'other-worker' }, 'deployment-boundary'],
  ['removed original-diagram exclusion', { includeOriginalIgnore: false }, 'deployment-boundary'],
  ['removed local release-state Git exclusion', { includeStateGitignore: false }, 'deployment-boundary'],
]) {
  test(`publishIssue rejects ${name} before it runs a command`, async () => {
    await withFixture(options, async (rootDir) => {
      let calls = 0;
      await assert.rejects(
        publishIssue({ rootDir, issue, runCommand: async () => { calls += 1; } }),
        new RegExp(gate),
      );
      assert.equal(calls, 0);
    });
  });
}

test('publishIssue runs tests before the exact Wrangler deploy and smoke checks', async () => {
  await withFixture({}, async (rootDir) => {
    const calls = [];
    const runCommand = async (command, args) => {
      calls.push([command, args]);
      if (args.at(-1) === '--version') return { exitCode: 0, stdout: '4.134.0' };
      if (args.includes('deploy')) return { exitCode: 0, stdout: 'Published https://technews-private-auth-test.example.workers.dev' };
      return { exitCode: 0, stdout: 'ok' };
    };
    const fetchImpl = async (url) => {
      if (url.endsWith('/firebase-auth-poc/')) return new Response('', { status: 200 });
      return new Response('', { status: 401 });
    };

    const result = await publishIssue({ rootDir, issue, firstDeploy: true, runCommand, fetchImpl });
    assert.equal(result.deploymentUrl, 'https://technews-private-auth-test.example.workers.dev');
    assert.deepEqual(calls, [
      ['node', releaseAcceptanceArgs],
      [process.execPath, [join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '--version']],
      [process.execPath, [join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'whoami']],
      [process.execPath, [join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'deploy', '--config', 'firebase-auth-poc/wrangler.toml']],
    ]);
    assert.deepEqual(result.smokeChecks.map(({ path, status }) => [path, status]), [
      ['/firebase-auth-poc/', 200], ['/index.html', 401], [`/${issue}.html`, 401],
    ]);
  });
});

test('ordinary first publish stops before any subprocess without a verified local state record', async () => {
  await withFixture({}, async (rootDir) => {
    let calls = 0;
    await assert.rejects(
      publishIssue({ rootDir, issue, runCommand: async () => { calls += 1; return { exitCode: 0, stdout: '4.134.0' }; } }),
      /first-deploy-confirmation/,
    );
    assert.equal(calls, 0);
  });
});

test('a successful explicit first publish records the smoke-verified local state', async () => {
  await withFixture({}, async (rootDir) => {
    await publishIssue({
      rootDir,
      issue,
      firstDeploy: true,
      runCommand: async (command, args) => ({
        exitCode: 0,
        stdout: args.at(-1) === '--version' ? '4.134.0' : (args.includes('deploy') ? 'https://technews-private-auth-test.example.workers.dev' : 'ok'),
      }),
      fetchImpl: async (url) => new Response('', { status: url.endsWith('/firebase-auth-poc/') ? 200 : 401 }),
    });
    const state = JSON.parse(await readFile(join(rootDir, '.technews-release-state.json'), 'utf8'));
    assert.deepEqual(state.smokeChecks.map(({ path, status }) => [path, status]), [
      ['/firebase-auth-poc/', 200], ['/index.html', 401], [`/${issue}.html`, 401],
    ]);
  });
});

test('later ordinary publish proceeds when the smoke-verified local state exists', async () => {
  await withFixture({ firstDeployState: true }, async (rootDir) => {
    const calls = [];
    await publishIssue({
      rootDir,
      issue,
      runCommand: async (command, args) => {
        calls.push([command, args]);
        return { exitCode: 0, stdout: args.at(-1) === '--version' ? '4.134.0' : (args.includes('deploy') ? 'https://technews-private-auth-test.example.workers.dev' : 'ok') };
      },
      fetchImpl: async (url) => new Response('', { status: url.endsWith('/firebase-auth-poc/') ? 200 : 401 }),
    });
    assert.equal(calls.length, 4);
  });
});

test('a failed explicit first publish leaves ordinary publish blocked with zero later subprocess calls', async () => {
  await withFixture({}, async (rootDir) => {
    await assert.rejects(
      publishIssue({
        rootDir,
        issue,
        firstDeploy: true,
        runCommand: async (_command, args) => ({
          exitCode: 0,
          stdout: args.at(-1) === '--version' ? '4.134.0' : (args.includes('deploy') ? 'https://technews-private-auth-test.example.workers.dev' : 'ok'),
        }),
        fetchImpl: async () => new Response('', { status: 302 }),
      }),
      /post-deploy-smoke/,
    );
    assert.equal(existsSync(join(rootDir, '.technews-release-state.json')), false);
    let laterCalls = 0;
    await assert.rejects(
      publishIssue({ rootDir, issue, runCommand: async () => { laterCalls += 1; return { exitCode: 0 }; } }),
      /first-deploy-confirmation/,
    );
    assert.equal(laterCalls, 0);
  });
});

test('publishIssue never deploys after a failed test run', async () => {
  await withFixture({ firstDeployState: true }, async (rootDir) => {
    const calls = [];
    await assert.rejects(
      publishIssue({
        rootDir,
        issue,
        runCommand: async (command, args) => {
          calls.push([command, args]);
          return { exitCode: 1, stdout: '', stderr: 'test failure' };
        },
      }),
      /build\/test/,
    );
    assert.deepEqual(calls, [['node', releaseAcceptanceArgs]]);
  });
});

test('publishIssue reports post-deploy smoke failures instead of returning success', async () => {
  await withFixture({ firstDeployState: true }, async (rootDir) => {
    await assert.rejects(
      publishIssue({
        rootDir,
        issue,
        runCommand: async (command, args) => ({
          exitCode: 0,
          stdout: args.at(-1) === '--version' ? '4.134.0' : (args.includes('deploy') ? 'https://technews-private-auth-test.example.workers.dev' : 'ok'),
        }),
        fetchImpl: async () => new Response('', { status: 302 }),
      }),
      /post-deploy-smoke/,
    );
  });
});
