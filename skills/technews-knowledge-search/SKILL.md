---
name: technews-knowledge-search
description: Use when the user asks in Japanese or English to search TechNews knowledge, accumulated knowledge, related past articles, or Karpathy Wiki style reusable knowledge without changing files or publishing anything.
---

# TechNews Knowledge Search

このスキルは `F:\Dev_hub\p-p-TechNews` の蓄積知識を検索して要約するための読み取り専用スキル。日本語では少なくとも次の依頼を発動対象として扱う。

- 「TechNewsの知識を検索して」
- 「蓄積知識から調べて」
- 「過去記事と関連知識を探して」
- 「Karpathy Wiki の知識を参照して」

別のプロジェクトへ勝手に広げず、最初に現在の TechNews ルートが `F:\Dev_hub\p-p-TechNews` か、その直下の作業ツリーであることを確認する。ルートが違う場合は、その事実を明示してからこのプロジェクト内だけを対象にする。

## 最初に読む順序

必ず最初に `knowledge/AI_SEARCH.md` を読む。次に目的に応じて必要最小限の資料だけを読む。

1. `knowledge/AI_SEARCH.md`
2. `knowledge/search.md`
3. `knowledge/index.json`
4. 必要に応じて `knowledge/graph.json`
5. 必要に応じて `knowledge/article-links.json`
6. 必要に応じて `knowledge/wiki/index.html`
7. 必要に応じて `knowledge/wiki/articles.html`
8. 必要に応じて該当の週次 HTML (`YYYY-MM-DD.html`)

## 使い分け

- キーワードで候補を探す: `knowledge/search.md`
- 知識ID、状態、関連知識、関連週次記事、関連案件を厳密に読む: `knowledge/index.json`
- 関連知識から記事、案件、原典へのつながりを追う: `knowledge/graph.json`
- ある記事が知識へ未登録か確認する: `knowledge/article-links.json` と `knowledge/wiki/articles.html`
- 人間向けの一覧をざっと探す: `knowledge/wiki/index.html`
- 最終的な記事本文、判断、原典URLを確認する: 該当の週次 HTML

## 正本と派生物

- 正本: `knowledge/entries/*.md` と `knowledge/modern-web-practices.md`
- 正本: 各 `YYYY-MM-DD.html` の週次 HTML
- 派生物: `knowledge/search.md`
- 派生物: `knowledge/index.json`
- 派生物: `knowledge/graph.json`
- 派生物: `knowledge/article-links.json`
- 派生物: `knowledge/wiki/index.html`
- 派生物: `knowledge/wiki/articles.html`

正本と派生物を混同しない。知識そのものの内容は正本を優先し、探索や横断参照には派生物を使う。

## 原典と発見元

記事発見元と根拠を混同しない。

- 「発見元」は週次 HTML や記事一覧、関連付け一覧のどこで見つけたか
- 「原典」は `knowledge/index.json` や週次 HTML に載っている外部URL

回答では、必要なら「発見元」と「原典」を分けて書く。原典URLがある場合は原典を優先し、週次 HTML は判断本文の確認元として扱う。

## 実行方針

1. 依頼の対象が知識検索、過去記事探索、関連案件確認、未登録確認のどれかを判定する。
2. `knowledge/search.md` で候補を当て、`knowledge/index.json` で ID と状態を確定する。
3. 関連知識や関連案件が必要なときだけ `knowledge/graph.json` を読む。
4. 記事側から未登録や関連付け状態を確認したいときだけ `knowledge/article-links.json` または `knowledge/wiki/articles.html` を読む。
5. 主張や出典URLを確認するときだけ該当の週次 HTML を開く。
6. 情報がなければ「未登録」と明示し、推測で補完しない。

## 返答形式

検索結果は必要な件数だけ簡潔に返し、各候補に次を含める。

- 知識ID
- 要点
- 適用条件
- 状態
- 関連記事・案件
- 原典
- 未登録状態

未登録の記事や知識しか見つからない場合は、そのまま `未登録` と書く。存在しない関連や未確認の因果は作らない。

短い回答例:

```text
- 知識ID: html-image-dimensions
  要点: 画像寸法を先に予約してCLSを抑える
  適用条件: 一覧カードや初期表示外の画像を扱うとき
  状態: verified
  関連記事・案件: chrome-speed-records / 関連案件なし
  原典: MDN img, web.dev CLS
  未登録状態: なし

- 記事ID: youtube-webmcp
  未登録状態: 未登録
  発見元: knowledge/article-links.json
```

## 境界

このスキルは読み取り専用。ファイル変更、生成物更新、外部送信、投稿、公開、Issue更新、Linear更新は行わない。変更や公開が必要なら、別タスクとして明示指示を待つ。
