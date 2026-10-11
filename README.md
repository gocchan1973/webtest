# p-p-TechNews

週次の技術レーダー。単体HTMLが正本で、そこから**AIが読むための派生物**を生成する。

AIが検索を始める固定入口は `knowledge/AI_SEARCH.md`。

目的は2つ。

1. **既存プロジェクト・Linear と関連する更新にフラグを立てる**
2. **AI 自身が学習カットオフ以降の変化に気づく**

## 生成の流れ

```
sources.mjs ──→ 週次で公式一次情報を巡回（AI側のタスク／スキル）
    │
    ↓
build.mjs ──→ <号>.html（正本・人間用・フィードバックUI付き）
    │              ↑ relevance.mjs / apply-*.mjs が記事と案件を結ぶ
    │
    ├─ emit-recheck.mjs ────→ latest-recheck.md   （話題側から引く）
    └─ emit-work-index.mjs ─→ work-index.md       （案件側から引く）
```

## コマンド

```bash
node build.mjs && node emit-recheck.mjs && node emit-work-index.mjs
```

テストは `node --test tests/report-structure.test.mjs`（ディレクトリ指定では動かない）。

## 非公開TechNewsの週次公開

運用手順と2026-10-11時点で元PC上に確認された自動化・公開状態は [`docs/運用書.md`](docs/運用書.md) を参照してください。この節は公開コマンドとゲートの説明です。設計時点の記録は [`docs/superpowers/specs/2026-09-18-technews-private-auto-publish-design.md`](docs/superpowers/specs/2026-09-18-technews-private-auto-publish-design.md) に残っていますが、現在の運用状態を判断するときは運用書と対象PC上の実設定を確認してください。

元PCで確認された `technews-weekly` は、毎週日曜日21:00（日本時間）に実行するローカル自動化です。対象号は実行日の属する週の月曜日から日曜日までで、号の日付はその日曜日です。ローカル実行のため、実行時にコンピューターとCodexが利用可能である必要があります。停止中などに逃した実行は自動でバックフィルされません。クラウドPCに移した後は、自動化設定・認証・公開状態を個別に確認する必要があります。

公開は次のゲートを順番に通します。記事の発見と公式一次情報による確認、全記事の図解完了、HTMLと索引の生成、ローカル受入テスト、公開前検査（preflight）、最後にデプロイです。これらは別々の段階であり、前段の失敗・未完了があれば後段へ進みません。図解ジョブが `queued`、`generating`、`retrieving`、`needs-human` など未完了・要対応の状態なら公開を止めます。受け入れるのは検証情報付きでHTMLへ埋め込み済みのPNG、または承認済みでアクセシブルなインラインSVGフォールバックだけです。

公開先は既存のFirebase認証付きCloudflare Worker `technews-private-auth-test` で、設定は `firebase-auth-poc/wrangler.toml` にあります。認証方式・UID・Cookie・ログイン経路は変更せず、公開書き込みAPIも追加しません。静的アセット配信対象から `assets/diagrams/original/`、ローカルのデプロイ状態ファイル `.technews-release-state.json`、`.git/`、`node_modules/` を除外します。

実行環境には Node.js `>=22.0.0` が必要です（固定版 `wrangler@4.134.0` の要件）。依存関係は `npm ci` でロックファイルどおりに導入します。公開スクリプトはローカルに固定したWranglerを使うため、グローバル版や都度ダウンロードした最新版のWranglerは使いません。

公開前検査だけを行う安全なコマンドは次です（日付は対象号の日曜日）。これはデプロイしません。

```bash
node publish-technews.mjs --preflight YYYY-MM-DD
```

初回の実デプロイには、その実行直前の人間による別途明示承認が必要です。承認後に限り、初回モードを明示して実行します。

```bash
node publish-technews.mjs --first-deploy YYYY-MM-DD
```

初回デプロイ後、ログイン画面が未認証で成功し、`/index.html` と日付別記事が未認証では401を返すスモーク検査に成功した場合にだけ、ローカルへ初回確認状態が保存されます。この確認済み状態ができるまでは、通常公開コマンドは処理を開始せず停止します。状態確認後の定期公開は次のコマンドです。

```bash
node publish-technews.mjs YYYY-MM-DD
```

公開スクリプトは公開前にローカル受入テスト、固定Wranglerの版と認証状態、成果物・図解・公開境界を検査します。ゲート失敗時はデプロイ前に停止します。デプロイ後のスモーク検査失敗は失敗として報告されます。自動Git commit/pushや自動ロールバックは行いません。運用書は元PCで初回実デプロイ後のスモーク状態を確認したと記録していますが、その状態ファイルはクラウド移行用ZIPに含まれていません。クラウドPC上の現在状態は別途確認してください。

