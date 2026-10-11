# Web実装知識検索インデックス

AI検索入口: `knowledge/AI_SEARCH.md`
生成元: modern-web-practices.md, entries

## css-grid-gap | 二次元配置はGrid、間隔はgap
- CSS / Layout / verified
- 本質: 行列の関係を持つレイアウトはGrid、一次元の並びはFlexboxを基本にし、兄弟間の間隔はgapで表現する。
- 適用: カード一覧、帳票の列、レスポンシブな領域配置を作るとき
- 避ける: 要素の外側余白や重なりまでgapで表そうとするとき
- 注意: Gridは内容の意味や読み上げ順を変えない。印刷・狭幅・長い日本語で崩れを確認する。
- 互換性: Gridとgapは主要ブラウザで広く利用可能。subgridは対象環境を確認する。
- アクセシビリティ: CSSによる視覚順序変更とDOM順序の不一致を避ける。
- 検証日: 2026-08-27
- 根拠: [MDN CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout), [MDN gap](https://developer.mozilla.org/en-US/docs/Web/CSS/gap)

## css-reduced-motion | 動きを減らす設定を尊重する
- CSS / Accessibility / verified
- 本質: `prefers-reduced-motion: reduce`を使い、利用者OSが動きの抑制を求めているときアニメーションを短縮・停止する。
- 適用: スクロール演出、トランジション、ローディング表現を作るとき
- 避ける: 状態変化まで視認できなくするほど単純に全演出を消すとき
- 注意: 動きを消しても、読み込み中・完了・エラーの状態は別の方法で伝える。
- 互換性: 主要ブラウザで利用可能。OS設定とブラウザ実機で確認する。
- アクセシビリティ: vestibular障害等への配慮として既定で尊重する。
- 検証日: 2026-08-27
- 根拠: [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## html-dialog | モーダルはdialogの状態管理を使う
- HTML / Accessibility / conditional
- 本質: `showModal()`でモーダル、`show()`で非モーダルのdialogを開き、ブラウザのtop layer・inert・Esc操作などを活用できる。
- 適用: 本当に一時的な確認・入力を画面上へ重ねるとき
- 避ける: 常時表示のパネル、複雑なウィザード、要件を満たすフォーカス移動を検証できないとき
- 注意: `open`属性を付けるだけでは非モーダル。必ず閉じる手段、初期フォーカス、`::backdrop`、フォーム検証を確認する。
- 互換性: 現行主要ブラウザで広く利用可能だが、対象環境の互換性を確認する。
- アクセシビリティ: フォーカス管理、キーボード以外の閉じる操作、ラベル付けを実機確認する。
- 検証日: 2026-08-27
- 根拠: [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [WHATWG dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)

## html-image-dimensions | 画像には寸法を持たせる
- HTML / Performance / verified
- 本質: 画像の表示寸法をHTMLで予約すると、読み込み前後のレイアウトシフトを抑えられる。遅延読み込みは初期表示に不要な画像へ限定する。
- 適用: ファーストビュー外の画像や一覧カードを表示するとき。
- 避ける: LCP対象画像を無条件に `loading="lazy"` にするとき。
- 注意: `width` と `height` は実際の比率に合わせる。`loading="lazy"` は全画像への機械的付与ではない。
- 互換性: HTML標準。対象ブラウザの性能差は実測する。
- アクセシビリティ: 意味のある画像には内容を表す `alt`、装飾画像には空 `alt` を付ける。
- 検証日: 2026-08-27
- 関連週次記事: chrome-speed-records
- 関連知識: js-intersection-observer
- 逆リンク: js-intersection-observer
- 根拠: [MDN img](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img), [web.dev CLS](https://web.dev/articles/optimize-cls)

## html-picture | 画像候補をpictureとsrcsetで出し分ける
- HTML / Performance / verified
- 本質: `picture`と`srcset`は、条件に合う画像候補をブラウザへ渡すための仕組み。CSSで隠すだけでは不要な画像取得を防げない。
- 適用: 画面幅や形式に応じて画像を出し分けるとき
- 避ける: 単一画像で十分なのに複雑なアートディレクションを導入するとき
- 注意: sourceだけで完結させず、互換用のimgとaltを残す。寸法と形式の組合せを実機確認する。
- 互換性: HTML標準。`srcset`の選択は端末条件に依存する。
- アクセシビリティ: 画像の意味を変える出し分けではaltの意味を変えない。
- 検証日: 2026-08-27
- 根拠: [MDN picture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/picture), [web.dev Images](https://web.dev/learn/images)

## html-semantic-controls | クリック対象は意味的な要素にする
- HTML / Accessibility / verified
- 本質: ページ遷移はa、操作はbutton、開閉はdetails/dialogなど、ブラウザが意味と標準操作を持つ要素を優先する。
- 適用: クリック・タップ・キーボード操作を受け付けるUIを作るとき
- 避ける: divやpへクリック処理を付けて標準のフォーカス・キーボード操作を再実装するとき
- 注意: form内buttonにはtypeを明示する。ARIAは不足する意味を補うために使い、ネイティブ要素を置き換える目的で乱用しない。
- 互換性: HTML標準。
- アクセシビリティ: Tab移動、Enter/Space、フォーカス可視性、スクリーンリーダー名を確認する。
- 検証日: 2026-08-27
- 根拠: [MDN button](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button), [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)

## js-abort-controller | 非同期処理は取消可能にする
- JavaScript / Networking / verified
- 本質: AbortControllerのsignalをfetchへ渡すと、不要になった通信やタイムアウトを中断できる。
- 適用: 画面遷移、検索語変更、タイムアウトで通信が不要になるとき
- 避ける: 中断とサーバー側処理の取消を同一視するとき
- 注意: AbortErrorを通常エラーと分ける。timeout後の後続処理やUI状態を安全に戻す。
- 互換性: 主要ブラウザで利用可能。
- アクセシビリティ: 長時間待ちを無期限にせず、キャンセルや再試行の状態を伝える。
- 検証日: 2026-08-27
- 根拠: [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController), [WHATWG Fetch abort](https://fetch.spec.whatwg.org/#abortcontroller)

## js-defer-module | スクリプトの実行境界をHTMLで宣言する
- JavaScript / Loading / verified
- 本質: 外部classic scriptはdeferでHTML解析後に順序を保って実行でき、module scriptは既定でdefer相当かつ独自スコープになる。
- 適用: ページのDOMを使う外部スクリプトをheadから読み込むとき
- 避ける: 実行順序を必要としないスクリプトへasyncをdeferの代用として使うとき
- 注意: defer scriptでは通常DOM解析後に実行されるため、DOMContentLoaded wrapperは必要性を確認する。asyncは順序保証がない。
- 互換性: 主要ブラウザで利用可能。
- アクセシビリティ: 起動前でも基本コンテンツと操作説明が破綻しないようにする。
- 検証日: 2026-08-27
- 根拠: [MDN script](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script), [WHATWG script](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)

## js-fetch-response-ok | FetchではHTTP状態を明示確認する
- JavaScript / Networking / verified
- 本質: fetchはネットワーク障害ではrejectするが、404や500ではResponseをresolveする。`response.ok`またはstatusを確認してから本文を読む。
- 適用: APIや外部リソースを取得するとき
- 避ける: 成功・失敗を本文の存在だけで判断するとき
- 注意: JSON解析失敗も別途扱う。CORS、認証、リトライ方針をHTTP状態と分離して記録する。
- 互換性: Fetch APIは主要ブラウザで利用可能。
- アクセシビリティ: 取得失敗を画面へ通知し、再試行可能な状態を残す。
- 検証日: 2026-08-27
- 根拠: [MDN Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), [WHATWG Fetch](https://fetch.spec.whatwg.org/)

## js-intersection-observer | 可視範囲処理はObserverを使う
- JavaScript / Performance / verified
- 本質: IntersectionObserver はスクロールイベントを毎回処理する代わりに、要素の交差状態の変化を通知する。
- 適用: 遅延表示、表示領域への到達、無限スクロールの境界を監視するとき。
- 避ける: ピクセル単位の連続追従や複雑なスクロール位置計算が必要なとき。
- 注意: observer を解除しないまま対象を増やさない。表示済み要素は `unobserve()` して負荷を抑える。
- 互換性: 主要ブラウザで利用可能。
- アクセシビリティ: lazy表示でもキーボード利用者に内容や操作が欠落しないようにする。
- 検証日: 2026-08-27
- 関連週次記事: chrome-speed-records
- 関連知識: html-image-dimensions
- 逆リンク: html-image-dimensions
- 根拠: [MDN Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API), [web.dev IntersectionObserver](https://web.dev/articles/intersectionobserver)

## supply-chain-local-or-cdn | 外部配信は固定と撤退条件まで決める
- Security / Supply chain / conditional
- 本質: CDNかローカル同梱かは速度だけでなく、可用性、変更管理、供給元、SRI、復旧経路で決める。CDNを一律禁止するルールではない。
- 適用: 外部ライブラリやフォントを導入するとき
- 避ける: URLだけを正本にし、版・ハッシュ・代替経路を記録しないとき
- 注意: SRIは改ざん検知の補助であり、信頼する供給元の選択やCSPの代替ではない。
- 互換性: 配信方式・CSP・ブラウザ要件を案件ごとに確認する。
- アクセシビリティ: 外部取得失敗時も主要コンテンツを利用可能にする。
- 検証日: 2026-08-27
- 根拠: [MDN SRI](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity), [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)

