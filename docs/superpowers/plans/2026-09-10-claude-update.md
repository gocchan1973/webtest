# claude-update サブ機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude の学習カットオフの穴を埋める事実を週次で拾い、人が確認できる HTML と、セッションへ注入される MD として出す。本命の週次記事パイプラインとは分離する。

**Architecture:** `claude-update/` フォルダに閉じる。既存の `discovery/<号>.json` を読み取り専用の入力とし、`toolWatch: true` のチャンネル × 対象語で候補に印を付ける（段1・機械）。印の付いた候補を Claude が物差しで判定し公式一次情報で裏取りして JSON へ書く（段2・手作業）。`emit.mjs` が JSON から `latest.md`（AI が読む）と `index.html`（人が確認する3層）を生成する。

**Tech Stack:** Node.js ESM（外部依存なし）、`node:test` + `node:assert/strict`、既存 Python スクリプト `record_recheck_hit.py` の再利用

**設計書:** `docs/superpowers/specs/2026-09-10-claude-update-design.md`

**テストの実行方法:** `node --test tests/*.test.mjs` のように**ファイルを glob で渡す**。
`node --test tests/` のようなディレクトリ指定は Node 22 では動かない
（モジュールパスとして解決しようとして `MODULE_NOT_FOUND` になる）。
README にも「ディレクトリ指定では動かない」と明記されている。

**ベースライン（2026-09-10 / 81def06 実測）:** 既存テストは **124件中10件が失敗している**。
これは本実装の着手前から落ちているもので、全て生成物まわり（knowledge index /
asset cleanup / image compression / recheck-radar / skill trigger）。
`recheck-radar` の失敗は `invalid knowledge heading: \#\# html-picture ...` で、
見出しの `##` がエスケープされた状態で保存され生成器と食い違っている。

**本実装はこれらに触らない。** 無害性の判定は「全て通る」ではなく
**「失敗が10件から増えていない」**で行う。既存の失敗の調査は本命側の別件として
切り離した（ユーザー判断 2026-09-10）。

