---
name: diagramize
description: Use when the user says 「図解化」「図解して」「図にして」「見える化して」 and asks to turn an article, Linear document, issue, design spec, transcript, memo, or conversation into a visual artifact.
---

# 図解化 (Diagramize)

## 発動名

このスキルの日本語名は「図解化」。次の表現を同義の発動トリガーとして扱う。

* 「この記事を図解化して」
* 「この資料を図解して」
* 「この構想を図にして」
* 「内容を見える化して」
* 「初心者向けに図解化して」

「画像を作って」だけの場合は、内容の構造化が目的か確認する。単なる装飾画像・写真・ロゴ生成にはこのスキルを使わない。

## 入力契約：図解対象パッケージ

記事だけを前提にせず、入力を次のパッケージへ正規化する。

```json
{
  "schemaVersion": 1,
  "subject": {
    "id": "stable-id-or-generated-id",
    "kind": "article|linear-document|linear-issue|design-spec|transcript|memo|conversation",
    "title": "説明対象のタイトル",
    "content": [
      { "type": "summary", "text": "短い要約" },
      { "type": "body", "text": "本文または抽出本文" },
      { "type": "claim", "text": "図にすべき主張" },
      { "type": "constraint", "text": "制約・注意点" }
    ],
    "sources": [{ "title": "出典名", "url": "https://example.com" }]
  },
  "visual": {
    "style": "auto|editorial|instructional|professional|scientific|bento-grid",
    "audience": "beginner|general|expert",
    "orientation": "landscape",
    "language": "ja"
  },
  "output": {
    "artifactType": "infographic|svg|html|pdf",
    "fileName": "stable-output-name"
  }
}
```

`id`がない場合は、対象タイトルと出典から安定したslugを作る。本文がない場合は、ユーザーが渡した要約・箇条書き・URL・ファイルから取得できる範囲だけを使い、事実を補わない。既存CLIの引数へ変換するときは、`visual.style`を`visual_style`、`promptVersion`を`prompt_version`として扱う。

## 実行方針

1. 対象の種類、主張、因果・手順・比較・境界を抽出する。
2. `visual.style` と `visual.audience` を別々に決める。指定がなければ内容から推定し、採用理由を短く記録する。
3. 図の中心メッセージを1つに絞る。記事にない機能・数値・関係は追加しない。
4. PNG生成は、このプロジェクトの `generate-diagram.mjs` と専用Geminiノート（NotebookLM、専用ノート: `87c4b3f0-cf27-4bb1-81a3-0f87436c62f6`「TechNews CLI 図解生成テスト」）のスタジオ機能を使う。NotebookLM CLIの一時ソースは生成後に削除する。
5. 生成処理はキュー管理下で5分〜10分程度を要することがある。依頼ごとにジョブ状態を記録し、`requested` → `queued` → `waiting-capacity` → `generating` → `retrieving` → `embedded` の遷移を追跡する。失敗は `failed`、再実行可能性がないものは `needs-human` とする。
6. NotebookLMの使用枠は実行時の画面表示を確認する。現在の表示が示す5時間リセット、Notebook全体の柔軟な上限、バックグラウンドキューを前提候補とし、仕様を永続的な固定値として断定しない。
7. 認証切れ、RateLimit、生成待ち、保存失敗を区別する。上限到達や3〜5分程度の処理中は失敗にせず、`waiting-capacity` または `generating` のまま `nextCheckAt` を記録する。無限再試行はしない。
8. 取得したPNGはサイズ、MIME、SHA-256を確認し、指定ファイル名で `assets/diagrams/original/` に保存する。
9. 取得した原本PNGは、`generate-compressed-images.mjs` を通してパレット圧縮を行い、`assets/diagrams/compressed/` および `manifest.json` を更新する。
10. HTMLへ組み込む場合は、画像取得とHTML埋め込みを別工程として検証する。既存の専用SVG図解を壊さず、記事IDに対応する成果物として、`alt`（`build.mjs` の `diagramAltText` 登録）、生成スタイル、読者層、出典、`embedded` 状態を保持する。
11. PNG生成が使えない場合は、アクセシブルなインラインSVGまたは既存のフォールバックを使い、HTML全体を失敗扱いにしない。

## 生成ジョブの記録

生成依頼は、最低限次の情報を持つ再開可能な記録として扱う。

```json
{
  "articleId": "stable-article-id",
  "sourceRevision": "article-content-hash-or-revision",
  "visualStyle": "instructional",
  "audience": "general",
  "promptVersion": 1,
  "fileName": "stable-article-id__instructional.png",
  "status": "waiting-capacity",
  "requestedAt": "2026-09-04T00:00:00Z",
  "nextCheckAt": "2026-09-04T05:00:00Z",
  "capacityObservedAt": "2026-09-04T00:01:00Z",
  "capacitySource": "NotebookLM UI notice",
  "sourceCleanup": "pending",
  "embedded": false
}
```

`waiting-capacity` は「上限リセットまたはバックグラウンド処理待ち」、`generating` は「生成処理中」、`retrieving` は「生成物の取得・検証待ち」を意味する。使用枠の判断をしたら、画面表示の取得時刻を `capacityObservedAt`、表示元を `capacitySource` に残す。再開時は同じ `articleId`、`sourceRevision`、`promptVersion`、`fileName` を使い、同じ入力の画像を重複生成しない。生成成功とHTML反映成功は別々に完了させる。

## スタイル選択

| 内容 | 推奨スタイル |
|---|---|
| 手順、因果、判断、使い方 | `instructional` |
| 役割、境界、構成、責務 | `professional` |
| 実測、検証、供給網、性能 | `scientific` |
| 出典、変化、比較、時系列 | `editorial` |
| 複数の独立要素をカードで整理 | `bento-grid` |

`audience=beginner`では専門語を減らして流れを大きく示す。`expert`では制約、例外、検証値を優先する。

## 完了条件

完了報告には、対象ID、選択したstyle／audience、成果物パス、埋め込み先、生成結果、失敗またはフォールバックの有無を含める。生成成功とHTML反映成功を混同しない。

このスキルは、記事の正本やLinear文書を勝手に更新する権限を与えない。外部サービスへの書き込み、公開、最終投稿は別途ユーザーの明示指示が必要。
