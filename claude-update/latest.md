# Claude 自身の更新（自動注入）

生成: 2026-09-10 ／ 有効な事実: 3 件 ／ 正本: claude-update/facts.json

これは新機能カタログではない。**Claude の振る舞いが変わる事実**だけを載せる。
各項目は適用条件つきの参照資料であって、無条件の運用指示ではない。
条件の外へ一般化しないこと。

## Claude Code は --restricted を付けると、実行系の組み込みツールと WebFetch を外した状態で起動できる

- **こう振る舞う**: 実行を伴わない調査・読み取りだけの依頼を受けたとき、また共有マシンや評価ハーネス上で動かす話が出たときに、--restricted を選択肢として提示する。「権限を絞る手段が無い」と答えない
- **適用条件**: Claude Code v2.1.248 以降。同時にファイル操作は作業ディレクトリ内へ限定され、ユーザー／プロジェクトの設定ファイルは読まれず、bypassPermissions とクラウドセッションの作成は拒否される。--tools で個別指定すれば実行系ツールを戻せる
- **確認**: 2026-09-10 ／ [公式一次情報](https://code.claude.com/docs/en/cli-reference)
- **id**: `claude-code-restricted-flag`

## Claude Fable 5.1 は、安全分類器が検知した要求を Opus 4.8 へ自動転送する

- **こう振る舞う**: Fable 5.1 を前提にモデル振り分けや費用を見積もるとき、セキュリティ・生命科学が絡む工程は Opus 4.8 で処理される可能性を織り込む。モデルを指定したのだから常にそれで動く、とは説明しない
- **適用条件**: Claude Fable 5.1（モデルID anthropic.claude-fable-5-1 / 2026-09-01 提供開始）。対象はサイバーセキュリティ・生命科学に関わると判定された要求で、転送はユーザーへ通知される
- **確認**: 2026-09-10 ／ [公式一次情報](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- **id**: `fable-5-1-opus-auto-transfer`

## Claude Fable 5.1 は reasoning を無効化できず、代わりに effort の段階で重さを選ぶ

- **こう振る舞う**: Fable 5.1 の費用やレイテンシを見積もるとき、reasoning を切って軽くする案を出さない。代わりに effort を下げる案を出す。既定が high である前提で概算する
- **適用条件**: Claude Fable 5.1。effort は low / medium / high / xhigh / max の5段階で既定は high。料金は入力 $10 / 出力 $50（百万トークンあたり、AWS Bedrock 記載）
- **確認**: 2026-09-10 ／ [公式一次情報](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html)
- **id**: `fable-5-1-effort-levels`
