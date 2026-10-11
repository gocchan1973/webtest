---
id: html-image-dimensions
title: 画像には寸法を持たせる
topic: HTML / Performance
status: verified
verified_at: 2026-08-27
related_rules:
  - web-performance-layout-stability
related_knowledge:
  - js-intersection-observer
related_articles:
  - chrome-speed-records
sources:
  - label: MDN img
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img
  - label: web.dev CLS
    url: https://web.dev/articles/optimize-cls
---

画像の表示寸法をHTMLで予約すると、読み込み前後のレイアウトシフトを抑えられる。遅延読み込みは初期表示に不要な画像へ限定する。

## Use When

ファーストビュー外の画像や一覧カードを表示するとき。

## Avoid When

LCP対象画像を無条件に `loading="lazy"` にするとき。

## Pitfalls

`width` と `height` は実際の比率に合わせる。`loading="lazy"` は全画像への機械的付与ではない。

## Compatibility

HTML標準。対象ブラウザの性能差は実測する。

## Accessibility

意味のある画像には内容を表す `alt`、装飾画像には空 `alt` を付ける。
