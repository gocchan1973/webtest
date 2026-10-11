# TechNews Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次情報に基づく2週分の単体HTML技術レーダーと、ブラウザ内保存・JSON出力型の記事フィードバックを作る。

**Architecture:** 期間別調査は独立したサブエージェントへ分担し、主担当が一次情報と日付を再確認して記事を選定する。成果物は外部依存のない2つのHTMLで、同一のフィードバック実装を埋め込み、Node標準テストと実ブラウザで検証する。

**Tech Stack:** HTML5、CSS、Vanilla JavaScript、Web Storage API、Blob download、inline SVG、Node.js built-in test runner

**Spec:** `docs/superpowers/specs/2026-08-15-technews-trial-design.md`

## Global Constraints

- 作業ルートは `F:\Dev_hub\p-p-TechNews` とする。
- 2つの完成HTMLはフォルダ直下へ置く。
- 外部JavaScript、外部CSS、CDN、サーバー、bundler、npm依存を使用しない。
- 一次情報を優先し、公開日が対象期間内の情報だけを記事として扱う。
- 外部レビューはユーザー指定により今回省略する。
- 調査サブエージェントは `gpt-5.6-luna`、`medium` を明示し、ファイル編集をさせない。

---

### Task 1: 期間別一次情報調査

**Files:**
- Create: `C:\Users\Owner\.Codex\tmp\technews-2026-08-02-research.md`
- Create: `C:\Users\Owner\.Codex\tmp\technews-2026-08-09-research.md`

**Interfaces:**
- Consumes: 対象期間、選定軸、公式情報源
- Produces: 公開日、タイトル、一次情報URL、要約、開発方針への影響を持つ候補一覧

- [ ] **Step 1: 期間ごとの調査を並列 dispatch する**

各agentは指定期間だけを調べ、ファイル編集を行わず、候補と根拠を指定の一時ファイルへ書く。

- [ ] **Step 2: 主担当が一次情報を再確認する**

候補の公開日、一次情報URL、主張との対応をWebで確認し、対象期間外・重複・宣伝のみの項目を除外する。

- [ ] **Step 3: 記事化する候補を決める**

各号3〜7件を目安にし、件数を満たすための水増しはしない。図解候補には、比較対象と伝える関係を一文で指定する。

### Task 2: フィードバック挙動とHTML構造

**Files:**
- Create: `tests/report-structure.test.mjs`
- Create: `2026-08-02.html`
- Create: `2026-08-09.html`

**Interfaces:**
- Consumes: Task 1の検証済み記事候補
- Produces: `localStorage` key `p-p-TechNews:<issue-date>` と、`technews-feedback-<issue-date>.json` ダウンロード

- [ ] **Step 1: 構造テストを先に作る**

Node `node:test` で両HTMLの不在または必要要素不足を検出し、対象期間、記事カード、一次情報リンク、4種類のボタン、保存、復元、JSONダウンロード、外部依存なしをassertする。

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/report-structure.test.mjs`

Expected: FAIL because `2026-08-02.html` and `2026-08-09.html` do not exist.

- [ ] **Step 3: 2つの単体HTMLを作る**

各記事は一意な `data-article-id` を持つ。フィードバックボタンは `data-feedback` に `important`、`try`、`watch`、`dismiss` を持ち、選択状態をARIA属性とCSS classへ反映する。`dismiss` と前三者の排他規則を実装する。

- [ ] **Step 4: GREENを確認する**

Run: `node --test tests/report-structure.test.mjs`

Expected: すべてPASS。

### Task 3: 実ブラウザ検証

**Files:**
- Modify: `2026-08-02.html` only if a reproduced defect requires a fix
- Modify: `2026-08-09.html` only if a reproduced defect requires a fix
- Modify: `tests/report-structure.test.mjs` when adding a regression test for a reproduced defect

**Interfaces:**
- Consumes: Task 2の2HTML
- Produces: file URLでの表示・操作・JSON出力の検証結果

- [ ] **Step 1: Chromiumで両HTMLを開く**

コンソールエラー、レイアウト崩れ、外部リクエストがないことを確認する。

- [ ] **Step 2: フィードバックを操作する**

`重要` と `試したい` の複数選択、`不要` の排他、再読込後の復元を確認する。

- [ ] **Step 3: JSON書き出しを確認する**

ダウンロードされたJSONに号、出力日時、記事ID、記事タイトル、選択値が含まれることを確認する。

- [ ] **Step 4: 全検証を再実行する**

Run: `node --test tests/report-structure.test.mjs`

Expected: すべてPASSし、ブラウザコンソールエラーが0件。

