# Authentication

SDKの `getAccessToken({ signal })` は各操作で一度呼ばれます。Access Tokenの発行、キャッシュ、refresh、OTP、callback、再ログインは利用アプリが担当します。SDKはtokenを保存せず、401で自動更新・再送しません。

取得関数は、本人sessionまたは事前登録済みの機械主体のどちらか一つへ固定します。本人のメモと機械のメモは別の所有者です。0.1.2のソースには `examples/m2m` とMachine-to-machineガイドを追加しています。この例は0.1.0からある `getAccessToken` だけを使い、SDKの公開APIは変わりません。Node専用helperはGitHubソースの例で、npmパッケージへ含めていません。

## ブラウザ

[Auth0 React SDK](https://auth0.com/docs/libraries/auth0-react)の `Auth0Provider` と `getAccessTokenSilently` を使うReact例を用意しています。SPAはAuthorization Code＋PKCE、公開Client ID、HTTPS公開メモRESTのaudienceを設定します。Client Secret・Access Token・Refresh Tokenを `VITE_` の環境変数へ入れないでください。Viteの変数は配布JavaScriptへ入ります。

Auth0設定にはSPA用clientの利用許可、正確なAllowed Callback URLs、Allowed Logout URLs、Allowed Web Origins、Refresh Token rotation等をアプリの更新方式に合わせて登録します。メモREST用CORSにも正確なアプリoriginが必要です。これらの外部設定・実OTP・公開REST接続は合成テストと別に検証します。
タドリノのメールOTP接続は`email`です。React例はこのConnectionを指定し、Refresh Token rotationとmemory cacheを使います。Connection名を変える場合は`VITE_AUTH0_CONNECTION`で明示し、サービスの利用許可と同じユーザー識別になることを確認してください。

メモ用Access Tokenはサービスのissuerと共通MCP_RESOURCE_URL audienceを使用します。保存に `notes:write`、検索・取得に `notes:read` を要求します。ID TokenやAuth0管理tokenを代用しません。

## Node.jsとExpress

本人sessionへ固定したtoken取得関数をSDKへ渡します。sessionの所有者とtokenのsubjectをアプリの認証処理で結び付け、refresh後も同じ本人を維持します。sessionのSecret・Refresh Tokenはサーバー側で保護します。

複数ユーザーのtokenを共有変数へ置き、要求のたびに書き換えて同じSDKから参照しないでください。Express例は要求ごとにsessionへ閉じたクライアントを作ります。Cookieによるアプリの認証は自分のバックエンドが担当し、SDKのFetchは `credentials: "omit"` です。

{@link TadorinoClient} はサーバーの認可を代替しません。issuer・subject・audience・scope・メモ所有者の最終判定はタドリノのサーバーで行います。

## 機械主体

機械のClient Secretはバックエンドだけに置き、Auth0のHTTPS `/oauth/token` でメモ用Access Tokenを取得します。Refresh Tokenは使わず、期限前の次の操作でClient Credentialsによって新しく取得します。機械のAccess TokenはMCP・管理REST・本人のメモの操作には使えません。

固定の機械主体を複数ジョブから使う場合、その同じ設定のtoken providerを共有できます。ブラウザ利用者を機械として認証する仕組みではありません。利用アプリのバックエンドが利用者と許可操作を認可し、機械の権限を適切な範囲へ閉じ込める責任を持ちます。Client ID、機械ID、所有者を任意のブラウザ入力で切り替えないでください。
