# codex-update

Codex / OpenAI 自身の知識の古さを補い、次のセッションの判断や振る舞いが変わる事実だけを渡す小さなサブ機能です。週次の技術レーダー本体とは候補枠・件数・Linear 紐付けを共有しません。

## 物差し

採否の軸は「Codex が次のセッションで違う振る舞いをする根拠になるか」です。

- OpenAI の資金調達・提携・訴訟など、振る舞いを変えない企業ニュースは採りません。
- 他社 CLI の更新はこの機能の対象外です。
- `facts.json` の `behavior`（何を違うようにするか）を書けない事実は採りません。
- 動画は発見元であって証拠ではありません。`source` には公式一次情報を書きます。

## 週次の手順

1. リポジトリルートで `node codex-update/watch.mjs <号>` を実行し、読み取り専用入力 `discovery/<号>.json` の `toolWatch` 対象チャンネルから Codex / OpenAI 系候補に印を付けます。
2. 候補を物差しで判定し、公式一次情報で裏を取って `issues/<号>.json` と `facts.json` を更新します。裏が取れない候補は `pending` で残します。
3. `node codex-update/emit.mjs --sync-global` で人間確認用 `latest.md` と確認用 HTML 一式を生成し、制限環境用の検証済みスナップショットも更新します。

機械の印は採用を意味しません。企業ニュースや、公式一次情報で成立条件を確認できない説明は、理由を残して `rejected` または `pending` にします。

## ファイルの役割

| ファイル | 役割 | 位置づけ |
|---|---|---|
| `watch.mjs` / `watch.test.mjs` | 候補の拾い網 | ロジック |
| `load.mjs` / `load.test.mjs` | 読み込みと検証 | ロジック |
| `render-md.mjs` / `render-md.test.mjs` | 注入用 Markdown 生成 | ロジック |
| `render-html.mjs` / `render-html.test.mjs` | 確認用 HTML 生成 | ロジック |
| `emit.mjs` / `emit.test.mjs` | 生成の導線 | ロジック |
| `record-hit.mjs` / `record-hit.test.mjs` | 参照記録の検証済み JSONL 追記 | ロジック |
| `inject.mjs` / `inject.test.mjs` | Codex SessionStart 出力 | ロジック |
| `sync-global.mjs` / `sync-global.test.mjs` | AGENTS.md へ毎セッションの読込導線を同期 | 明示実行のみ |
| `issues/<号>.json` | 候補の採否 | **正本** |
| `facts.json` | 採用した事実 | **正本** |
| `hits.jsonl` | 刺さった記録 | **正本** |
| `latest.md` | 人間確認用の事実一覧 | **派生物（手で編集しない）** |
| `index.html` | 確認用の概要・件数・号別リンク | **派生物（手で編集しない）** |
| `articles/facts.html` | 採用した事実・履歴・参照記録の詳細 | **派生物（手で編集しない）** |
| `articles/<号>.html` | 号ごとの候補の採否・理由 | **派生物（手で編集しない）** |

## 刺さった記録

```powershell
node "F:\Dev_hub\p-p-TechNews\codex-update\record-hit.mjs" `
  --topic "<案件>" --item "<fact id>" --effect changed --note "<何をどう変えたか>"
```

`changed` は判断を変えた、`confirmed` は判断を裏付けた、`rejected` は今回は当てはまらないと退けた、という意味です。recorder は `facts.json` にある id だけを受け付け、未知の id・不明な effect・必須項目欠落では書き込みません。メモ自体が `--` で始まる場合は `--note="--から始まる内容"` の形で渡せます。参照 0 件は「この記録に残った参照が無い」という意味で、実際に読まれていないことの証明ではありません。0 件が続くことも含めて、使われ方を可視化します。

`latest.md` と `index.html`、`articles/` 配下の HTML は `node "F:\Dev_hub\p-p-TechNews\codex-update\emit.mjs"` で更新します。`index.html` は概要と各詳細ページへのリンクだけを持ち、`articles/facts.html` に事実の詳細、`articles/<号>.html` に号ごとの候補判断を載せます。各 HTML は外部アセットに依存せず、`file://` から単独で開けます。参照記録は正本に追記されますが、派生物へ反映するには改めて `emit.mjs` を実行します。SessionStart の注入は正本を検証してその場で組み立て、参照件数と記録コマンドを加えるため、人間確認用 `latest.md` の更新とは独立しています。

