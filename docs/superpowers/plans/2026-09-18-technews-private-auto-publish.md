# TechNews Private Auto-Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Sunday at 21:00 JST, extend the existing local TechNews weekly workflow to publish only a fully generated and validated issue to the existing Firebase-authenticated Cloudflare Worker.

**Architecture:** Keep collection, article HTML, diagrams, and indexes in the current local workflow. Add one deterministic Node release command that validates the completed issue and deployment boundary before invoking Wrangler, then checks the live authentication boundary. Change the existing Codex automation schedule and prompt through the Codex automation manager, not by editing its TOML file directly.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing HTML/diagram job artifacts, Codex local cron automation, Cloudflare Wrangler, Firebase-authenticated Worker static assets.

**Spec:** `docs/superpowers/specs/2026-09-18-technews-private-auto-publish-design.md`

## Global Constraints

- Schedule: every Sunday at 21:00, Asia/Tokyo; research period is the Monday through Sunday of the execution week.
- Deployment target must remain `technews-private-auth-test` using `firebase-auth-poc/wrangler.toml`.
- Run only in the existing local `F:\Dev_hub` Codex automation; do not migrate to cloud CI.
- Do not change Firebase authentication, allowed UIDs, session cookies, public login paths, or add a public write API/database.
- Do not deploy if any read-only release acceptance test fails, an adopted article lacks a completed embedded PNG or approved accessible inline-SVG fallback, or Wrangler is unauthenticated.
- Use the exact devDependency `wrangler@4.134.0` through `process.execPath node_modules/wrangler/bin/wrangler.js`; do not use PATH lookup, `.cmd` shims, `npx`, or an unpinned download.
- Preserve `.assetsignore` and `.gitignore`, including their `.technews-release-state.json` entries and `assets/diagrams/original/`; never publish or track original diagrams, credentials, or local release state.
- Do not automatically commit or push.
- Ordinary publish is blocked before all subprocesses until a smoke-verified `.technews-release-state.json` exists. Obtain separate user confirmation immediately before the first real deployment, then invoke only `node publish-technews.mjs --first-deploy YYYY-MM-DD`; never run an unattended interactive login or unconfirmed interactive rollback.
- Preserve the pre-existing unrelated worktree change `codex-update/hits.jsonl`.

---

### Task 1: Add deterministic release preflight and deployment command

**Files:**
- Create: `publish-technews.mjs`
- Create: `tests/publish-technews.test.mjs`
- Test: `tests/report-structure.test.mjs`, `tests/diagram-jobs.test.mjs`, `tests/firebase-auth-poc.test.mjs`, `tests/publish-technews.test.mjs`

**Interfaces:**
- Export `getIssuePeriod(date)` returning `{ start, end, issue }`, where `date` is a `Date` and the returned dates are ISO `YYYY-MM-DD` strings for that date's Monday-through-Sunday week.
- Export `validateRelease({ rootDir, issue })` returning `{ issue, articleIds, workerName, configPath }` or throwing an error naming the failed gate.
- Export `publishIssue({ rootDir, issue, runCommand, fetchImpl })` which validates first, runs tests, deploys only on success, and returns `{ issue, deploymentUrl, smokeChecks }`; injected `runCommand` and `fetchImpl` keep tests offline and prove commands are not called on rejected input.
- CLI: `node publish-technews.mjs YYYY-MM-DD` performs the gated release; `node publish-technews.mjs --preflight YYYY-MM-DD` performs all local checks without deployment. Reject missing, malformed, or non-Sunday issue dates with exit code 1 before spawning any child process.

- [ ] **Step 1: Add tests for week boundaries and invalid issue dates**

Add tests asserting `getIssuePeriod(new Date('2026-09-13T12:00:00+09:00'))` returns `{ start: '2026-09-07', end: '2026-09-13', issue: '2026-09-13' }`, and that a Monday maps to the Sunday at the end of that same week. Add CLI/parser tests that reject a non-Sunday date and malformed input without invoking `runCommand`, and that `--preflight` never invokes a deploy command.

- [ ] **Step 2: Run the focused test and confirm it fails because the module is absent**

Run: `node --test tests/publish-technews.test.mjs`

Expected: FAIL because `publish-technews.mjs` does not yet export the specified helpers.

