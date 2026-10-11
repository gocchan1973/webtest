# Web実装知識台帳

この記事群は、Zennの「令和のHTML / CSS / JavaScriptの書き方50選」を発見入口にし、仕様確認済みの判断ルールへ蒸留したもの。`status` が `verified` の項目だけを採用判断の根拠として扱う。

## html-picture | 画像候補をpictureとsrcsetで出し分ける
- topic: HTML / Performance
- status: verified
- essence: `picture`と`srcset`は、条件に合う画像候補をブラウザへ渡すための仕組み。CSSで隠すだけでは不要な画像取得を防げない。
- use_when: 画面幅や形式に応じて画像を出し分けるとき
- avoid_when: 単一画像で十分なのに複雑なアートディレクションを導入するとき
- pitfalls: sourceだけで完結させず、互換用のimgとaltを残す。寸法と形式の組合せを実機確認する。
- compatibility: HTML標準。`srcset`の選択は端末条件に依存する。
- accessibility: 画像の意味を変える出し分けではaltの意味を変えない。
- sources: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/picture|MDN picture, https://web.dev/learn/images|web.dev Images
- verified_at: 2026-08-27

## html-dialog | モーダルはdialogの状態管理を使う
- topic: HTML / Accessibility
- status: conditional
- essence: `showModal()`でモーダル、`show()`で非モーダルのdialogを開き、ブラウザのtop layer・inert・Esc操作などを活用できる。
- use_when: 本当に一時的な確認・入力を画面上へ重ねるとき
- avoid_when: 常時表示のパネル、複雑なウィザード、要件を満たすフォーカス移動を検証できないとき
- pitfalls: `open`属性を付けるだけでは非モーダル。必ず閉じる手段、初期フォーカス、`::backdrop`、フォーム検証を確認する。
- compatibility: 現行主要ブラウザで広く利用可能だが、対象環境の互換性を確認する。
- accessibility: フォーカス管理、キーボード以外の閉じる操作、ラベル付けを実機確認する。
- sources: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog|MDN dialog, https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element|WHATWG dialog
- verified_at: 2026-08-27

## html-semantic-controls | クリック対象は意味的な要素にする
- topic: HTML / Accessibility
- status: verified
- essence: ページ遷移はa、操作はbutton、開閉はdetails/dialogなど、ブラウザが意味と標準操作を持つ要素を優先する。
- use_when: クリック・タップ・キーボード操作を受け付けるUIを作るとき
- avoid_when: divやpへクリック処理を付けて標準のフォーカス・キーボード操作を再実装するとき
- pitfalls: form内buttonにはtypeを明示する。ARIAは不足する意味を補うために使い、ネイティブ要素を置き換える目的で乱用しない。
- compatibility: HTML標準。
- accessibility: Tab移動、Enter/Space、フォーカス可視性、スクリーンリーダー名を確認する。
- sources: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button|MDN button, https://www.w3.org/WAI/ARIA/apg/|WAI-ARIA APG
- verified_at: 2026-08-27

## css-grid-gap | 二次元配置はGrid、間隔はgap
- topic: CSS / Layout
- status: verified
- essence: 行列の関係を持つレイアウトはGrid、一次元の並びはFlexboxを基本にし、兄弟間の間隔はgapで表現する。
- use_when: カード一覧、帳票の列、レスポンシブな領域配置を作るとき
- avoid_when: 要素の外側余白や重なりまでgapで表そうとするとき
- pitfalls: Gridは内容の意味や読み上げ順を変えない。印刷・狭幅・長い日本語で崩れを確認する。
- compatibility: Gridとgapは主要ブラウザで広く利用可能。subgridは対象環境を確認する。
- accessibility: CSSによる視覚順序変更とDOM順序の不一致を避ける。
- sources: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout|MDN CSS Grid, https://developer.mozilla.org/en-US/docs/Web/CSS/gap|MDN gap
- verified_at: 2026-08-27

