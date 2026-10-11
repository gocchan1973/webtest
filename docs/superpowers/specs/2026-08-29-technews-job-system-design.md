# TechNews 共通ジョブ基盤 設計仕様

**作成日:** 2026-08-29  
**状態:** 設計ドラフト  
**関連:** Linear 5-114、`system-concept.html`、`generate-diagram.mjs`

## 1. 目的と位置づけ

TechNewsの情報収集、一次情報確認、記事化、図解生成、HTML埋め込みを、発火経路に依存しない再実行可能なジョブとして扱う。

この文書は、Workspace Studio、GAS、ローカルCLI、将来の別Workerを一つのサービスへ移行する計画ではない。各入口と実行器を交換可能にし、同じ入力から同じ成果物を再生成できるようにするための設計仕様である。

現在の静的HTML生成を壊さず、DBは「ジョブの状態・試行・成果物・監査履歴」の管理層として追加する。記事本文の正本は引き続きリポジトリ側のHTML／データであり、外部サービスや同期フォルダを業務正本にしない。

## 2. 設計原則

### 2.1 純粋な芯／副作用の殻

純粋な芯には、外部サービスへ接続しない決定的な処理だけを置く。

* 入力の正規化とハッシュ計算
* ジョブID・成果物名の決定
* `queued` から `done` までの状態遷移判定
* 重複判定と試行番号の計算
* ビジュアルスタイルと読者層の選択
* 成果物メタデータの組み立て
* HTML構造の生成・検証

副作用の殻には、環境ごとの差し替え対象を閉じ込める。

* Workspace Studioの発火
* GASのDrive監視・ファイル読み書き
* NotebookLM CLI、Gemini、Nano Banana 2の呼び出し
* ローカルファイル、Git、通知、タイマー、ネットワーク

### 2.2 正本は一つ、入口は薄く

発火マーカーやWebhook相当のファイルは、`job_id` と発火元を伝える薄いアダプターにする。各入口が独自に処理判断や状態を持たない。

### 2.3 生成物は移動可能にする

PNG、JSON、HTMLは保存先に依存しないメタデータを持つ。HTMLは必要に応じて画像をBase64で完全埋め込みし、`file://` でも単体で読める成果物にする。

### 2.4 「新しい賭け」か「既存経路への切替」かを先に判定する

実行環境変更の前に、純粋な芯とgolden出力が既に検証済みか確認する。検証済みなら、変更対象を副作用の殻へ限定する。

## 3. システム構成

```text
Workspace Studio ─┐
GAS / Drive監視 ──┼─> Trigger Adapter ─> Job Core ─> Worker Adapter
ローカル CLI ────┘       (薄い入口)       (SQLite)      │
                                                        ├─ NotebookLM/Gemini
                                                        ├─ HTML Builder
                                                        └─ Local/GCS Artifact Store
                                                               │
                                                               ▼
                                                        artifacts + events
```

### 3.1 コンポーネント責務

| コンポーネント | 責務 | DBへ直接書くか |
|---|---|---:|
| Trigger Adapter | 発火条件を検出し、既存または新規の`job_id`を渡す | 直接書かない。Job Coreを呼ぶ |
| Job Core | 入力正規化、冪等性、状態遷移、再試行判定 | 書き込みの唯一の窓口 |
| Worker Adapter | 外部CLI・GAS・生成サービスを呼ぶ | Job Core経由で結果を返す |
| Artifact Store | ファイルを保存し、ハッシュとサイズを返す | DBではなくファイルを保存 |
| HTML Builder | 記事・図解・出典を単体HTMLへ組み立てる | 成果物情報を返す |
| Golden Runner | 外部サービスなしで期待値を再生成する | テスト用DBまたは一時DB |

## 4. ジョブライフサイクル

```text
queued -> running -> done
   │        │
   │        └────> failed -> retry -> queued
   └─────────────> deduplicated
```

* `queued`: 入力と実行条件が確定し、未処理
* `running`: Workerが試行を取得済み。Lease期限を持つ
* `done`: 必須成果物の存在、サイズ、SHA-256、メタデータを確認済み
* `failed`: 再試行または人間判断が必要。エラーを隠さない
* `retry`: 新しい試行番号で再実行を予約する。履歴は消さない
* `deduplicated`: 同じ入力ハッシュとジョブ種別の完了済みジョブを再利用した状態