## Codex への注入

既定の運用経路は、グローバル AGENTS ファイルから `inject.mjs --text` を実行する導線です。通常は次の平文出力を使います。

```powershell
# AGENTS.md などから読む平文
node "F:\Dev_hub\p-p-TechNews\codex-update\inject.mjs" --text
```

Codex の `SessionStart` command hook を別途使う場合に限り、次のコマンドが公式 JSON 契約の `hookSpecificOutput` を stdout へ返します。非管理 hook は登録後のレビューと trust が必要です。契約と trust の手順は [Codex Hooks の公式資料](https://learn.chatgpt.com/docs/hooks) を正とします。

```powershell
# SessionStart command hook 用の JSON
node "F:\Dev_hub\p-p-TechNews\codex-update\inject.mjs"
```

`inject.mjs` は実行時のカレントディレクトリに依存せず、自身の場所の `facts.json` / `issues` / `hits.jsonl` を読みます。`facts.json` が無い、JSON/JSONL が壊れている、検証に失敗する場合は、参照件数を少なく見せたまま進めずエラー終了します。本文が指定上限を超える場合は、正本を確認済みであることと `facts.json` の絶対パスだけを返します。注入上限は `--max-chars <整数>` で変更できます。

### AGENTS.md の同期

グローバル設定や hook を自動変更しません。内容を確認したうえで、毎セッションの最初に `inject.mjs --text` を読む導線と、コマンド実行が制限された環境でも読める検証済みスナップショットを明示的に同期する場合だけ実行します。既定の対象は `CODEX_HOME` またはユーザープロファイルの `.codex` 配下です。空でない `AGENTS.override.md` があればそちらを選び、なければ `AGENTS.md` を選びます。対象ファイルの管理ブロック外は保持し、重複・片側だけのマーカーはエラーにします。

```powershell
node "F:\Dev_hub\p-p-TechNews\codex-update\sync-global.mjs" `
  --target "C:\Users\Owner\.codex\AGENTS.md"
```

`emit.mjs --sync-global` でも同じ同期を明示的に依頼できます。`--target <AGENTS.md>` は `--sync-global` と組み合わせた場合だけ有効です。`sync-global.mjs` は別のデータ置き場を検証するときに `--data-dir <codex-update>` も受け付けます。

通常環境では新しいセッションが実行時の正本を読み、完全な本文が返ればその出力を正として埋め込みスナップショットを無視します。上限超過の退避メッセージが返った場合やコマンド実行が制限された場合は、同期時点のスナップショットも読みます。そのため、事実を追加した週は `--sync-global` も実行します。通常の `emit.mjs` はグローバルファイルを変更しません。同期結果はプロジェクト側の指示と合算される既定 32 KiB 上限に余地を残すため、グローバルファイル全体を 16 KiB 以下に制限します。超過時は古いブロックを書き換えず、管理ブロック外と管理ブロックそれぞれのバイト数を示すエラーで停止します。プロジェクト側の指示量によっては、さらに小さくする必要があります。

この AGENTS 導線を使う環境では、同じ `inject.mjs` を呼ぶ `SessionStart` hook を重ねて登録しません。非管理 hook を登録・変更する場合は、公式仕様に従って `/hooks` で対象定義をレビューして trust します。

## テスト

```bash
node --test codex-update/*.test.mjs
```

Node 22 では `node --test codex-update/` はディレクトリをモジュールとして解決しようとして失敗するため、glob を使います。テストの一時ファイルは `C:/Users/Owner/.codex/tmp/` の下に作り、各テスト後に削除します。参照時刻は JSONL に UTC で保持し、HTML と Markdown の日付は `Asia/Tokyo` の暦日に変換します。

現時点の `facts.json` には、Codex Hooks の trust と AGENTS.md の起動時読み込みに関する公式確認済み事実があります。事実を追加する際は、公式一次情報の確認と `behavior` / `scope` の記述を済ませてから行います。