## css-reduced-motion | 動きを減らす設定を尊重する
- topic: CSS / Accessibility
- status: verified
- essence: `prefers-reduced-motion: reduce`を使い、利用者OSが動きの抑制を求めているときアニメーションを短縮・停止する。
- use_when: スクロール演出、トランジション、ローディング表現を作るとき
- avoid_when: 状態変化まで視認できなくするほど単純に全演出を消すとき
- pitfalls: 動きを消しても、読み込み中・完了・エラーの状態は別の方法で伝える。
- compatibility: 主要ブラウザで利用可能。OS設定とブラウザ実機で確認する。
- accessibility: vestibular障害等への配慮として既定で尊重する。
- sources: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion|MDN prefers-reduced-motion, https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html|WCAG animation
- verified_at: 2026-08-27

## js-defer-module | スクリプトの実行境界をHTMLで宣言する
- topic: JavaScript / Loading
- status: verified
- essence: 外部classic scriptはdeferでHTML解析後に順序を保って実行でき、module scriptは既定でdefer相当かつ独自スコープになる。
- use_when: ページのDOMを使う外部スクリプトをheadから読み込むとき
- avoid_when: 実行順序を必要としないスクリプトへasyncをdeferの代用として使うとき
- pitfalls: defer scriptでは通常DOM解析後に実行されるため、DOMContentLoaded wrapperは必要性を確認する。asyncは順序保証がない。
- compatibility: 主要ブラウザで利用可能。
- accessibility: 起動前でも基本コンテンツと操作説明が破綻しないようにする。
- sources: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script|MDN script, https://html.spec.whatwg.org/multipage/scripting.html#the-script-element|WHATWG script
- verified_at: 2026-08-27

## js-fetch-response-ok | FetchではHTTP状態を明示確認する
- topic: JavaScript / Networking
- status: verified
- essence: fetchはネットワーク障害ではrejectするが、404や500ではResponseをresolveする。`response.ok`またはstatusを確認してから本文を読む。
- use_when: APIや外部リソースを取得するとき
- avoid_when: 成功・失敗を本文の存在だけで判断するとき
- pitfalls: JSON解析失敗も別途扱う。CORS、認証、リトライ方針をHTTP状態と分離して記録する。
- compatibility: Fetch APIは主要ブラウザで利用可能。
- accessibility: 取得失敗を画面へ通知し、再試行可能な状態を残す。
- sources: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch|MDN Using Fetch, https://fetch.spec.whatwg.org/|WHATWG Fetch
- verified_at: 2026-08-27

## js-abort-controller | 非同期処理は取消可能にする
- topic: JavaScript / Networking
- status: verified
- essence: AbortControllerのsignalをfetchへ渡すと、不要になった通信やタイムアウトを中断できる。
- use_when: 画面遷移、検索語変更、タイムアウトで通信が不要になるとき
- avoid_when: 中断とサーバー側処理の取消を同一視するとき
- pitfalls: AbortErrorを通常エラーと分ける。timeout後の後続処理やUI状態を安全に戻す。
- compatibility: 主要ブラウザで利用可能。
- accessibility: 長時間待ちを無期限にせず、キャンセルや再試行の状態を伝える。
- sources: https://developer.mozilla.org/en-US/docs/Web/API/AbortController|MDN AbortController, https://fetch.spec.whatwg.org/#abortcontroller|WHATWG Fetch abort
- verified_at: 2026-08-27

## supply-chain-local-or-cdn | 外部配信は固定と撤退条件まで決める
- topic: Security / Supply chain
- status: conditional
- essence: CDNかローカル同梱かは速度だけでなく、可用性、変更管理、供給元、SRI、復旧経路で決める。CDNを一律禁止するルールではない。
- use_when: 外部ライブラリやフォントを導入するとき
- avoid_when: URLだけを正本にし、版・ハッシュ・代替経路を記録しないとき
- pitfalls: SRIは改ざん検知の補助であり、信頼する供給元の選択やCSPの代替ではない。
- compatibility: 配信方式・CSP・ブラウザ要件を案件ごとに確認する。
- accessibility: 外部取得失敗時も主要コンテンツを利用可能にする。
- sources: https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity|MDN SRI, https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP|MDN CSP
- verified_at: 2026-08-27
