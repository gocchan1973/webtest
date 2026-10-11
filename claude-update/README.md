# claude-update

Claude 自身の学習カットオフの穴を埋めるサブ機能です。**週次の技術レーダー本体とは別物**で、
記事枠・Linear 紐付け・件数上限を共有しません。

設計書: [../docs/superpowers/specs/2026-09-10-claude-update-design.md](../docs/superpowers/specs/2026-09-10-claude-update-design.md)

## 物差し

唯一の判定軸は「**Claude が次のセッションで違う振る舞いをする根拠になるか**」です。

- Anthropic 社の資金調達・提携・訴訟は外す（振る舞いが変わらない）
- 他社 CLI の更新も外す（本命の週次記事が扱う）
- `facts.json` の `behavior`（何を違うようにするか）が書けない事実は採らない

## 週次の手順

1. `node claude-update/watch.mjs <号>` — 印の付いた候補を出す（機械）
2. 各候補を物差しで判定し、**公式一次情報で裏を取って** `issues/<号>.json` と
   `facts.json` を書く（Claude の手作業）。裏が取れなければ `pending` で残す
3. `node claude-update/emit.mjs` — `latest.md` と `index.html` を生成

注記: **動画は発見元であって証拠ではない。** `source` には公式一次情報を書く。

## ファイルの役割

| ファイル | 役割 | 位置づけ |
|---|---|---|
| `watch.mjs` / `watch.test.mjs` | 段1の対象語判定 | ロジック |
| `load.mjs` / `load.test.mjs` | 読み込みと検証 | ロジック |
| `render-md.mjs` / `render-md.test.mjs` | 注入用 MD 生成 | ロジック |
| `render-html.mjs` / `render-html.test.mjs` | 確認用 HTML 生成 | ロジック |
| `emit.mjs` / `emit.test.mjs` | 生成の導線 | ロジック |
| `issues/<号>.json` | 候補の採否 | **正本** |
| `facts.json` | 採用した事実 | **正本** |
| `hits.jsonl` | 刺さった記録 | **正本** |
| `latest.md` | 注入用の派生物 | **派生物（手で編集しない）** |
| `index.html` | 確認用の派生物 | **派生物（手で編集しない）** |

## 刺さった記録

```bash
TECHNEWS_HITS_PATH=F:/Dev_hub/p-p-TechNews/claude-update/hits.jsonl \
python F:/Dev_hub/scripts/record_recheck_hit.py \
  --topic "<案件>" --item "<fact id>" --effect changed|confirmed|rejected --note "<何をどう変えたか>"
```

- 読んで「今回は当てはまらない」と退けた回（`rejected`）も記録する。
  測っているのは**参照されたかどうか**であって、従ったかどうかではない
- **この記録は非対称**: 「使った」は自己申告なので**弱い証拠**、
  「0 件が続く」は書き手の主観に依存しないので**強い証拠**。
  狙いは実績を誇ることではなく**不使用の可視化**にある

## テスト

```bash
node --test claude-update/*.test.mjs
```

**ディレクトリ指定（`node --test claude-update/`）は動かない。** Node 22 は
これをモジュールパスとして解決しようとして失敗する。ルートの `tests/` も同じ。

テストをこのフォルダ内に置いているのはリポジトリの慣習（`tests/`）からの
意図的な逸脱。「**このフォルダを丸ごと削除すれば元に戻る**」という
分離要件を優先した。

## 注入

`latest.md` は `F:/Dev_hub/scripts/inject_recheck.py` が SessionStart で2ファイル目として読みます。
再判定レーダーとは節を分けて注入されます。