**コミットメッセージについて:** 各タスクのコミット文は本文のみを書いてある。
実際にコミットするときは末尾に `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
を付けること（グローバル規約）。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `claude-update/watch.mjs` | 段1。対象語判定と候補の絞り込み。純粋関数のみ |
| `claude-update/load.mjs` | JSON/JSONL の読み込みと検証。壊れた入力で停止する |
| `claude-update/render-md.mjs` | `latest.md` の文字列生成。純粋関数 |
| `claude-update/render-html.mjs` | `index.html` の文字列生成。純粋関数 |
| `claude-update/emit.mjs` | 薄いオーケストレーター。読む→生成→書く |
| `claude-update/*.test.mjs` | 各モジュールのテスト |

**テストをフォルダ内に置く理由:** リポジトリの慣習は `tests/` 配下だが、設計書の「`claude-update/` を丸ごと削除すれば元に戻る」という分離要件を優先する。実行は `node --test claude-update/`。この逸脱は意図的なもの。

**レンダリングを `emit.mjs` から分ける理由:** 文字列生成を純粋関数にすると、ファイル I/O 無しでテストできる。既存 `emit-recheck.mjs` は I/O と生成が混ざっていてテストしづらい形になっている。同じ轍を踏まない。

---

### Task 1: `youtube-channels.mjs` に `toolWatch` を足す

**Files:**
- Modify: `youtube-channels.mjs`
- Test: `tests/youtube-discovery.test.mjs`（既存に追記）

現状は `[handle, label]` の2要素タプル。3要素目にオプションを取れる形へ広げる。既存19件の外形（`length` / `handle` / `label`）は変えない。

- [ ] **Step 1: 失敗するテストを書く**

`tests/youtube-discovery.test.mjs` の末尾に追記:

```js
test('youtube channel registry marks only ATI for claude-update watching', () => {
  const watched = youtubeChannels.filter((c) => c.toolWatch);
  assert.equal(watched.length, 1);
  assert.equal(watched[0].handle, 'tech_news_ati');
  assert.equal(watched[0].label, 'テックニュース@ATI');
});

test('youtube channel registry keeps every other channel unwatched', () => {
  const others = youtubeChannels.filter((c) => c.handle !== 'tech_news_ati');
  assert.equal(others.length, 18);
  assert.ok(others.every((c) => c.toolWatch === undefined));
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test tests/youtube-discovery.test.mjs`
Expected: FAIL（`watched.length` が 1 ではなく 0）

- [ ] **Step 3: 最小の実装**

`youtube-channels.mjs` の ATI のエントリを3要素にし、`map` を広げる:

```js
export const youtubeChannels = [
  ['ai_masaou', 'まさおAIじっくり解説ch'], ['google-school', 'こーすけ先生のGoogle塾'], ['rengaku-ai2', 'れん学長のAIツール実験室'], ['aibusiness8877', 'じゅりん│AIビジネス活用塾'], ['NI-WORK', 'NI-WORK'], ['RICOのAIラボ', 'RICOのAIラボ | AIで業務をもっと楽しく'], ['cocona_ai_school', 'ここなのAI大学'], ['ウェブマニア', 'ウェブマニア'], ['ayy_tech', 'あやや の ITスキルアップ塾'], ['genAI-topic', 'ジェネトピ | AIラジオ'], ['irukano_ecchan', 'Appsheet教室@イルカのえっちゃんねる'], ['imanyu_programming', 'いまにゅのAIプログラミング塾'], ['AI_aaafrog', 'AIで創作効率化とマネタイズby嗚呼蛙'], ['keitoaiweb', 'KEITO【AI&WEB ch】'], ['ai_jitan_lab', 'AI時短ラボ'], ['tech_news_ati', 'テックニュース@ATI', { toolWatch: true }], ['webshokutv', 'ウェブ職TV@AIセキュリティ専門'], ['AICoCreation', 'AI共創イノベーション'], ['ai.seitai', 'AI整体師'],
].map(([handle, label, options]) => ({ handle, label, ...options }));
```

`toolWatch` を解釈するのは `claude-update/watch.mjs` のみ。本命側（`youtube-rss.mjs`）はこのフィールドを読まない。

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/youtube-discovery.test.mjs`
Expected: PASS（既存3件 + 新規2件）

- [ ] **Step 5: コミット**

```bash
git add youtube-channels.mjs tests/youtube-discovery.test.mjs
git commit -m "feat(claude-update): チャンネル定義に toolWatch を追加

claude-update サブ機能が監視対象を選べるようにする。
初期値は テックニュース@ATI のみ。2026-09-06 号の実測で
同 ch は候補6本中4本採択（歩留まり67%）と最も高かった。

タプルの3要素目にオプションを取る形にしたのは、
チャンネル名をコードへハードコードすると2つ目を足す時点で
条件式の書き換えになるため（設計書 10. 見送った案 A案）。

toolWatch を解釈するのは claude-update/watch.mjs のみ。
youtube-rss.mjs は読まないので本命の収集は不変。"
```

---

### Task 2: `claude-update/watch.mjs`（段1・対象語判定）

**Files:**
- Create: `claude-update/watch.mjs`
- Test: `claude-update/watch.test.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`claude-update/watch.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { isTargetTitle, markCandidates } from './watch.mjs';

const channels = [
  { handle: 'tech_news_ati', label: 'テックニュース@ATI', toolWatch: true },
  { handle: 'ai_masaou', label: 'まさおAIじっくり解説ch' },
];

test('isTargetTitle matches Claude and Anthropic in both scripts', () => {
  assert.ok(isTargetTitle('Claude Code v2.1.251 アップデートまとめ'));
  assert.ok(isTargetTitle('claude code の話'));
  assert.ok(isTargetTitle('Anthropic に音楽業界が集団提訴'));
  assert.ok(isTargetTitle('クロードコードの新機能'));
  assert.ok(isTargetTitle('アンソロピックの新モデル'));
});

test('isTargetTitle does not match unrelated titles', () => {
  assert.equal(isTargetTitle('Codex CLI 夏の目玉7選'), false);
  assert.equal(isTargetTitle('GPT-6 Astra が発表'), false);
});

// AND を入れない判断の回帰テスト。設計書 5. の実測に基づく。
test('markCandidates keeps a behaviour-relevant title that has no update vocabulary', () => {
  const candidates = [
    { channel: 'テックニュース@ATI', videoId: 'a', title: '週刊IT技術ニュース｜Claude Code の auto mode が破られる', url: 'u', published: '2026-09-05' },
  ];
  assert.equal(markCandidates(candidates, channels).length, 1);
});

test('markCandidates ignores channels without toolWatch', () => {
  const candidates = [
    { channel: 'まさおAIじっくり解説ch', videoId: 'b', title: 'Claude Fable 5.1 が登場', url: 'u', published: '2026-09-05' },
  ];
  assert.deepEqual(markCandidates(candidates, channels), []);
});

test('markCandidates returns the marked candidates unchanged', () => {
  const candidate = { channel: 'テックニュース@ATI', videoId: 'c', title: 'Claude Code v2.1.251', url: 'u', published: '2026-09-05' };
  assert.deepEqual(markCandidates([candidate], channels), [candidate]);
});

test('markCandidates rejects a candidate whose shape is unexpected', () => {
  assert.throws(
    () => markCandidates([{ channel: 'テックニュース@ATI', title: 'Claude' }], channels),
    /candidate is missing/,
  );
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test claude-update/watch.test.mjs`
Expected: FAIL（`Cannot find module './watch.mjs'`）

- [ ] **Step 3: 最小の実装**

`claude-update/watch.mjs`:

```js
// 段1（機械）。discovery/<号>.json を読み取り専用の入力として、
// toolWatch チャンネル × 対象語 で候補へ印を付ける。
//
// ここは採否のルールではなく「取りこぼしを減らす拾い網」。
// 採否は段2（Claude が物差しで判定し公式一次情報で裏取りする）が決める。
// 更新語との AND を入れない理由は設計書 5. を参照。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { youtubeChannels } from '../youtube-channels.mjs';

export const TARGET_PATTERN = /claude|anthropic|クロード|アンソロピック/i;

const REQUIRED = ['channel', 'videoId', 'title', 'url', 'published'];

export function isTargetTitle(title) {
  return TARGET_PATTERN.test(String(title ?? ''));
}

export function markCandidates(candidates, channels = youtubeChannels) {
  const watched = new Set(channels.filter((c) => c.toolWatch).map((c) => c.label));
  return candidates.filter((candidate) => {
    if (!watched.has(candidate?.channel)) return false;
    // 監視対象だけ検証する。本命の収集スキーマが変わったら黙って落とさず止める。
    const missing = REQUIRED.filter((key) => !candidate[key]);
    if (missing.length) {
      throw new Error(`candidate is missing ${missing.join(', ')}: ${JSON.stringify(candidate)}`);
    }
    return isTargetTitle(candidate.title);
  });
}

export async function markIssue(issue, { dir = 'discovery' } = {}) {
  const raw = JSON.parse(await readFile(`${dir}/${issue}.json`, 'utf8'));
  if (!Array.isArray(raw?.candidates)) {
    throw new Error(`${dir}/${issue}.json に candidates 配列がありません`);
  }
  return markCandidates(raw.candidates);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issue = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue ?? '')) {
    console.error('usage: node claude-update/watch.mjs YYYY-MM-DD');
    process.exitCode = 2;
  } else {
    const marked = await markIssue(issue);
    console.log(JSON.stringify(marked, null, 2));
    console.error(`印: ${marked.length} 件（段2で物差し判定と裏取りが必要）`);
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test claude-update/watch.test.mjs`
Expected: PASS（6件）

- [ ] **Step 5: 実データで動かす**

Run: `node claude-update/watch.mjs 2026-09-06`
Expected: 4件が出る（設計書 5. の実測と一致すること。一致しなければ止めて報告する）

- [ ] **Step 6: コミット**

```bash
git add claude-update/watch.mjs claude-update/watch.test.mjs
git commit -m "feat(claude-update): 段1の対象語判定を追加

toolWatch チャンネル × 対象語（Claude/Anthropic/クロード/アンソロピック）で
discovery/<号>.json の候補へ印を付ける。

更新語との AND を入れていない。2026-09-06 号の ATI 6本を実測したところ、
AND だと『Claude Code の auto mode が破られる』が落ちる。これは既定の
安全性が変わる事実で拾うべきもの。日本語のタイトルは『アップデート』と
書かずに『破られる』『終了』『引き上げ』で更新を表すため、更新語の列挙は
必ず穴が空く。この回帰をテストに固定した。

監視対象の候補だけスキーマを検証して落ちるようにしたのは、
本命の収集スキーマが変わったときに黙って0件にならないため。"
```

---

### Task 3: `claude-update/load.mjs`（読み込みと検証）

**Files:**
- Create: `claude-update/load.mjs`
- Test: `claude-update/load.test.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`claude-update/load.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadIssues, loadFacts, loadHits, validate } from './load.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  return dir;
}

const FACT = {
  id: 'demo-fact',
  fact: 'デモの事実',
  behavior: 'デモのときはこうする',
  scope: 'デモ v1〜',
  source: 'https://example.com/official',
  verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }],
  status: 'active',
  supersededBy: null,
};

test('loadIssues reads issue files newest first', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'issues', '2026-09-06.json'), JSON.stringify([]), 'utf8');
  await writeFile(join(dir, 'issues', '2026-08-30.json'), JSON.stringify([]), 'utf8');

  const issues = await loadIssues(dir);
  assert.deepEqual(issues.map((i) => i.issue), ['2026-09-06', '2026-08-30']);
});

test('loadFacts and loadHits return empty on a fresh install', async () => {
  const dir = await fixture();
  assert.deepEqual(await loadFacts(dir), []);
  assert.deepEqual(await loadHits(dir), []);
});

test('loadHits skips malformed jsonl lines without stopping', async () => {
  const dir = await fixture();
  await writeFile(join(dir, 'hits.jsonl'), '{"item":"demo-fact"}\nnot json\n\n', 'utf8');
  assert.deepEqual(await loadHits(dir), [{ item: 'demo-fact' }]);
});

test('validate accepts a well formed fact', () => {
  assert.doesNotThrow(() => validate({ issues: [], facts: [FACT], hits: [] }));
});

test('validate rejects an active fact without a behaviour', () => {
  const facts = [{ ...FACT, behavior: '' }];
  assert.throws(() => validate({ issues: [], facts, hits: [] }), /behavior/);
});

test('validate rejects a superseded fact that names no successor', () => {
  const facts = [{ ...FACT, status: 'superseded' }];
  assert.throws(() => validate({ issues: [], facts, hits: [] }), /supersededBy/);
});

test('validate rejects duplicate fact ids', () => {
  assert.throws(() => validate({ issues: [], facts: [FACT, FACT], hits: [] }), /duplicate/);
});

test('validate rejects an unknown disposition', () => {
  const issues = [{ issue: '2026-09-06', entries: [{ videoId: 'v1', channel: 'c', title: 't', url: 'u', disposition: 'maybe', reason: 'r', facts: [] }] }];
  assert.throws(() => validate({ issues, facts: [], hits: [] }), /disposition/);
});

test('validate rejects an entry that references an unknown fact id', () => {
  const issues = [{ issue: '2026-09-06', entries: [{ videoId: 'v1', channel: 'c', title: 't', url: 'u', disposition: 'accepted', reason: 'r', facts: ['ghost'] }] }];
  assert.throws(() => validate({ issues, facts: [], hits: [] }), /ghost/);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test claude-update/load.test.mjs`
Expected: FAIL（`Cannot find module './load.mjs'`）

- [ ] **Step 3: 最小の実装**

`claude-update/load.mjs`:

```js
// claude-update の保存物を読み、壊れた状態で先へ進ませない。
//
// 検証を強めにしているのは、段2が Claude の手作業だから。
// 判断のばらつきは構造では消せないが、書き漏らしと参照切れは止められる。
import { readdir, readFile } from 'node:fs/promises';

const DISPOSITIONS = new Set(['accepted', 'rejected', 'pending']);
const STATUSES = new Set(['active', 'superseded']);
const FACT_FIELDS = ['id', 'fact', 'behavior', 'scope', 'source', 'verified', 'status'];

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${path} を読めません: ${e.message}`);
  }
};

export async function loadIssues(dir = 'claude-update') {
  let files;
  try {
    files = await readdir(`${dir}/issues`);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const names = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const issues = [];
  for (const name of names) {
    const entries = await readJson(`${dir}/issues/${name}`, []);
    if (!Array.isArray(entries)) throw new Error(`${dir}/issues/${name} は配列であること`);
    issues.push({ issue: name.replace('.json', ''), entries });
  }
  return issues;
}

export async function loadFacts(dir = 'claude-update') {
  const facts = await readJson(`${dir}/facts.json`, []);
  if (!Array.isArray(facts)) throw new Error(`${dir}/facts.json は配列であること`);
  return facts;
}

export async function loadHits(dir = 'claude-update') {
  let text;
  try {
    text = await readFile(`${dir}/hits.jsonl`, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  // 壊れた行は捨てる。record_recheck_hit.py の load() と同じ扱い。
  // 集計のために全体を止めない。
  return text.split('\n').flatMap((line) => {
    const t = line.trim();
    if (!t) return [];
    try {
      return [JSON.parse(t)];
    } catch {
      return [];
    }
  });
}

export function validate({ issues, facts, hits }) {
  const ids = new Set();
  for (const fact of facts) {
    for (const field of FACT_FIELDS) {
      if (!fact[field]) throw new Error(`fact ${fact.id ?? '(id なし)'}: ${field} が空。物差しを満たさない事実は採らない`);
    }
    if (!STATUSES.has(fact.status)) throw new Error(`fact ${fact.id}: status は active か superseded`);
    if (fact.status === 'superseded' && !fact.supersededBy) {
      throw new Error(`fact ${fact.id}: superseded なら supersededBy に後継の id を書く`);
    }
    if (ids.has(fact.id)) throw new Error(`duplicate fact id: ${fact.id}`);
    ids.add(fact.id);
  }
  for (const fact of facts) {
    if (fact.supersededBy && !ids.has(fact.supersededBy)) {
      throw new Error(`fact ${fact.id}: supersededBy ${fact.supersededBy} が facts.json に無い`);
    }
  }
  for (const { issue, entries } of issues) {
    for (const entry of entries) {
      if (!DISPOSITIONS.has(entry.disposition)) {
        throw new Error(`${issue} / ${entry.videoId}: disposition は accepted / rejected / pending`);
      }
      if (!entry.reason) throw new Error(`${issue} / ${entry.videoId}: reason が空。採否の理由を残す`);
      for (const id of entry.facts ?? []) {
        if (!ids.has(id)) throw new Error(`${issue} / ${entry.videoId}: 未知の fact id ${id}`);
      }
    }
  }
  // hits の item は過去の fact を指すこともあるので参照切れを許す。
  // 記録を消さずに残すため、ここでは件数だけ数える。
  return { factCount: facts.length, hitCount: hits.length };
}

export async function loadAll(dir = 'claude-update') {
  const data = {
    issues: await loadIssues(dir),
    facts: await loadFacts(dir),
    hits: await loadHits(dir),
  };
  validate(data);
  return data;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test claude-update/load.test.mjs`
Expected: PASS（9件）

- [ ] **Step 5: コミット**

```bash
git add claude-update/load.mjs claude-update/load.test.mjs
git commit -m "feat(claude-update): 保存物の読み込みと検証を追加

段2は Claude の手作業なので、判断のばらつきは構造では消せない。
消せるのは書き漏らしと参照切れなので、そこだけ機械で止める。

- active な事実に behavior が無ければ落ちる（物差しをスキーマへ埋める）
- superseded なのに supersededBy が無ければ落ちる
- 採否に reason が無ければ落ちる
- 未知の fact id を参照していれば落ちる

hits の参照切れは許す。過去の事実を指す記録を消さずに残すため。
壊れた jsonl 行を捨てる扱いは record_recheck_hit.py の load() に揃えた。"
```

---

### Task 4: `claude-update/render-md.mjs`（注入用 MD）

**Files:**
- Create: `claude-update/render-md.mjs`
- Test: `claude-update/render-md.test.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`claude-update/render-md.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from './render-md.mjs';

const active = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'デモ v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }], status: 'active', supersededBy: null,
};
const gone = { ...active, id: 'old-fact', status: 'superseded', supersededBy: 'demo-fact' };

test('renderMarkdown lists only active facts', () => {
  const md = renderMarkdown({ facts: [active, gone] });
  assert.ok(md.includes('デモの事実'));
  assert.equal(md.includes('old-fact'), false);
});

test('renderMarkdown always carries scope and source with the fact', () => {
  const md = renderMarkdown({ facts: [active] });
  assert.ok(md.includes('デモ v1〜'));
  assert.ok(md.includes('https://example.com/official'));
  assert.ok(md.includes('デモのときはこうする'));
});

test('renderMarkdown states plainly when nothing has been recorded yet', () => {
  const md = renderMarkdown({ facts: [] });
  assert.ok(md.includes('0 件'));
});

test('renderMarkdown warns that entries are scoped reference material', () => {
  const md = renderMarkdown({ facts: [active] });
  assert.ok(md.includes('適用条件'));
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test claude-update/render-md.test.mjs`
Expected: FAIL（`Cannot find module './render-md.mjs'`）

- [ ] **Step 3: 最小の実装**

`claude-update/render-md.mjs`:

```js
// セッションへ注入される派生物。正本は facts.json。
//
// 注入は「出典と適用条件を伴う参照資料」であって運用指示ではない。
// 特定構成のセキュリティ報告を一般的な禁止事項へ変換させないため、
// scope を必ず fact と同じ行に並べる（設計書 9.）。
export function renderMarkdown({ facts, generated = new Date().toISOString().slice(0, 10) }) {
  const active = facts.filter((f) => f.status === 'active');
  const lines = [
    '# Claude 自身の更新（自動注入）',
    '',
    `生成: ${generated} ／ 有効な事実: ${active.length} 件 ／ 正本: claude-update/facts.json`,
    '',
    'これは新機能カタログではない。**Claude の振る舞いが変わる事実**だけを載せる。',
    '各項目は適用条件つきの参照資料であって、無条件の運用指示ではない。',
    '条件の外へ一般化しないこと。',
    '',
  ];

  if (!active.length) {
    lines.push('**有効な事実は 0 件。** 収集はしているが、まだ採用した事実が無い。', '');
    return lines.join('\n');
  }

  for (const fact of active) {
    lines.push(`## ${fact.fact}`, '');
    lines.push(`- **こう振る舞う**: ${fact.behavior}`);
    lines.push(`- **適用条件**: ${fact.scope}`);
    lines.push(`- **確認**: ${fact.verified} ／ [公式一次情報](${fact.source})`);
    lines.push(`- **id**: \`${fact.id}\``);
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test claude-update/render-md.test.mjs`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add claude-update/render-md.mjs claude-update/render-md.test.mjs
git commit -m "feat(claude-update): 注入用 latest.md の生成を追加

active な事実だけを出し、scope と source を fact と同じ行に並べる。
特定構成のセキュリティ報告を一般的な禁止事項へ変換させないための歯止め
（『auto mode が破られる』→『auto mode はどこでも危険』を防ぐ）。

0 件のときも枠を出す。収集しているが採用が無いことと、
そもそも動いていないことを混ぜないため。

I/O を持たない純粋関数にしたのは、既存 emit-recheck.mjs が
生成と書き込みを混ぜていてテストしづらい形になっているため。"
```

---

### Task 5: `claude-update/render-html.mjs`（確認用 HTML・3層）

**Files:**
- Create: `claude-update/render-html.mjs`
- Test: `claude-update/render-html.test.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`claude-update/render-html.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtml } from './render-html.mjs';

const fact = {
  id: 'demo-fact', fact: 'デモの事実', behavior: 'デモのときはこうする',
  scope: 'デモ v1〜', source: 'https://example.com/official', verified: '2026-09-10',
  discoveredIn: [{ issue: '2026-09-06', videoId: 'v1' }], status: 'active', supersededBy: null,
};
const issues = [{
  issue: '2026-09-06',
  entries: [
    { videoId: 'v1', channel: 'テックニュース@ATI', title: '採った動画', url: 'https://youtu.be/v1', disposition: 'accepted', reason: '仕様が変わる', facts: ['demo-fact'] },
    { videoId: 'v2', channel: 'テックニュース@ATI', title: '外した動画', url: 'https://youtu.be/v2', disposition: 'rejected', reason: '訴訟であり振る舞いは変わらない', facts: [] },
  ],
}];

test('renderHtml opens standalone with no external assets', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.equal(/<(script|link)\s[^>]*src=|<link\s/.test(html), false);
});

test('renderHtml shows why each candidate was kept or dropped', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('訴訟であり振る舞いは変わらない'));
  assert.ok(html.includes('仕様が変わる'));
});

test('renderHtml marks an unused fact as not yet referenced', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('まだ使われていない'));
});

test('renderHtml shows the hit reason next to the fact it belongs to', () => {
  const hits = [{ ts: '2026-09-11T10:00:00+09:00', topic: 'Linear 5-99', item: 'demo-fact', effect: 'changed', note: '調査依頼で --restricted を提案した' }];
  const html = renderHtml({ issues, facts: [fact], hits });
  assert.ok(html.includes('調査依頼で --restricted を提案した'));
  assert.ok(html.includes('Linear 5-99'));
  assert.equal(html.includes('まだ使われていない'), false);
});

test('renderHtml states that self-reported hits are weak evidence', () => {
  const html = renderHtml({ issues, facts: [fact], hits: [] });
  assert.ok(html.includes('弱い証拠'));
  assert.ok(html.includes('強い証拠'));
});

test('renderHtml escapes values that would otherwise break the markup', () => {
  const nasty = { ...fact, fact: '<script>alert(1)</script>' };
  const html = renderHtml({ issues: [], facts: [nasty], hits: [] });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test claude-update/render-html.test.mjs`
Expected: FAIL（`Cannot find module './render-html.mjs'`）

- [ ] **Step 3: 最小の実装**

`claude-update/render-html.mjs`:

```js
// 人が確認する1枚。正本は issues/<号>.json / facts.json / hits.jsonl。
// 外部依存なしで file:// から開けること（既存の号 HTML と同じ条件）。
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const EFFECT_LABEL = {
  changed: '判断を変えた',
  confirmed: '判断が裏付けられた',
  rejected: '当てはまらないと退けた',
};

const STYLE = `
:root { color-scheme: light dark; --line: #d0d0d0; --muted: #666; --warn: #8a5a00; }
body { margin: 0 auto; padding: 2rem 1.25rem; max-width: 52rem; font: 15px/1.8 system-ui, sans-serif; }
h1 { font-size: 1.5rem; margin-bottom: .25rem; }
h2 { font-size: 1.15rem; margin-top: 2.5rem; border-bottom: 2px solid var(--line); padding-bottom: .3rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 .4rem; }
.lead, .note { color: var(--muted); font-size: .9rem; }
.caveat { border-left: 3px solid var(--warn); padding: .6rem .9rem; margin: 1rem 0; font-size: .9rem; }
.card { border: 1px solid var(--line); border-radius: 6px; padding: .9rem 1.1rem; margin: .9rem 0; }
.card.gone h3 { text-decoration: line-through; opacity: .6; }
dl { margin: .4rem 0 0; display: grid; grid-template-columns: max-content 1fr; gap: .2rem .8rem; }
dt { color: var(--muted); font-size: .85rem; }
dd { margin: 0; }
.unused { color: var(--warn); font-size: .9rem; }
.tag { display: inline-block; border: 1px solid var(--line); border-radius: 3px; padding: 0 .4rem; font-size: .8rem; margin-right: .4rem; }
ul { padding-left: 1.2rem; }
`;

function factCard(fact, hits) {
  const mine = hits.filter((h) => h.item === fact.id);
  const used = mine.length
    ? `<ul>${mine.map((h) => `<li><span class="tag">${esc(EFFECT_LABEL[h.effect] ?? h.effect)}</span>${esc((h.ts ?? '').slice(0, 10))} ／ ${esc(h.topic)}${h.note ? `<br>${esc(h.note)}` : ''}</li>`).join('')}</ul>`
    : '<p class="unused">まだ使われていない（参照 0 件）</p>';
  const found = (fact.discoveredIn ?? []).map((d) => esc(d.issue)).join(', ');
  return `<div class="card${fact.status === 'superseded' ? ' gone' : ''}">
<h3>${esc(fact.fact)}</h3>
<dl>
<dt>こう振る舞う</dt><dd>${esc(fact.behavior)}</dd>
<dt>適用条件</dt><dd>${esc(fact.scope)}</dd>
<dt>公式一次情報</dt><dd><a href="${esc(fact.source)}">${esc(fact.source)}</a>（確認 ${esc(fact.verified)}）</dd>
<dt>発見元</dt><dd>${found || '—'}</dd>
<dt>id</dt><dd><code>${esc(fact.id)}</code></dd>
${fact.supersededBy ? `<dt>後継</dt><dd><code>${esc(fact.supersededBy)}</code> に置き換わった</dd>` : ''}
</dl>
<h4 style="font-size:.9rem;margin:.9rem 0 .2rem;">刺さった記録</h4>
${used}
</div>`;
}

function issueSection({ issue, entries }) {
  const rows = entries.map((e) => `<div class="card">
<h3><a href="${esc(e.url)}">${esc(e.title)}</a></h3>
<dl>
<dt>採否</dt><dd>${esc(e.disposition)}</dd>
<dt>理由</dt><dd>${esc(e.reason)}</dd>
<dt>出た事実</dt><dd>${(e.facts ?? []).length ? (e.facts).map((f) => `<code>${esc(f)}</code>`).join(', ') : '—'}</dd>
</dl>
</div>`).join('');
  return `<h3>${esc(issue)}（印 ${entries.length} 件）</h3>${rows || '<p class="note">印の付いた候補なし。</p>'}`;
}

export function renderHtml({ issues, facts, hits, generated = new Date().toISOString().slice(0, 10) }) {
  const active = facts.filter((f) => f.status === 'active');
  const gone = facts.filter((f) => f.status !== 'active');
  return `<!DOCTYPE html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude 自身の更新</title>
<style>${STYLE}</style>
<h1>Claude 自身の更新</h1>
<p class="lead">生成 ${esc(generated)} ／ 有効な事実 ${active.length} 件 ／ 参照記録 ${hits.length} 件</p>
<p class="lead">週次の技術レーダー本体とは別のサブ機能。載せるのは <strong>Claude の振る舞いが変わる事実</strong>だけで、新機能カタログではない。</p>

<h2>1. 採用した事実</h2>
<p class="note">「こう振る舞う」が書けない事実は採らない。適用条件（scope）を条件の外へ一般化しないこと。</p>
${active.map((f) => factCard(f, hits)).join('') || '<p class="note">まだ採用した事実は無い。</p>'}

${gone.length ? `<h2>2. 置き換わった事実</h2>
<p class="note">注入からは外れているが、履歴として残す。</p>
${gone.map((f) => factCard(f, hits)).join('')}` : ''}

<h2>${gone.length ? 3 : 2}. 候補の採否</h2>
<p class="note">印が付いた候補の全件。外したものも理由つきで残す。「見て外した」と「まだ見ていない」を混ぜないため。</p>
${issues.map(issueSection).join('') || '<p class="note">まだ号がない。</p>'}

<h2>${gone.length ? 4 : 3}. この記録の読み方</h2>
<div class="caveat">
<p><strong>「使った」という記録は弱い証拠。</strong>判定しているのが書いた本人（Claude）なので、自己申告の域を出ない。</p>
<p><strong>「0 件が続く」という事実は強い証拠。</strong>読まれていれば何かは残るはずで、何も残らないことは書き手の主観に依存しない。</p>
<p>したがってこの層の狙いは実績を誇ることではなく、<strong>不使用を可視化すること</strong>にある。参照 0 件の事実を隠さず出しているのはそのため。</p>
</div>
<p class="note">記録は同意を条件にしない。読んだうえで「今回は当てはまらない」と退けた回（${esc(EFFECT_LABEL.rejected)}）も残す。測っているのは参照されたかどうかであって、従ったかどうかではない。</p>
</html>`;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test claude-update/render-html.test.mjs`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add claude-update/render-html.mjs claude-update/render-html.test.mjs
git commit -m "feat(claude-update): 確認用 index.html の生成を追加

人が確認する1枚。採用した事実・候補の採否理由・刺さった記録の3層。
外部依存なしで file:// から開ける（既存の号 HTML と同じ条件）。

参照 0 件の事実を『まだ使われていない』と明示して隠さない。
隠すと不使用が見えなくなり、この記録の一番強い証拠が失われるため。

自己申告が弱い証拠であること、0 件の継続が強い証拠であることを
HTML 自身にも書いた。閲覧者が自己申告を実績として過大評価しないため。

出力値は全てエスケープする。動画タイトルは外部由来の文字列で、
このリポジトリが制御していない。"
```

---

### Task 6: `claude-update/emit.mjs`（オーケストレーター）

**Files:**
- Create: `claude-update/emit.mjs`
- Test: `claude-update/emit.test.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`claude-update/emit.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emit } from './emit.mjs';

test('emit writes both derived files from an empty install', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });

  const result = await emit(dir);

  assert.equal(result.factCount, 0);
  assert.ok((await readFile(join(dir, 'latest.md'), 'utf8')).includes('0 件'));
  assert.ok((await readFile(join(dir, 'index.html'), 'utf8')).startsWith('<!DOCTYPE html>'));
});

test('emit refuses to write when a fact fails validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-update-'));
  await mkdir(join(dir, 'issues'), { recursive: true });
  await writeFile(join(dir, 'facts.json'), JSON.stringify([{ id: 'x', fact: 'f', behavior: '', scope: 's', source: 'u', verified: '2026-09-10', status: 'active' }]), 'utf8');

  await assert.rejects(() => emit(dir), /behavior/);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test claude-update/emit.test.mjs`
Expected: FAIL（`Cannot find module './emit.mjs'`）

- [ ] **Step 3: 最小の実装**

`claude-update/emit.mjs`:

```js
// claude-update の派生物を生成する。
// 使い方: node claude-update/emit.mjs
//
// 自分のフォルダの中だけを書く。本命の生成物には一切触らない。
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadAll } from './load.mjs';
import { renderMarkdown } from './render-md.mjs';
import { renderHtml } from './render-html.mjs';

export async function emit(dir = 'claude-update') {
  const data = await loadAll(dir);
  await writeFile(`${dir}/latest.md`, renderMarkdown(data), 'utf8');
  await writeFile(`${dir}/index.html`, renderHtml(data), 'utf8');
  return {
    factCount: data.facts.filter((f) => f.status === 'active').length,
    hitCount: data.hits.length,
    issueCount: data.issues.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await emit();
  console.log(`claude-update: 有効な事実 ${r.factCount} 件 / 参照記録 ${r.hitCount} 件 / ${r.issueCount} 号`);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test claude-update/emit.test.mjs`
Expected: PASS（2件）

- [ ] **Step 5: フォルダ全体のテストを通す**

Run: `node --test claude-update/*.test.mjs`
Expected: PASS（Task 2〜6 の全件）

- [ ] **Step 6: 空の状態で実行して生成物を確認**

```bash
mkdir -p claude-update/issues
node claude-update/emit.mjs
```

Expected: `claude-update: 有効な事実 0 件 / 参照記録 0 件 / 0 号`

- [ ] **Step 7: コミット**

```bash
git add claude-update/emit.mjs claude-update/emit.test.mjs claude-update/latest.md claude-update/index.html
git commit -m "feat(claude-update): 生成の導線を追加

読む→検証→生成→書く だけの薄いオーケストレーター。
自分のフォルダの中だけを書き、本命の生成物には触らない。

検証に落ちたら書かずに止める。壊れた状態の派生物を
セッションへ注入させないため。"
```

---

### Task 7: 2026-09-06 号の実データを入れる（段2・手作業）

**Files:**
- Create: `claude-update/issues/2026-09-06.json`
- Modify: `claude-update/facts.json`

**このタスクだけコードではない。** 印の付いた候補を物差しで判定し、公式一次情報で裏を取る。

- [ ] **Step 1: 印の付いた候補を出す**

Run: `node claude-update/watch.mjs 2026-09-06`
Expected: 4件

- [ ] **Step 2: 各候補を物差しで判定する**

物差しは**「Claude が次のセッションで違う振る舞いをする根拠になるか」**。

設計書 5. の実測による事前判定（Step 3 で裏取りして確定させる）:

| タイトル | 事前判定 |
|---|---|
| Claude Code v2.1.243〜v2.1.251 アップデートまとめ（`--restricted` / `/usage`） | accepted 見込み |
| 週刊IT技術ニュース｜…Claude Code の auto mode が破られる | accepted 見込み |
| Claude Fable 5.1 の正体｜積年のバグを突き止めた… | 要確認 |
| 週刊IT企業ニュース｜Anthropic に音楽業界が集団提訴 | rejected（訴訟。振る舞いは変わらない） |

- [ ] **Step 3: 採る候補を公式一次情報で裏取りする**

WebSearch / WebFetch で Anthropic 公式ドキュメント・リリースノートを当たる。

**動画を出典にしない。** 動画は発見元（`discoveredIn`）であって証拠ではない。

**裏が取れなかったものは `pending` で残す。** URL を推測で埋めない。存在を確認していない URL を `source` に書かない。ATI は週刊まとめ形式なので、1本のタイトルに複数話題が並ぶ。タイトルだけでは中の全話題を確定できない。

- [ ] **Step 4: `claude-update/issues/2026-09-06.json` を書く**

印の付いた**4件全て**を、`disposition` と `reason` つきで書く。形は設計書 6. の通り。`rejected` も省略しない。

- [ ] **Step 5: 裏の取れた事実を `claude-update/facts.json` へ書く**

`behavior` に「私が何を違うようにするか」を具体的に書く。**書けないなら物差しを満たしていないので採らない**（`facts: []` の `accepted` にする）。`scope` にバージョン・条件を必ず入れる。

- [ ] **Step 6: 検証を通す**

Run: `node claude-update/emit.mjs`
Expected: エラーなく完了。件数が Step 5 で書いた数と一致すること

- [ ] **Step 7: 生成された HTML を目視で確認する**

`claude-update/index.html` をブラウザで開き、3層（事実・採否・読み方）が出ていること、参照 0 件が「まだ使われていない」と出ていることを確認する。

- [ ] **Step 8: コミット**

```bash
git add claude-update/issues/2026-09-06.json claude-update/facts.json claude-update/latest.md claude-update/index.html
git commit -m "feat(claude-update): 2026-09-06 号の採否と事実を記録

段1で印が付いた4件を物差しで判定し、公式一次情報で裏を取った。
採否は4件全て記録している（rejected も残す。見て外したことと
まだ見ていないことを区別するため）。

裏が取れなかったものは pending のまま残した。
動画は発見元であって証拠ではないので source には入れていない。"
```

---

### Task 8: `inject_recheck.py` に2ファイル目を読ませる

**Files:**
- Modify: `F:/Dev_hub/scripts/inject_recheck.py`

**このファイルは `~/.claude` ではなく Dev_hub リポジトリ側**。コミット先が別なので注意する。

- [ ] **Step 1: 現状のサイズを測る**

```bash
wc -c F:/Dev_hub/p-p-TechNews/latest-recheck.md F:/Dev_hub/p-p-TechNews/claude-update/latest.md
```

合計が `MAX_CHARS`（12000）に対してどれだけ余裕があるかを確認する。超えるなら Step 3 の上限処理が効く。

- [ ] **Step 2: `RECHECK_PATH` の下に定数を足す**

```python
CLAUDE_UPDATE_PATH = os.getenv(
    "TECHNEWS_CLAUDE_UPDATE_PATH",
    "F:/Dev_hub/p-p-TechNews/claude-update/latest.md",
)

CLAUDE_UPDATE_HITS_PATH = os.getenv(
    "TECHNEWS_CLAUDE_UPDATE_HITS_PATH",
    "F:/Dev_hub/p-p-TechNews/claude-update/hits.jsonl",
)
```

- [ ] **Step 3: `main()` の `context` 組み立ての後、`build_footer()` の前に追記する**

```python
    # claude-update は別サブ機能。再判定（判断が覆ったもの）とは対象が違い、
    # 覆っていない仕様変更も載る。混ぜずに節を分けて足す。
    update_path = Path(CLAUDE_UPDATE_PATH)
    if update_path.is_file():
        try:
            update_body = update_path.read_text(encoding="utf-8").strip()
        except OSError:
            update_body = ""
        # 上限は再判定と合算で見る。注入全体が膨らむと遵守率が落ちるため。
        if update_body and len(context) + len(update_body) <= MAX_CHARS:
            context += "\n\n---\n\n" + update_body
            context += _hits_footer(
                CLAUDE_UPDATE_HITS_PATH,
                "TECHNEWS_HITS_PATH=" + CLAUDE_UPDATE_HITS_PATH,
            )
        elif update_body:
            context += (
                f"\n\n---\n\n※ Claude 自身の更新が上限を超えたため本文は注入していない。"
                f"必要なときに読むこと:\n  {update_path}\n"
            )
```

- [ ] **Step 4: `build_footer()` の隣に共通ヘルパーを足す**

既存の `build_footer()` は `summarize()` を既定パスで呼ぶ。claude-update 用は記録先が違うので、パスを取る形を足す。**`record_recheck_hit.py` は変更しない。**

```python
def _hits_footer(hits_path: str, cmd_prefix: str) -> str:
    """参照実績を注入末尾に添える。集計に失敗しても注入本体は止めない。"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from record_recheck_hit import summarize
        s = summarize(Path(hits_path))
    except Exception:
        return ""

    cmd = (f"{cmd_prefix} python F:/Dev_hub/scripts/record_recheck_hit.py "
           "--topic <案件> --item <fact id> --effect changed|confirmed|rejected")
    if s["total"] == 0:
        return ("\n\n**参照実績: 0 件。** この節がこれまで一度も判断に使われた記録が無い。\n"
                f"上を根拠に判断したら記録すること:\n`{cmd}`\n")
    return (f"\n\n参照実績: 累計 {s['total']} 件 / 直近 {s['days']} 日 {s['recent']} 件"
            f"（最終 {(s['last'] or '')[:10]}）。\n上を根拠に判断したら記録する: `{cmd}`\n")
```

`summarize()` は既に `path` 引数を取る（既定は `HITS_PATH`）ので、スクリプト側の変更は不要。

- [ ] **Step 5: 動作確認**

```bash
echo '{}' | python F:/Dev_hub/scripts/inject_recheck.py
```

Expected: JSON が出力され、`additionalContext` に「Claude 自身の更新」の節と参照実績 0 件の案内が含まれる

- [ ] **Step 6: ファイルが無い環境で壊れないことを確認**

```bash
TECHNEWS_CLAUDE_UPDATE_PATH=/tmp/does-not-exist.md python F:/Dev_hub/scripts/inject_recheck.py <<< '{}'
```

Expected: claude-update の節が足されず、既存の再判定の注入だけが出る。エラーも出ない。
（`claude-update/latest.md` がまだ無い状態や、TechNews を持たない環境でも
`inject_recheck.py` が壊れないことの確認）

- [ ] **Step 7: コミット（Dev_hub リポジトリ側）**

```bash
cd F:/Dev_hub
git add scripts/inject_recheck.py
git commit -m "feat(inject): claude-update の節を注入へ追加

p-p-TechNews の claude-update サブ機能が出す latest.md を
2ファイル目として読む。再判定（判断が覆ったもの）とは対象が違い、
覆っていない仕様変更も載るため、節を分けて足す。

参照実績のフッタを _hits_footer() へ切り出し、記録先パスを
引数で受ける形にした。record_recheck_hit.py は変更していない
（summarize() が既に path 引数を取るため）。

上限（MAX_CHARS 12000）は再判定と合算で見る。注入全体が膨らむと
指示全体の遵守率が落ちるため。超えた場合は本文を入れず場所だけ知らせる。

claude-update/latest.md が無い環境では何も起きない。"
```

---

### Task 9: 入口と README を整える

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Create: `claude-update/README.md`

- [ ] **Step 1: `index.html` の既存リンク箇所を確認する**

```bash
grep -n "asset-cleanup.html\|system-concept.html" index.html
```

既存の独立ページへのリンクがどう書かれているかを見て、同じ書式に揃える。

- [ ] **Step 2: `claude-update/index.html` へのリンクを1行足す**

既存リンクと同じ形式で追加する。文言:

```
Claude 自身の更新（サブ機能）
```

- [ ] **Step 3: `claude-update/README.md` を書く**

```markdown
# claude-update

Claude 自身の学習カットオフの穴を埋めるサブ機能。
**週次の技術レーダー本体とは別物**で、記事枠・Linear 紐付け・件数上限を共有しない。

設計書: `../docs/superpowers/specs/2026-09-10-claude-update-design.md`

## 物差し

**「Claude が次のセッションで違う振る舞いをする根拠になるか」**

これが唯一の判定軸。Anthropic 社の資金調達・提携・訴訟は外す（振る舞いが変わらない）。
他社 CLI の更新も外す（本命の週次記事が扱う）。

`facts.json` の `behavior`（何を違うようにするか）が書けない事実は採らない。

## 週次の手順

1. `node claude-update/watch.mjs <号>` — 印の付いた候補を出す（機械）
2. 各候補を物差しで判定し、**公式一次情報で裏を取って** `issues/<号>.json` と
   `facts.json` を書く（Claude の手作業）。裏が取れなければ `pending` で残す
3. `node claude-update/emit.mjs` — `latest.md` と `index.html` を生成

**動画は発見元であって証拠ではない。** `source` には公式一次情報を書く。

## ファイル

| ファイル | 役割 |
|---|---|
| `watch.mjs` | 段1。toolWatch チャンネル × 対象語で印を付ける |
| `load.mjs` | 読み込みと検証。壊れた状態で先へ進ませない |
| `render-md.mjs` / `render-html.mjs` | 文字列生成（純粋関数） |
| `emit.mjs` | 生成の導線 |
| `issues/<号>.json` | 正本。候補の採否と理由（全件） |
| `facts.json` | 正本。採用した事実（累積・事実単位） |
| `hits.jsonl` | 正本。刺さった記録 |
| `latest.md` / `index.html` | 派生物。手で編集しない |

## 刺さった記録

```bash
TECHNEWS_HITS_PATH=F:/Dev_hub/p-p-TechNews/claude-update/hits.jsonl \
python F:/Dev_hub/scripts/record_recheck_hit.py \
  --topic "<案件>" --item "<fact id>" --effect changed|confirmed|rejected --note "<何をどう変えたか>"
```

読んで「今回は当てはまらない」と退けた回（`rejected`）も記録する。
測っているのは参照されたかどうかであって、従ったかどうかではない。

**この記録は非対称。** 「使った」は自己申告なので弱い証拠、
「0 件が続く」は書き手の主観に依存しないので強い証拠。
狙いは実績を誇ることではなく不使用の可視化にある。

## テスト

```bash
node --test claude-update/*.test.mjs
```

**ディレクトリ指定（`node --test claude-update/`）は動かない。** Node 22 はこれを
モジュールパスとして解決しようとして失敗する。ルートの `tests/` も同じ。

テストをこのフォルダ内に置いているのはリポジトリの慣習（`tests/`）からの
意図的な逸脱。**このフォルダを丸ごと削除すれば元に戻る**という分離要件を優先した。
```

- [ ] **Step 4: ルート `README.md` に1行足す**

「ファイルの役割」の表の下に追記:

```markdown
`claude-update/` は本命とは別のサブ機能（Claude 自身のカットオフの穴を埋める）。
記事枠・Linear 紐付け・件数上限を共有しない。詳細は `claude-update/README.md`。
```

- [ ] **Step 5: 全テストを通す**

```bash
node --test tests/*.test.mjs && node --test claude-update/*.test.mjs
```

Expected: **既存の失敗10件から増えていないこと**（下記「ベースライン」参照）と、新規テストが全て PASS

- [ ] **Step 6: 本命の生成物が変わっていないことを確認する**

```bash
node claude-update/emit.mjs
git status --short
```

Expected: **差分ゼロ**。`claude-update/emit.mjs` は自分のフォルダの中しか書かないため、
生成物にも作業ツリーにも差分が出ない（Task 6 で実測確認済み）。

**注意: テストスイートには副作用がある。** `node --test tests/*.test.mjs` を走らせると
`latest-recheck.md` と `work-reverse-index.md` が必ず変更される（**生成日の行のみ**）。
これは本実装とは無関係で、着手前からのリポジトリの性質。2026-09-10 に
クリーンな worktree で再現確認した。

したがってテスト実行後に差分を見るときは、**生成日の行以外の差分が無いこと**で判定する。

```bash
git diff --stat latest-recheck.md work-reverse-index.md   # 各 1 insertion / 1 deletion のみなら正常
git checkout -- latest-recheck.md work-reverse-index.md   # 確認後は戻す
```

- [ ] **Step 7: コミット**

```bash
git add index.html README.md claude-update/README.md
git commit -m "docs(claude-update): 入口とサブ機能の README を追加

index.html から1行リンクする。中身は混ざらず、入口だけを繋ぐ。

claude-update/README.md に物差し・週次手順・ファイルの役割を書いた。
テストをフォルダ内に置いた理由（分離要件を慣習より優先）も残した。

本命の生成物（latest-recheck.md / work-index.md / work-reverse-index.md）に
差分が出ないことを確認済み。"
```

---

## 完了条件

- [ ] `node --test tests/*.test.mjs` の失敗が **10件から増えていない**（ベースライン参照）
- [ ] `node --test claude-update/*.test.mjs` が全て通る
- [ ] `node claude-update/emit.mjs` が `latest.md` と `index.html` を出す
- [ ] `claude-update/index.html` をブラウザで開き、3層が見える
- [ ] `inject_recheck.py` が claude-update の節を注入する
- [ ] 本命の生成物に差分が出ない
- [ ] `claude-update/` を削除して `youtube-channels.mjs` の `toolWatch` を戻すと、元の状態に戻る

## 未検証のまま残るもの

- **段2の判断の質。** Claude が出典を正しく解釈したことは構造では強制できない。
  `disposition` と `reason` の必須化で可視化するに留まる
- **取りこぼし件数。** 段1が拾えなかった動画は数えていない。測る手段が無い
- **印の件数の将来。** 「週4本」は 2026-09-06 号 1週分の実測であり上限を保証しない