### 4.1 状態遷移の制約

| 現在 | 次に許可 | 条件 |
|---|---|---|
| `queued` | `running` | 未取得、またはLease期限切れ |
| `queued` | `deduplicated` | 同一入力の完了済み成果物を再利用 |
| `running` | `done` | 必須成果物を検証済み |
| `running` | `failed` | 恒久エラー、期限超過、Worker異常 |
| `failed` | `queued` | 再試行ポリシーが許可、または人間が再実行 |
| `done` | `queued` | 明示的な強制再生成のみ |

DB更新はトランザクション内で行い、`running`取得時は`lease_owner`と`lease_expires_at`を同時に記録する。同期フォルダの存在確認だけで排他を実現しない。

## 5. DB設計

### 5.1 採用方針

初期実装はSQLite 3を採用する。理由は、ローカルファースト、単一ユーザー／小規模バッチ、バックアップ容易性、SQLによる履歴照会、Nodeのテスト容易性である。

SQLiteファイルはローカルの管理領域に置き、Google Drive Desktopの同期フォルダを同時書き込みの調停点にしない。複数端末から同時実行する段階では、GCSの世代一致やCloud SQLなど、サーバーがCAS／トランザクションを保証する層へ移す。

### 5.2 型・共通制約

* 日時はUTCのISO 8601文字列で保存し、表示時にJSTへ変換する
* IDは外部サービスのIDと衝突しない内部UUIDまたは決定的な文字列を使う
* ハッシュは小文字の64文字SHA-256
* JSON列は入力・設定の原形保存に限定し、検索・一意性に必要な値は通常列にも持つ
* `status`、`kind`、`source_type`、`artifact_type`はアプリ側のenumで検証する
* 削除は物理削除せず、履歴と成果物参照を残す

### 5.3 スキーマ

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE jobs (
  job_id              TEXT PRIMARY KEY,
  kind                TEXT NOT NULL, -- article, infographic, html, batch
  status              TEXT NOT NULL CHECK (status IN
    ('queued','running','done','failed','deduplicated')),
  input_hash          TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  visual_style        TEXT NOT NULL DEFAULT 'auto',
  audience            TEXT NOT NULL DEFAULT 'general',
  requested_by        TEXT NOT NULL, -- studio, gas, cli, human
  attempt_count       INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts        INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 0),
  next_retry_at       TEXT,
  lease_owner         TEXT,
  lease_expires_at    TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  started_at          TEXT,
  completed_at        TEXT,
  last_error_code     TEXT,
  last_error_message  TEXT,
  UNIQUE(kind, input_hash)
);

CREATE INDEX jobs_status_retry_idx ON jobs(status, next_retry_at);
CREATE INDEX jobs_lease_idx ON jobs(status, lease_expires_at);

