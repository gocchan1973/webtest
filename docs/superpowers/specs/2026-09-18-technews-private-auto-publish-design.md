# TechNews 週次記事の認証付きサイト自動更新 設計仕様

**作成日:** 2026-09-18
**状態:** ユーザー確認済み（Opus外部添削はユーザー承認により省略）
**関連:** `technews-weekly` ローカル自動化、`firebase-auth-poc/wrangler.toml`、`build.mjs`

## 1. 目的

既存の週次TechNews処理で作成・検証した記事と一覧を、Firebase UID許可リストで保護された既存Cloudflare Workerへ自動反映する。新しい収集基盤や公開APIは作らず、既存のローカル週次処理の後段に、検証とデプロイを追加する。

実行日は毎週日曜日21:00（日本時間）とし、対象期間を実行日が属する週の月曜日から日曜日までとする。日曜実行に合わせ、既存の「直前の月曜日から日曜日」という期間計算を「今週の月曜日から日曜日」へ変更する。

## 2. 現状確認

- `C:\Users\Owner\.codex\automations\technews-weekly\automation.toml` は `ACTIVE` のローカル実行で、毎週月曜09:00。週次記事、図解、HTML、索引の生成とテストを指示しているが、Cloudflareデプロイは指示していない。
- `build.mjs` が日付別記事とルート `index.html`（週次アーカイブ）を生成する。
- `collections/technews/index.html` は `/index.html` へ転送する。したがって新号を掲載するには、日付別記事とアーカイブを同じデプロイへ含める必要がある。
- `firebase-auth-poc/wrangler.toml` は Worker `technews-private-auth-test` と `assets.directory = ".."` を指定し、プロジェクトルートを静的アセットとして配信する。
- `firebase-auth-poc/worker.mjs` はログインページ等の限定パス以外をFirebase許可UIDで保護する。
- ルート `.assetsignore` は `.git`、`node_modules`、`.playwright-cli`、`.claude`、`assets/diagrams/original` を除外している。
- このローカル環境では `wrangler` コマンドがPATHに見つからない。実行可能性を PATH や npm の `.cmd` shim に委ねず、Node 22 以上で動く `wrangler@4.134.0` を exact devDependency と lockfile に固定し、`node_modules/wrangler/bin/wrangler.js` を `process.execPath` で起動する。

## 3. 採用方針

### 採用：既存のローカル週次処理を延長

`technews-weekly` の同じ実行内で、既存の収集・一次情報照合・記事選定・図解・HTML生成を完了した後、受入ゲートを満たした場合だけ、設定済みの `technews-private-auth-test` Workerへデプロイする。

### 今回採用しない

- GitHub Actions等への移設：週次の調査・NotebookLM利用・認証を別実行環境へ移すため、今回の範囲を超える。
- Worker受信用Webhook/APIの追加：記事の別保存先、書込認証、重複制御が増え、現在の静的HTML正本と重複する。
- Git push：現状remoteが無く、公開の前提にしない。

## 4. 実行フローと公開ゲート

```text
日曜21:00 JST
  → 今週(月〜日)の候補収集・公式一次情報照合
  → 記事・図解・関連付け・各種索引を生成
  → ローカルテストと成果物検査
  → Worker名・認証・除外設定の事前確認
  → 成功時だけ既存認証付きWorkerへデプロイ
  → 公開URLの応答・認証境界をスモーク確認
```

デプロイ前に、少なくとも次を自動検査する。

1. 対象日付の記事HTMLとルートアーカイブが存在し、記事一覧から当該記事へ到達できる。
2. 既存の採用基準・公式一次情報の出典要件・件数方針が満たされている。少数号の例外は既存要件どおり理由を記録する。
3. 全記事の図解状態が完了済みの埋め込み、または既存仕様で認めたアクセシブルなSVGフォールバックのいずれかで確定している。`queued`、`generating`、`retrieving` 等の未完了状態は公開しない。
4. 生成後の `index.html` に新号と記事へのリンクが存在し、公開に関係する読み取り専用の受入テスト（新規リリースゲート、記事構造、図解状態、認証境界、YouTube候補取得）が成功する。サイト全体を再生成するテストは公開ゲートから呼ばない。
5. Wrangler設定のWorker名が `technews-private-auth-test` のままで、`.assetsignore` に原本・認証情報・不要な開発ファイルの除外がある。
6. デプロイ認証がすでに有効である。対話ログインや認証設定変更が必要なら自動実行せず停止する。
7. 初回実デプロイの前は `.technews-release-state.json` が存在しないため、通常 publish は子プロセスを一切起動せず停止する。個別の直前承認を得た手動 `--first-deploy` モードだけが初回経路へ進める。3つの未認証スモーク（ログイン 200、`/index.html` 401、日付別記事 401）が全て成功した後だけ state を記録し、失敗時は記録せず以後の通常 publish も停止する。

