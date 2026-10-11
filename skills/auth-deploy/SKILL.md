---
name: auth-deploy
description: Use when the user says 「認証デプロイ」 or requests a Firebase Google-authenticated private portal, auth-gated Cloudflare Worker, or private-site deployment with login.
---

# 認証デプロイ

## 目的

Firebase Authentication と Cloudflare Worker を組み合わせた、私用・検証用ポータルの認証付きデプロイを扱う。ログイン画面を表示するだけでは不十分で、未認証の HTML、JSON、静的アセット、エラー経路まで Worker 側で拒否できることを成果条件とする。

## 適用範囲

- Firebase Googleログインを使う私用ポータル、情報ハブ、TechNews配下のコレクション
- Firebase IDトークンを Worker 入口で検証し、HttpOnly セッションを発行する構成
- Cloudflare Workers の静的アセットを認証ゲート越しに配信する構成

公開サイトの通常デプロイ、Firebaseサービスアカウント管理、公開を伴う最終判断にはこのスキルだけで許可を与えない。**本番公開・カスタムドメイン接続・既存公開サイトへのルート変更は、直前にユーザーの明示的な承認を得る。**

## 実行契約

### 1. 先に境界と作業対象を確定する

- Gitルート、対象Worker名、FirebaseプロジェクトID、デプロイ先URLを確認する。
- 既存の公開Workerや本番ルートを変更せず、最初は別名の非本番Workerで検証する。
- 未コミット変更を確認し、認証デプロイと無関係な変更をコミット・上書き・削除しない。
- Firebaseのクライアント設定は公開Web設定であっても、秘密鍵やサービスアカウントJSONとは分離する。実値をSKILL、Git、ログへ書かない。

### 2. 認証実装を確認する

- Googleプロバイダが有効で、実際のホスト名が Firebase Authentication の Authorized domains に登録済みか確認する。
- ブラウザ側のログイン成功だけで完了扱いにせず、取得したIDトークンをサーバー側で検証する。
- Workerでは少なくとも Firebase プロジェクトに対するIDトークンの署名・期限・発行元と、トークン由来のユーザー存在を検証し、検証失敗は安全に拒否する。
- 特定ユーザーに限定する場合は、Firebaseの `localId`（UID）を `FIREBASE_ALLOWED_UIDS` のカンマ区切り許可リストとWorker側で照合する。許可リスト未設定は fail-closed とし、メールアドレスをブラウザ側だけで判定しない。
- セッションCookieは `HttpOnly`、`Secure`、`SameSite=Lax`、適切な有効期限を持たせる。ログアウト時にはサーバー側Cookieも失効させる。

### 3. Workerの静的アセット境界を確認する

Cloudflare Workers の静的アセットは、Workerが実行される設定でなければ認証処理を迂回し得る。構成を確認する。

- `run_worker_first = true` を設定する。
- `.assetsignore` で `.git`、依存物、秘密設定、原本画像などを配信対象から除外する。
- 認証ページと必要な公開クライアント設定だけを公開パスにし、ポータル、ルートHTML、JSON、画像、JS、CSSは未認証で `401` にする。
- 404、500、リダイレクト、キャッシュ、OGPやログにも保護対象の内容・トークン・内部URLを露出させない。

### 4. 検証順序

本番へ進む前に、次の順で非本番URLを確認する。

1. 未認証でログインページが `200`、Googleログイン操作が可能。
2. 未認証で `/portal/index.html`、ルート記事HTML、JSON、静的アセットが `401`。
3. 不正・期限切れ・欠落トークンが `401` で、保護本文を返さない。
4. Googleログイン後、IDトークンをセッション交換し、保護ページと必要なアセットが表示される。
5. ログアウト後、同じ保護URLが再び `401`。
6. ブラウザの開発者ツール、レスポンスヘッダー、Workerログに秘密やトークンが残っていない。

ログインボタンが見えること、画面遷移できること、URLが404で隠れていることは、認証境界の検証結果とはみなさない。

## デプロイ操作の扱い

- Firebase APIキーなどの秘密は `wrangler secret put FIREBASE_API_KEY` のような秘密ストアへ渡し、コマンド出力やコミットに残さない。
- ビルド、テスト、ローカルブラウザ確認を先に行い、非本番WorkerへデプロイしてHTTP/E2Eを再確認する。
- 本番デプロイは、検証結果・対象URL・変更範囲を報告してから明示承認を待つ。
- 失敗時は無限再試行せず、失敗段階（認証、設定、アセット、デプロイ、E2E）と安全な戻し方を記録する。

## 完了報告

次を簡潔に報告する。

- 略称: `認証デプロイ`
- Firebaseプロジェクト、Worker名、デプロイURL、バージョン
- 未認証・認証済み・ログアウト後のHTTP/E2E結果
- 実行したテストと未実施項目
- 非本番か本番か、本番承認の有無
- 既知の制約（例: Firebase側のユーザー単位権限制御や本番カスタムドメインは別途確認）

## よくある誤判断

| 誤判断 | 実際の確認 |
|---|---|
| Googleログインボタンが出たので安全 | Worker入口でIDトークンを検証する |
| ログイン後の画面だけ確認した | 未認証の直URL、JSON、画像、JS、CSSも叩く |
| Workerで隠したのでFirebase側は不要 | データを持つFirebase側のルールと権限も確認する |
| 404やリダイレクトだから漏れていない | レスポンス本文、ステータス、キャッシュを確認する |
| テスト用URLで成功したので本番も同じ | ホスト名、Authorized domains、ルート、秘密設定を再確認する |

## 参照

- Firebase IDトークン検証: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firebase Googleログイン: https://firebase.google.com/docs/auth/web/google-signin
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
