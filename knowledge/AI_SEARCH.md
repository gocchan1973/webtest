# AI検索入口

## 最初に読む順序

TechNews の検索は、まずこの順で読む。

1. `knowledge/AI_SEARCH.md`
2. `knowledge/search.md`
3. `knowledge/index.json`
4. `knowledge/wiki/index.html`
5. 必要に応じて `knowledge/graph.json` / `knowledge/article-links.json` / `knowledge/wiki/articles.html` / `YYYY-MM-DD.html`

## 用途ごとの入口

- キーワードで当たりを付ける: `knowledge/search.md`
- 項目の正規化済み情報を機械的に読む: `knowledge/index.json`
- 関連知識→記事→案件→原典をたどる: `knowledge/graph.json`
- 人間向けに知識一覧から探す: `knowledge/wiki/index.html`
- 記事ごとの関連有無を確認する: `knowledge/article-links.json` / `knowledge/wiki/articles.html`
- 週ごとの判断本文と出典を確認する: `YYYY-MM-DD.html`（例: `2026-08-23.html`）

## 記事登録と知識検証の違い

- 記事登録≠知識検証済み。`article-links.json` で `registered` でも、それは記事を探索対象として登録しただけで、再利用知識として公式検証済みとは限らない
- `linked` は記事が既存 knowledge に接続済みであることを示す
- `関連知識なし` は記事登録済みだが、現行 knowledge にまだ接続していないことを示す
- 暫定号でタイトル未展開の記事は `タイトル未展開` と明示し、推測で補完しない

## 正本と派生物

- 正本: `YYYY-MM-DD.html` の各週次HTML。記事本文、判断、出典はここを優先する（例: `2026-08-23.html`）
- 正本: `knowledge/modern-web-practices.md` と `knowledge/entries/*.md`。再利用知識の元データ
- 派生物: `knowledge/search.md`
- 派生物: `knowledge/index.json`
- 派生物: `knowledge/graph.json`
- 派生物: `knowledge/article-links.json`
- 派生物: `knowledge/wiki/index.html` と `knowledge/wiki/articles.html`

## 迷ったときの選び方

- 用語や実装パターンを探すなら `knowledge/search.md`
- 1つの知識項目を厳密に扱うなら `knowledge/index.json`
- どの記事や案件につながるか知りたいなら `knowledge/graph.json`
- ある記事が現行知識で未登録か確認したいなら `knowledge/article-links.json`
- ある記事が登録済みだが関連知識なしなのか、knowledge に接続済みなのかを見たいなら `knowledge/article-links.json` / `knowledge/wiki/articles.html`
- 最終的な主張と出典URLを確認したいなら該当の `YYYY-MM-DD.html`（例: `2026-08-23.html`）

## 辿り方

`knowledge/search.md` で候補を見つける
→ `knowledge/index.json` で項目ID・関連知識・関連週次記事・関連案件を確定する
→ `knowledge/graph.json` または `knowledge/wiki/index.html` で関連知識→記事→案件→原典を広げる
→ `knowledge/wiki/articles.html` または `knowledge/article-links.json` で記事側の関連付け状態を確認する
→ 最後に該当の `YYYY-MM-DD.html` を開いて本文と出典を確認する

## 更新コマンド

知識入口を更新したら、次を順に実行する。

```powershell
node build.mjs
node knowledge/build-index.mjs
node emit-recheck.mjs
node emit-work-index.mjs
node --test
```