CREATE TABLE job_inputs (
  job_id              TEXT PRIMARY KEY REFERENCES jobs(job_id),
  article_id          TEXT,
  title               TEXT,
  summary             TEXT,
  body_markdown       TEXT,
  source_json         TEXT NOT NULL,
  source_hash         TEXT NOT NULL,
  prompt_json         TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE TABLE job_attempts (
  job_id              TEXT NOT NULL REFERENCES jobs(job_id),
  attempt_no          INTEGER NOT NULL CHECK (attempt_no > 0),
  worker_id           TEXT NOT NULL,
  adapter_type        TEXT NOT NULL, -- notebooklm-cli, gas, local-node
  status              TEXT NOT NULL CHECK (status IN
    ('running','done','failed','cancelled')),
  external_task_id    TEXT,
  started_at          TEXT NOT NULL,
  finished_at         TEXT,
  error_code          TEXT,
  error_message       TEXT,
  result_json         TEXT,
  PRIMARY KEY(job_id, attempt_no)
);

CREATE TABLE artifacts (
  artifact_id         TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES jobs(job_id),
  attempt_no          INTEGER NOT NULL,
  artifact_type       TEXT NOT NULL, -- png, json, html, md
  file_name           TEXT NOT NULL,
  storage_uri         TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  byte_size           INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256              TEXT NOT NULL,
  embedded            INTEGER NOT NULL DEFAULT 0 CHECK (embedded IN (0,1)),
  verified            INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  created_at          TEXT NOT NULL,
  UNIQUE(job_id, attempt_no, artifact_type, sha256),
  FOREIGN KEY(job_id, attempt_no)
    REFERENCES job_attempts(job_id, attempt_no)
);

CREATE INDEX artifacts_job_idx ON artifacts(job_id, artifact_type);

CREATE TABLE workers (
  worker_id           TEXT PRIMARY KEY,
  worker_kind         TEXT NOT NULL, -- notebooklm, gemini, html-builder
  adapter_version     TEXT NOT NULL,
  model_name          TEXT,
  cli_version         TEXT,
  enabled             INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  config_json         TEXT NOT NULL DEFAULT '{}',
  last_seen_at        TEXT
);

CREATE TABLE job_events (
  event_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id              TEXT NOT NULL REFERENCES jobs(job_id),
  attempt_no          INTEGER,
  event_type          TEXT NOT NULL, -- created, claimed, state_changed, artifact_verified, error
  from_status         TEXT,
  to_status           TEXT,
  actor               TEXT NOT NULL,
  detail_json         TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL
);

CREATE INDEX job_events_job_time_idx ON job_events(job_id, created_at);
```

### 5.4 テーブル間の関係

```text
jobs 1 ── 1 job_inputs
jobs 1 ── N job_attempts 1 ── N artifacts
jobs 1 ── N job_events
workers 1 ── N job_attempts
```

### 5.5 `jobs`の一意性と重複排除

`UNIQUE(kind, input_hash)`を第一防衛線にする。入力ハッシュは、記事IDだけでなく、対象本文、出典URL、要約、生成用スタイル、読者層、プロンプトバージョンを正規化した値から作る。

同じ入力をもう一度処理したい場合は、既存行を上書きしない。次のどちらかを明示する。

1. 完了済み成果物を再利用し、`deduplicated`イベントを記録する
2. `prompt_version`または`force_generation_id`を入力へ含め、新しい入力ハッシュで強制再生成する

### 5.6 Leaseとクラッシュ復旧

Workerはジョブを取得すると、`running`、`lease_owner`、`lease_expires_at`、試行番号を同一トランザクションで更新する。プロセスが落ちてLeaseが期限切れになったジョブは、別Workerが再取得できる。

同じジョブの二重取得を、Drive上のロックファイルや競合コピーで防止してはならない。単一SQLiteプロセスを越える調停が必要になったら、サーバー側の条件付き更新へ移行する。

## 6. 入力とビジュアル指定

ジョブ入力では、画像の見た目を一つの曖昧な`style`に押し込めない。

```json
{
  "articleId": "copilot-agents-md",
  "visualStyle": "instructional",
  "audience": "general",
  "orientation": "landscape",
  "language": "ja",
  "promptVersion": 1
}
```

### 6.1 `visualStyle`

* `editorial`: 出典・比較・変化を整理
* `instructional`: 手順・判断・因果を整理
* `professional`: 境界・役割・構成を整理
* `scientific`: 実測・検証・供給網を整理
* `bento-grid`: 複数要素をカード状に整理
* `auto`: 記事IDと内容から決定

### 6.2 `audience`

* `beginner`: 用語を減らし、関係・流れ・因果を大きく示す
* `general`: 重要語を残し、本文の判断を補助する
* `expert`: 制約、境界、検証値、例外を優先する

## 7. NotebookLM／Gemini Workerの契約

### 入力

* `job_id`
* 記事本文・要約・一次出典
* `visual_style`、`audience`、言語、向き
* 出力ファイル名
* プロンプトバージョン

### 実行

1. 一時Markdownソースを作成
2. 専用Notebookへ追加
3. ソースの準備完了を待機
4. インフォグラフィック生成を要求
5. 成果物タスクを待機
6. 指定ファイル名でPNGを取得
7. サイズ・MIME・SHA-256を検証
8. `artifacts`と`job_events`へ記録
9. 一時ソースを必ず削除

### 失敗分類

| 分類 | 例 | 扱い |
|---|---|---|
| 認証 | Google認証期限切れ | `failed`。再認証後に再試行 |
| 上限 | RateLimit、利用枠超過 | `queued`または`failed`。次回時刻を設定 |
| 入力 | ソース不備、対象記事なし | 恒久エラー。人間確認 |
| 生成 | 外部タスク失敗、内容不適合 | 再試行回数内で再実行 |
| 保存 | ダウンロード失敗、ハッシュ不一致 | 成果物を無効化して再試行 |

成功していない処理を`done`にしない。外部サービスの応答だけで完了と判定せず、ローカル成果物の検証までを成功条件に含める。

## 8. HTML生成との接続

HTML BuilderはDBから本文を取得するのではなく、TechNewsの既存正本データと、検証済み`artifacts`を入力にする。これにより、HTMLがDBの表示専用ビューへ変質することを防ぐ。

* 生成済みPNGは記事IDに対応する成果物として検索する
* 既存の専用SVG図解がある記事は、専用SVGを優先し、PNGは補助図解として扱える
* PNGを埋め込む場合は`alt`、生成スタイル、生成日、出典を保持する
* 外部画像URLを正本HTMLへ埋め込まない
* ビルド後にHTML内の画像、`alt`、SHA-256記録、アクセシビリティ要素を検証する

## 9. バックアップ・保持・削除

* DBは日次で世代バックアップする
* 成果物ファイルはDBの行を先に作らず、保存・検証成功後に行を確定する
* 一時ソースは外部Notebookから処理単位で削除する
* `job_events`と完了済み成果物は、ジョブ本体を再実行しても削除しない
* 失敗成果物は削除せず、`verified=0`として診断可能にする
* 個人情報やAPIキーを`payload_json`、プロンプト、イベント詳細へ保存しない

## 10. Golden再生成とテスト

### 10.1 Golden Runner

外部サービスを呼ばず、固定入力から以下を決定的に再生成する。

* 正規化済み入力ハッシュ
* ジョブJSON
* 状態遷移結果
* 期待ファイル名
* 成果物メタデータ
* HTMLの構造とアクセシビリティ要素

### 10.2 テスト階層

1. 純粋関数：ハッシュ、状態遷移、スタイル判定、ファイル名
2. SQLite契約：一意性、Lease、トランザクション、イベント履歴
3. Adapter契約：外部CLIをモックし、成功・上限・認証・保存失敗を再現
4. HTML統合：PNG埋め込み、SVG優先、`alt`、単体`file://`相当の構造
5. 実機E2E：NotebookLM CLIは枠・認証状態を確認して少数ジョブのみ実行

## 11. 導入順序

### Phase 0：現状維持

現在の`build.mjs`、`generate-diagram.mjs`、SVGフォールバックを継続し、画像生成失敗でもHTML生成を止めない。

### Phase 1：ローカルSQLiteのジョブ記録

記事図解生成を対象に、`jobs`、`job_attempts`、`artifacts`、`job_events`を導入する。既存CLIの一時ソース削除と出力ファイル命名を契約化する。

### Phase 2：再試行と復旧

Lease、上限待ち、認証切れ、強制再生成、成果物ハッシュ検証を追加する。5時間リセットなど、外部サービス側の利用枠を固定値としてハードコードしない。

### Phase 3：発火アダプター追加

GASまたはWorkspace Studioから、薄い発火マーカーで同じ`job_id`を投入する。入口ごとに処理ロジックを複製しない。

### Phase 4：複数端末・サーバー調停

同時実行が必要になった場合のみ、SQLite単体からサーバー側の条件付き更新・トランザクションを持つ保存層へ移す。移行時もJob Coreの契約を維持する。

## 12. 非目標

* NotebookLMを恒久的な記事保管庫にすること
* Google Drive同期フォルダを分散ロックとして使うこと
* すべての記事へ自動的に画像を付けること
* GeminiやWorkspace Studioの仕様・利用枠を推測で固定すること
* 静的HTMLをDB表示画面へ置き換えること
* 生成画像の見栄えだけで記事の採用判断を自動化すること

## 13. 完了条件

設計実装が完了したと見なす条件は次のとおり。

* 同じ入力を二度投入しても二重実行されない
* Worker異常後にLease期限切れから再開できる
* `done`には検証済み成果物だけが紐づく
* 失敗理由と試行履歴を後から照会できる
* NotebookLM CLIが使えない場合もSVGまたは既存HTML生成が機能する
* スタイルと読者層を独立に指定できる
* HTMLが単体で移動・保存できる
* golden再生成とSQLite契約テストが通る