## ファイルの役割

| ファイル | 役割 |
|---|---|
| `build.mjs` | 全号の記事データを保持し、HTMLを生成する本体 |
| `sources.mjs` | **公式一次情報の取得先。ここが唯一の定義**。増やすときはここだけ直す |
| `relevance.mjs` | 記事 → Linear Issue / Project の対応と、接続コメント |
| `emit-recheck.mjs` | HTMLから「ハーネス改善提案」（旧号は「AI自己更新・再判定レーダー」）を抽出しMD化（36KB→2.5KB） |
| `emit-work-index.mjs` | `relevance.mjs` を反転し、案件 → 関連更新の逆引きを生成 |
| `<日付>.html` | 各号（正本）。外部依存なしで `file://` から開ける |
| `latest-recheck.md` | 派生物。カットオフ以降で判断が覆った箇所 |
| `work-index.md` | 派生物。Linear Issue・案件からの逆引き索引 |

`emit-*.mjs` は **HTMLからの抽出に徹し、`build.mjs` には手を入れない**。
HTMLが正本、MDは派生という関係を壊さないため。テスト98件もこの前提で通る。

## claude-update（別物のサブ機能）

`claude-update/` は本命の週次技術レーダーとは別物のサブ機能で、Claude 自身の学習カットオフの穴を埋めます。
記事枠・Linear 紐付け・件数上限を共有しません。詳細は [claude-update/README.md](claude-update/README.md) を参照。

## 再判定レーダー（週ごとの3状態）

号定義の `recheck` が、その週の状態をそのまま表す。**「未確認」と「確認して該当なし」を混ぜない。**

状態は `recheck/<号>.json` が持つ。`build.mjs` は編集しない。

| `recheck/<号>.json` | 意味 | 出力 |
|---|---|---|
| 項目が入っている | 判断を変える更新があった | 項目が並ぶ |
| `[]` | 公式一次情報を確認したが該当なし | 「今週、ハーネスに効く更新なし」（v1 号は「今週、判断を変える更新なし」）の枠が出る |
| ファイルが無い | **まだ確認していない** | 枠ごと出ない。`build.mjs` が警告し、`latest-recheck.md` にも「未確認の号」として載る |

区別できないと、蓄積が増えないときに「巡回していない」のか「巡回して該当なし」なのかが後から判定できない。

週次タスク `self-update-check-weekly` がこの JSON を直接書く。**出力先を成果物側に置くのは意図的**で、
以前は `~/.claude/tmp/` へ書いていたため SessionEnd フックに毎回消され、次号の材料が残らなかった。

### `weekly-updates/<号>.md`（その週の公式更新の全体像）

`recheck/` は「ハーネスに効くか」で絞った**提案**だけを残す。**その週に公式が何を出していたか**は残らないため、
週次タスクは絞り込む前の更新（Claude Code・Codex・Newsroom など、版と公開日つき）を全件ここへ書く。
`latest-recheck.md`（毎セッション注入される）へは入れない。

- 書くのは週次タスク（スキル `self-update-check`）。手編集しない。**既にある号のファイルは原本として保持し、スキルは取り直さない。**
  更新したいときは人が退避してから再実行する
- `build.mjs` は参照しない。形式の検証は仕上げスクリプト（スキル側 `finalize.mjs`）が行う（存在と体裁のみ）
- 版管理に入れ、週次の commit に含める

### 仕上げスクリプトとの契約

スキル側の `finalize.mjs` は、`build.mjs` を import して `recheck/*.json` を全件検証する（**import 時に全件検証される**のは意図した結合。
関係のない号の不正ファイルでも止まる）。`build.mjs` / `emit-recheck.mjs` を変えるときは `tests/finalize-contract.test.mjs`
（`node --test tests/finalize-contract.test.mjs`）が落ちないことを確認する。落ちたら変更を戻すか、スキル側 `finalize.mjs` を合わせる。

```json
[
  {
    "status": "改善提案",
    "title": "〜を〜に変えると良くなる",
    "harness": ["~/.claude/settings.json", "~/.claude/hooks/rule_reminders.py"],
    "fields": [["現状のハーネス", "…"], ["公式の変更", "…"], ["提案", "…"], ["期待する改善", "…"], ["確認方法", "…"]],
    "links": [["公式一次情報", "https://…"], ["発見元YouTube：チャンネル名", "https://…"]]
  }
]
```

**2026-09-27 号以降（v2「ハーネス改善提案」）の規則**（`build.mjs` の `HARNESS_PROPOSAL_SINCE`）:

- 目的は、公式のバグ修正・新機能・既定値の変更を材料に、既存ハーネス（`~/.claude` の rules / hooks / settings、`F:/Dev_hub/skills`、定期タスク等）をどう変えると良くなるかを、公式一次情報の裏取り付きで提案すること
- `status` は `改善提案` / `回避策の撤去` / `追従が必要` のいずれか。それ以外は build が拒否する
- `fields` のラベルは順に `現状のハーネス` / `公式の変更` / `提案` / `期待する改善` / `確認方法` の5つで固定
- `harness` は必須。対象ファイルパス等の空でない文字列配列（存在チェックはしない）。表示は title の直後に「対象：」行で出る
- 該当が無い週は `[]`。枠には「今週、ハーネスに効く更新なし」と出る
- ハーネスのどこに効くかを言えない新機能は載せない

**v1（2026-09-20 以前の号）の形式**は次のとおりで、検証は従来どおり緩いまま。表示・文言も当時のまま（「AI自己更新・再判定レーダー」）。

```json
[
  {
    "status": "判断更新",
    "title": "〜しかない、を再判定",
    "fields": [["以前の判断", "…"], ["更新差分", "…"], ["現在の再判定", "…"], ["次の一手", "…"]],
    "links": [["公式一次情報", "https://…"], ["発見元YouTube：チャンネル名", "https://…"]]
  }
]
```

- `発見元YouTube：` で始まるラベルだけ `discovery-link`、それ以外は `source-link` になる
- `links` は必須。出典の無い再判定は `build.mjs` が拒否する
- `sources.mjs` にある取得先は `["ラベル", {"sourceId": "..."}]` で書く。そのソースが消えたら build が止まる
- 組み立ては `recheckRadar()` / `recheckItem()`、検証は `validateRecheck()` の担当

**過去号へ遡って再判定を後付けしない。** 当時の判断を後から作ることになる。
警告の対象はレーダーを載せ始めた `RECHECK_SINCE`（2026-08-16）以降の号だけ。

## Web実装知識の蓄積

`knowledge/modern-web-practices.md` と `knowledge/entries/*.md` が、Web記事を公式仕様で再確認して蒸留した知識の正本です。単一Markdownの既存資産は残しつつ、新規・拡張項目は1ファイル1項目の `entries/` 形式で増やせます。記事要約ではなく、本質、適用条件、避ける条件、失敗例、互換性、アクセシビリティ、関連知識、関連週次記事、関連案件、原典を項目ごとに記録します。

知識を追加・更新したら、まず `build.mjs` で全記事登録台帳を更新し、その後 `knowledge/build-index.mjs` で AI 向け検索インデックスを再生成します。

```powershell
node build.mjs
node knowledge/build-index.mjs
```

生成物は次の4つです。

- `knowledge/index.json`: ビルド用の決定的インデックス
- `knowledge/search.md`: AI・人間の検索用圧縮ビュー
- `knowledge/graph.json`: 関連知識・記事・案件・出典のグラフ
- `knowledge/article-links.json`: 全記事を対象にした知識関連付け coverage
- `knowledge/wiki/index.html` と `knowledge/wiki/*.html`: 静的 wiki
- `knowledge/wiki/articles.html`: 記事ID・号・関連知識・未登録状態の追跡ビュー

`entries/*.md` の最小形は YAML front matter と本文です。

```md
---
id: js-intersection-observer
title: 可視範囲処理はObserverを使う
topic: JavaScript / Performance
status: verified
verified_at: 2026-08-27
related_knowledge:
  - html-image-dimensions
related_articles:
  - chrome-speed-records
related_work:
  - 5-8 帳票構造JSON基盤
sources:
  - label: MDN Intersection Observer
    url: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
---

IntersectionObserver はスクロールイベントを毎回処理する代わりに、要素の交差状態の変化を通知する。

## Use When

遅延表示、表示領域への到達、無限スクロールの境界を監視するとき。
```

`build.mjs` は全48記事を探索対象として走査し、各記事を `article` 登録として `knowledge/article-links.json` と `knowledge/wiki/articles.html` に残します。`knowledgeIds` がある記事は `linked`、無い記事は `registered` として扱い、「記事登録済みだが関連知識なし」を区別します。記事登録は探索対象への収載であり、knowledge として公式検証済みであることを意味しません。発見元と公式一次情報は混同しません。

記事検索の手順は `knowledge/AI_SEARCH.md` を入口にします。通常は `knowledge/search.md` → `knowledge/index.json` → `knowledge/graph.json` / `knowledge/wiki/index.html` → `knowledge/article-links.json` / `knowledge/wiki/articles.html` → 該当の `YYYY-MM-DD.html` の順で確認します。