- [ ] **Step 3: Implement issue-period calculation and input validation**

Extract the calendar date from the supplied instant in `Asia/Tokyo` using `Intl.DateTimeFormat`, then use UTC date arithmetic over those extracted calendar components to derive Monday and Sunday. Validate the issue argument as a real ISO date that is Sunday in Japan. Do not infer a date from the machine's locale or time zone.

- [ ] **Step 4: Add preflight checks for the issue artifacts and deployment boundary**

For `<issue>.html`, require a matching `data-issue-date`, non-empty article blocks, a matching `index.html` link, and an index-card entry. Read `assets/diagrams/<issue>.jobs.json`; require exactly one job per primary article and accept only `status === 'embedded' && embedded === true` with PNG verification metadata and an actual `<img src="data:image/png;base64,...">` attribute inside that article (not text, comments, or a different attribute), or the existing `fallback-inline-svg` state accompanied by an accessible `role="img"` SVG in that article. Reject queued, generating, retrieving, needs-human, missing, duplicate, or unknown states. Confirm `firebase-auth-poc/wrangler.toml` names exactly `technews-private-auth-test`, points assets at the repository root, `.assetsignore` excludes `assets/diagrams/original/`, `.git/`, `node_modules/`, and `.technews-release-state.json`, and `.gitignore` excludes `.technews-release-state.json`.

- [ ] **Step 5: Add gate tests with temporary fixture directories**

Test one accepted embedded-PNG fixture and one accepted accessible-SVG fallback. Test rejection for a missing issue page, missing index link, unmatched article/job count, a `generating` job, wrong Worker name, and removed original-diagram exclusion. In every rejected case assert the injected command runner was never called.

- [ ] **Step 6: Run focused tests and confirm they pass**

Run: `node --test tests/publish-technews.test.mjs`

Expected: PASS for all week-window, artifact, diagram-state, and target-guard tests.

- [ ] **Step 7: Add test/build/deploy sequencing with injectable command runner**

Run only the release acceptance suite (`node --test tests/publish-technews.test.mjs tests/report-structure.test.mjs tests/diagram-jobs.test.mjs tests/firebase-auth-poc.test.mjs tests/youtube-discovery.test.mjs`) before Wrangler. These tests must not run `build.mjs`, mutate the issue HTML/index, or regenerate knowledge indexes. The separate weekly generation workflow already runs its documented tests after building. Without smoke-verified first-deploy state, ordinary publish stops before this suite; only the manually approved `--first-deploy` path may initialize it after all smoke checks succeed. Only if the applicable state gate, preflight, and the release acceptance suite pass, invoke `process.execPath node_modules/wrangler/bin/wrangler.js deploy --config firebase-auth-poc/wrangler.toml` for the exact lockfile-pinned `wrangler@4.134.0`. If the local entrypoint is absent, version differs, or auth state cannot be established non-interactively, stop before deployment and report `wrangler-auth`/tooling failure. Capture Wrangler's deployment URL from its successful output; do not invent a URL or target another Worker.

- [ ] **Step 8: Add deployment and smoke tests using injected runners/fetch**

Assert test failure prevents Wrangler invocation; success invokes the exact config and deploy arguments once. After a successful simulated deploy, test `GET /firebase-auth-poc/` returns 200 and unauthenticated `GET /index.html` and `GET /<issue>.html` each return 401. A network failure, unexpected redirect, or different status fails the publish result and reports `post-deploy-smoke`; it must not report success.

- [ ] **Step 9: Run the full automated test suite**

Run: `node --test tests/publish-technews.test.mjs tests/report-structure.test.mjs tests/diagram-jobs.test.mjs tests/firebase-auth-poc.test.mjs tests/youtube-discovery.test.mjs`

Expected: PASS, including the new tests and existing article/diagram/auth tests.

### Task 2: Align weekly automation and operator documentation

**Files:**
- Modify via Codex automation manager: `technews-weekly` automation prompt, schedule, model/runtime metadata only as required
- Modify: `README.md`
- Modify via Codex automation manager after the first confirmed deployment: `technews-weekly` automation memory
- Test: `tests/report-structure.test.mjs`, `tests/publish-technews.test.mjs`

