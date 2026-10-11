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
  - label: web.dev IntersectionObserver
    url: https://web.dev/articles/intersectionobserver
---

IntersectionObserver はスクロールイベントを毎回処理する代わりに、要素の交差状態の変化を通知する。

## Use When

遅延表示、表示領域への到達、無限スクロールの境界を監視するとき。

## Avoid When

ピクセル単位の連続追従や複雑なスクロール位置計算が必要なとき。

## Pitfalls

observer を解除しないまま対象を増やさない。表示済み要素は `unobserve()` して負荷を抑える。

## Compatibility

主要ブラウザで利用可能。

## Accessibility

lazy表示でもキーボード利用者に内容や操作が欠落しないようにする。