いずれかの確認が失敗した場合、デプロイせず、失敗段階と必要な対応だけを報告する。NotebookLMの容量待ちや認証切れは既存の再開可能状態を維持し、未完了のまま公開しない。

## 5. デプロイ後確認と復旧

- デプロイ後、ログインページが未認証で取得できること、アーカイブと日付別記事が未認証では拒否されることを確認する。
- 公開先・Worker名・稼働バージョンは実装開始時にCloudflareの読み取り専用確認で照合する。別Worker、カスタムドメイン、本番Workerへ転送しない。
- 自動スモーク確認に失敗した場合は成功として扱わず、公開先・応答コード・対象号を記録し、ユーザーへ通知する。
- Wranglerのロールバックが対話確認を求める場合、定期処理内で未確認のロールバックを試みない。直前の稼働バージョンを記録し、復旧にはそのバージョンへの明示確認を要する。
- 初回の実デプロイは、設定・差分・対象Worker・コマンド・復旧方法を直前に提示し、個別にユーザー確認を得て行う。
- 初回成功 state はローカル運用状態であり、`.assetsignore` と `.gitignore` の両方で静的配信・Git追跡から除外する。以後の通常 publish はこの state の Worker 名と 3つの成功ステータスを検証してから進む。

## 6. 認証・データ境界

- Firebase Authentication、許可UID、セッションCookie、公開ログインパスは変更しない。
- 新たな公開書込エンドポイント、Firebase/Cloudflare DB、記事アップロード用シークレットは追加しない。
- 公開対象は既存Workerの静的アセットのみ。HTMLと図解は従来どおりリポジトリの生成物を正本とし、フィードバックはブラウザ内保存のままとする。
- `.assetsignore` と `.gitignore` の `.technews-release-state.json` 除外を保持し、原本図解とローカル運用状態を配信成果物やGit作業ツリーの成果物として扱わない。
- Git commit/pushの自動実行は今回のスケジュール変更に含めない。ローカルの生成物変更は既存のGit作業として残し、別途明示的なGit操作で扱う。

## 7. 運用条件と失敗分類

- スケジュールは既存Codex Desktopのローカル実行であり、PC・Codexが実行可能な状態にない期間の実行保証や追い付きは提供しない。
- `source-fetch`、`primary-verification`、`diagram-capacity/auth`、`build/test`、`first-deploy-confirmation`、`wrangler-auth`、`deploy`、`post-deploy-smoke`、`first-deploy-state` を別段階として報告し、失敗を「情報なし」や「成功」に丸めない。
- ネットワーク・一次情報取得、NotebookLM待ち、ビルド/テスト失敗、Cloudflare認証切れ、Workerデプロイ失敗、認証境界スモーク失敗を区別する。
- 週次タスクの指示とアプリ管理の実設定の両方を更新し、保存後に日曜21時・ローカル実行・対象プロジェクト・公開先の一致を読み戻して検証する。

## 8. 完了条件

1. 自動化設定が毎週日曜21:00 JSTのローカル実行になり、対象期間が実行週の月〜日と一致する。
2. 公開に関係する受入テストまたは認証前提のいずれかが満たされない場合、デプロイ関数/コマンドが呼ばれないことをテストで証明する。
3. 正常経路では、生成アーカイブ・記事・知識索引を一括して既存Workerへ反映できる。
4. Worker名不一致、除外漏れ、認証切れ、未完了図解、テスト失敗の各異常系で公開が中断される。
5. 初回の公開後にログイン画面、未認証拒否、新号一覧リンクを確認する。以後の実行では自動スモーク結果を記録する。
6. READMEと自動化メモが、ローカル実行・公開ゲート・復旧境界と一致する。

既存テストの基準状態：2026-09-18の確認で `node --test --test-concurrency=1` は240件中230件成功。失敗には記事登録件数の固定期待値55と現状72の不一致、資産削除候補の古い期待値、`build.mjs` 内の生成先ファイル書込み失敗が含まれる。リリース事前検査からサイト全体を再生成するテストを外し、公開対象に対する読み取り専用受入テストを実行する。既存の広範テスト群を成功扱いにしたり、サイト出力をテスト中に再生成したりしない。

## 9. 実装対象候補

- `C:\Users\Owner\.codex\automations\technews-weekly\automation.toml`（アプリ管理の実設定として更新し、直接編集しない）
- `C:\Users\Owner\.codex\automations\technews-weekly\memory.md`（運用履歴の追記）
- `README.md`（週次生成後の配信フローとローカル実行制約）
- `firebase-auth-poc/wrangler.toml` / `.assetsignore`（必要な変更が確認できた場合のみ）
- デプロイ前ゲートを担う小さなNodeスクリプトとテスト（設計レビュー後、既存構造に沿って決定）
