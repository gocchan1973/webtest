# Web実装知識の蓄積と週次HTML活用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公式根拠で補正したWeb実装知識を蓄積し、週次TechNews HTMLの候補判断と記事表示へ再利用できるようにする。

**Architecture:** `knowledge/` のMarkdownを正本とし、Node標準機能だけでJSONとAI向け検索Markdownを決定的に生成する。`build.mjs` は記事に指定された知識IDを解決し、関連知識の要点・状態・検証日・原典リンクをHTMLへ表示する。

**Tech Stack:** HTML5、Vanilla JavaScript、Node.js ESM、Node built-in test runner、Markdown、JSON

**Spec:** `docs/superpowers/specs/2026-08-27-web-practices-knowledge-design.md`

## Global Constraints

- Markdownを知識の正本とする。
- JSON/SQLiteなどの検索用派生物は正本から決定的に生成し、手編集しない。
- 公式一次情報で裏付けられない内容は採用ルールへ昇格させない。
- 既存の公式一次情報リンク、YouTube発見リンク、Linear関連付け、フィードバックUIを変更しない。
- 外部ライブラリなしの単体HTML出力を維持する。

---

### Task 1: Knowledge source and deterministic index

**Files:**
- Create: `knowledge/modern-web-practices.md`
- Create: `knowledge/build-index.mjs`
- Create: `knowledge/index.json`
- Create: `knowledge/search.md`
- Test: `tests/ai-context.test.mjs`

**Interfaces:**
- Produces `loadKnowledgeIndex()` returning `{ items: Map<string, KnowledgeItem>, searchText: string }`.
- `build-index.mjs` reads the Markdown headings and fenced metadata blocks and writes deterministic JSON/Markdown outputs.

- [x] **Step 1: Write failing tests** for required knowledge IDs, required fields, generated index freshness, and rejection of duplicate or missing IDs.
- [x] **Step 2: Run `node --test tests/ai-context.test.mjs` and confirm failure because the knowledge files do not exist.**
- [x] **Step 3: Add the initial verified/conditional knowledge entries for image handling, semantic HTML, CSS layout, reduced motion, defer/module, IntersectionObserver, Fetch/AbortController, and CDN/SRI choices.**
- [x] **Step 4: Implement the parser and deterministic index generator using Node built-ins only.**
- [x] **Step 5: Run `node knowledge/build-index.mjs` and `node --test tests/ai-context.test.mjs`; confirm pass.**

### Task 2: Connect knowledge to weekly HTML generation

**Files:**
- Modify: `build.mjs`
- Modify: `tests/report-structure.test.mjs`

**Interfaces:**
- `build.mjs` consumes `knowledge/index.json` and article tuple positions 13-14 as optional `knowledgeIds` and `knowledgeDelta`.
- Produces a `knowledge-relevance` block per linked article, with local knowledge ID, status, verification date, delta text, and source links.

- [x] **Step 1: Write failing tests** for knowledge references in selected articles, rendered status/date/source links, and unknown-ID build failure.
- [x] **Step 2: Run the focused report tests and confirm failure because the generated HTML has no knowledge block.**
- [x] **Step 3: Add knowledge references to a small set of existing articles where the connection is genuine, without padding unrelated articles.**
- [x] **Step 4: Add the renderer and build-time validation while preserving existing tuple compatibility.**
- [x] **Step 5: Run `node build.mjs` and focused report tests; confirm pass.**

### Task 3: Add maintenance documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `tests/ai-context.test.mjs`

- [x] **Step 1: Document how to add a knowledge item, regenerate indexes, attach it to a weekly article, and distinguish discovery from official evidence.**
- [x] **Step 2: Add regression assertions that generated outputs are deterministic and do not contain known invalid examples from the source article.**
- [x] **Step 3: Run `node --test` and `node build.mjs` from a clean generated state.**
- [x] **Step 4: Inspect `git diff --check`, generated file status, and representative HTML output.**
