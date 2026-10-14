# Authentication

SDKの `getAccessToken({ signal })` は各操作で一度呼ばれます。Access Tokenの発行、キャッシュ、refresh、OTP、callback、再ログインは利用アプリが担当します。SDKはtokenを保存せず、401で自動更新・再送しません。

## ブラウザ

[Auth0 React SDK](https://auth0.com/docs/libraries/auth0-react)の `Auth0Provider` と `getAccessTokenSilently` を使うReact例を用意しています。SPAはAuthorization Code＋PKCE、公開Client ID、HTTPS公開メモRESTのaudienceを設定します。Client Secret・Access Token・Refresh Tokenを `VITE_` の環境変数へ入れないでください。Viteの変数は配布JavaScriptへ入ります。

Auth0設定にはSPA用clientの利用許可、正確なAllowed Callback URLs、Allowed Logout URLs、Allowed Web Origins、Refresh Token rotation等をアプリの更新方式に合わせて登録します。メモREST用CORSにも正確なアプリoriginが必要です。これらの外部設定・実OTP・公開REST接続は合成テストと別に検証します。

メモ用Access Tokenはサービスのissuerと共通MCP_RESOURCE_URL audienceを使用します。保存に `notes:write`、検索・取得に `notes:read` を要求します。ID TokenやAuth0管理tokenを代用しません。

## Node.jsとExpress

本人sessionへ固定したtoken取得関数をSDKへ渡します。sessionの所有者とtokenのsubjectをアプリの認証処理で結び付け、refresh後も同じ本人を維持します。sessionのSecret・Refresh Tokenはサーバー側で保護します。

複数ユーザーのtokenを共有変数へ置き、要求のたびに書き換えて同じSDKから参照しないでください。Express例は要求ごとにsessionへ閉じたクライアントを作ります。Cookieによるアプリの認証は自分のバックエンドが担当し、SDKのFetchは `credentials: "omit"` です。

{@link TadorinoClient} はサーバーの認可を代替しません。issuer・subject・audience・scope・メモ所有者の最終判定はタドリノのサーバーで行います。