通常の更新手順は次です。

```powershell
node build.mjs
node knowledge/build-index.mjs
node emit-recheck.mjs
node emit-work-index.mjs
node --test
```

## 図解・インフォグラフィックの設計

単調さを防ぎ要点を直感的に伝えるため、選定された主要記事には編集部品質のインラインSVGインフォグラフィック（`articleDiagrams`）を配置しています。

- **外部アセットゼロ**: 画像ファイルや外部フォントに依存せず、インラインSVGとCSSで完結し、単体HTML（`file://`）で完全自走
- **構造化・視線誘導**: 単なる箱と矢印ではなく、ステップバッジ、判定ゲート（Decision Gate）、分岐ルーティング（YES/NO）、鎖（Chain Link）メタファー等で視覚階層とリズムを形成
- **アクセシビリティ (a11y)**: `role="img"`、`<title>`、`<desc>`、`aria-labelledby` を完備し、スクリーンリーダー対応とWCAG準拠の高コントラストを確保
- **テーマ両立**: ダークテーマおよび `muted-ivory` ライトテーマの両方で階層とコントラストが破綻しないセマンティックCSSクラス設計

### NotebookLM CLIによる画像図解（任意・半自動）

画像生成を試す場合は、`notebooklm-py`で固定の専用Notebook（`NOTEBOOKLM_NOTEBOOK`）を使います。実行ごとに指示Markdownを一時ソースとして追加し、生成・PNG取得後にそのソースを削除します。Notebook自体や生成物は残り、指示ソースだけが掃除されます。

```powershell
$env:NOTEBOOKLM_NOTEBOOK = '<専用Notebook ID>'
node generate-diagram.mjs search-ai-controls
```

生成には数分かかることがあります。既存PNGがある場合は再生成せず、再試行時だけ `--force` を付けます。CLIは非公式かつ未文書APIに依存するため、SVG図解を常時利用できるフォールバックとして維持します。


## sources.mjs の設計

`cadence` と `destination` で巡回頻度と判定基準が変わる。

| cadence | 巡回 | 例 |
|---|---|---|
| `weekly` | 毎回 | changelog 系（今週の差分） |
| `monthly` | その月の初回のみ | 設計原則系（Engineering ブログ） |

| destination | 残す基準 |
|---|---|
| `ai-self-update-recheck` | 過去の「不可・複雑・保留」を覆す更新 |
| `agent-design-principles` | 既存のハーネス・ルールを裏づける／覆す原則 |

## 原則

- **一次情報で確認する。** 二次情報（YouTube等）は発見の入口までで、主張の根拠にしない
- **水増ししない。** 該当がない週は「判断を変える更新なし」と記録する。それが正しい結果
- **無理に結びつけない。** 逆引きで該当が無ければ何も提案しない
- フィードバックは localStorage のみ。JSON書き出しまで外部送信しない

## 未定

週次生成を Node のまま回すか GAS へ寄せるかは引き続き様子見です。元PCで確認された週次自動化と公開状態は [`docs/運用書.md`](docs/運用書.md) に記録しています。この節の記述は設計時点や移行前の状態と混同しないよう、実運用を変更したら運用書を更新してください。

## 共通ジョブ基盤構想

情報収集、記事化、図解生成、HTML化を、発火経路に依存しない再実行可能なジョブとして扱うための設計仕様を定義しています。

設計の芯は、次の分離です。

```text
Workspace Studio / GAS / CLI
          ↓ 薄い発火アダプター
共通ジョブ正本（SQLite）
          ↓
Worker（NotebookLM・Gemini・HTML Builder）
          ↓
検証済み成果物（PNG / JSON / HTML）
```

* 純粋な芯：入力ハッシュ、重複判定、状態遷移、スタイル選択、成果物メタデータ
* 副作用の殻：Drive監視、外部CLI、画像生成、通知、ファイル保存
* 状態：`queued` → `running` → `done`、または `failed` → `retry`
* DBの正本：ジョブ、試行、成果物、Worker、append-onlyイベント
* HTMLの正本：記事本文と出典。DBはジョブ追跡層であり、記事表示用DBにはしない

DBスキーマ、Lease、冪等性、失敗分類、golden再生成、段階導入は [共通ジョブ基盤 設計仕様](docs/superpowers/specs/2026-08-29-technews-job-system-design.md) にまとめています。

構想の視覚版は [system-concept.html](system-concept.html) です。これはEM移行の作業項目ではなく、複数プロジェクトへ転用する開発ヒント／採用候補です。