**Interfaces:**
- The automation invokes `node publish-technews.mjs <Sunday issue date>` only after collection, official-primary verification, diagram completion, index generation, and all local checks finish.
- The automation's existing model, target project, and local execution environment remain unchanged.

- [ ] **Step 1: Document the issue period and release gates**

Update the README's weekly workflow section to explain Monday–Sunday issue dates, local-only execution, diagram completion requirement, release preflight command, protected static-site behavior, and the fact that missed local runs are not backfilled automatically. Include the exact safe command `node publish-technews.mjs YYYY-MM-DD` and state that the date must be that week's Sunday.

- [ ] **Step 2: Review README changes and run documentation-related tests**

Run: `node --test tests/report-structure.test.mjs tests/publish-technews.test.mjs`

Expected: PASS; existing standalone HTML and auth-boundary expectations remain unchanged.

- [ ] **Step 3: Update the existing `technews-weekly` automation through the Codex app manager**

Preserve its id, name, local execution environment, target project, model, reasoning effort, and all research/diagram instructions. Change recurrence to Sunday at 21:00 JST and replace every “previous Monday/Sunday” date expression with the current execution week's Monday/Sunday. Append a final gate that calls the release command only after all artifacts, diagram states, indexes, and tests pass; stop and report instead on any failure. Read the saved automation back and verify schedule, project, environment, model, and release instruction.

- [ ] **Step 4: Verify the effective automation configuration**

Read the automation in Codex after update and confirm it is active, weekly Sunday 21:00 in Asia/Tokyo, local, still targets the existing `F:\Dev_hub` project context, and contains the new non-interactive release gate. Do not edit `automation.toml` directly.

### Task 3: First deployment readiness and controlled live acceptance

**Files:**
- Read only: `firebase-auth-poc/wrangler.toml`, `.assetsignore`, `firebase-auth-poc/worker.mjs`
- Update via Codex automation manager after confirmation: `technews-weekly` operational memory

- [ ] **Step 1: Check local deployment prerequisites without publishing**

Run `node publish-technews.mjs --preflight <issue>` and Wrangler's non-mutating identity/version/config checks. Confirm the authenticated account can access the exact Worker and the deployment URL belongs to that Worker. If CLI authentication is absent, stop without launching interactive login from automation.

- [ ] **Step 2: Run a complete local acceptance pass**

Run: `node --test tests/publish-technews.test.mjs tests/report-structure.test.mjs tests/diagram-jobs.test.mjs tests/firebase-auth-poc.test.mjs tests/youtube-discovery.test.mjs`

Then run the release preflight in a no-deploy validation mode against the selected completed issue. Expected: every test and release gate passes and no deploy subprocess is launched.

- [ ] **Step 3: Present exact first-deploy scope for immediate confirmation**

Before publication, show the Worker name, Wrangler config, issue/date, exact command, expected static asset scope, destination URL, preflight/test result, authentication smoke checks, and recovery constraint (Wrangler rollback requires an explicit human confirmation). Wait for the user's confirmation before invoking the real deploy command.

- [ ] **Step 4: Deploy and run the live smoke checks only after confirmation**

Invoke the release command for the approved Sunday issue. Confirm login route is publicly reachable, while `/index.html` and the dated issue return 401 without authentication. Record exact URL, response codes, issue, deployment/version identifier, and result. Do not test by changing authentication settings or allowlists.

- [ ] **Step 5: Record the verified operation and final worktree state**

After live acceptance, update automation memory with the observed target URL, successful command, and smoke results through the Codex automation manager. Run `git status --short --branch` and verify only intended plan/spec/code/docs changes remain in addition to the pre-existing `codex-update/hits.jsonl` modification. Do not stage or commit unless separately requested.

## Plan Self-Review

- Spec coverage: Sunday schedule and week range (Task 2); artifact, diagram, auth, test, and deployment gates (Task 1); local execution and no backfill (Task 2); first publication confirmation, smoke test, and rollback boundary (Task 3); documentation and operational record (Tasks 2–3).
- Placeholder scan: no TODO/TBD steps; all commands and artifact paths are named.
- Type consistency: `getIssuePeriod`, `validateRelease`, and `publishIssue` are declared once and reused consistently; command/fetch injection is used for deterministic no-deploy tests.
