# Machine-to-machine

このガイドはSDK0.1.2のソースに追加した `examples/m2m` を説明します。0.1.0からあるAPIを使う追加例です。Node専用Client Credentials helperとReact/Express例はGitHubソースで提供し、npmパッケージのexportや実行時依存へ追加していません。0.1.0の不変tag・配布物・版別文書も変更しません。SDKの導入とメモサービス側のM2M登録・有効化は別の工程です。

## 所有者と認可

機械は事前登録した固定の所有者であり、本人の代行ログインではありません。Auth0のM2M clientとタドリノの有効な機械登録、メモAPI用audience、許可scopeが必要です。保存は `notes:write`、検索・取得は `notes:read` です。メモ用Access TokenをMCP・管理REST・別の本人のメモに使えません。ブラウザから渡されたclient ID・所有者IDで認可を切り替えません。

token取得時の要求scopeだけで、発行される権限の縮小を保証しません。実開発テナントでは `notes:read` だけを要求しても、Client Grantがread/writeを許可していると両scopeを持つ署名JWTが発行されました。最小権限はAuth0のClient Grantで制限し、APIは実際の署名検証済みtokenのscopeで認可します。providerの `scopes` 指定やブラウザの操作制限を認可境界の代わりにしないでください。

利用アプリは、そのアプリの利用者を認証し、どの操作を機械に実行させてよいかをバックエンドで認可します。SDKはその認証・認可を実装しません。この例のHost・Origin・CSRF対策はlocalhost用入口の保護であり、インターネット利用者のログイン機能ではありません。公開サーバーとして配備する例は対象外です。

## localhostのReactとExpress

ソースルートで依存とSDKを準備します。実Auth0の設定や機械登録は提供者が済ませ、Secretはローカルの無視対象ファイルだけに入れます。

```sh
npm ci
npm run build
cp examples/m2m/.env.example examples/m2m/.env.local
# .env.local をローカルで編集してから:
npm run dev:m2m
```

ブラウザで `http://127.0.0.1:5174` を開きます。Expressは `127.0.0.1:5181` にbindし、Viteは `/api/` だけをそこへ転送します。両ポートが空いている必要があります。バックエンドの起動成功を待ってからフロントエンドを起動し、どちらかが失敗したら両方を閉じます。別のプロセスが持つ機械へ誤って接続する状態で起動を続けません。

設定は `AUTH0_ISSUER`、`AUTH0_CLIENT_ID`、`AUTH0_CLIENT_SECRET`、`AUTH0_AUDIENCE`、`TADORINO_BASE_URL` です。issuerは正確なHTTPS origin、base URLはHTTPSのメモサービスoriginです。明示的なHTTP loopbackはローカル試験のみ許容します。Secret・機械tokenを `VITE_`、Reactコード、localStorage、URL、応答、ログへ入れません。Viteは `.env` ファイルを読み込まない設定です。

ブラウザは同一originのExpressへJSONで要求します。`/api/bootstrap` が返すものはメモリ上のCSRF nonceとモード名だけです。Host、Origin、Fetch Metadata、CSRF、Content-Type、method、正確なルートを検査し、query・GET body・Cookie・Bearer・任意の `x-*` headerを受け付けません。機械token取得の入口はありません。バックエンドを再起動した場合はページも再読込します。

UIは保存・検索・全文取得、取消、同一キーの明示的再送に対応します。保存開始時の内容と `idempotency_key` をページのメモリに保ち、結果不明・取消の後もそのまま再送します。「新しい保存を開始」を選ぶまで本文は固定します。ページを閉じるとその操作情報は消えるため、実アプリでは再起動時の結果不明操作を扱う設計も必要です。

## Node専用provider

`examples/m2m/token-provider.js` を利用アプリのバックエンド側に置いて使います。ブラウザにimportするファイルではありません。次は同じディレクトリへ配置した場合の例です。

```js
import { TadorinoClient } from '@bright203/tadorino-sdk-js';
import { createTokenProvider } from './token-provider.js';

const getAccessToken = createTokenProvider({
  issuer: process.env.AUTH0_ISSUER,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  audience: process.env.AUTH0_AUDIENCE,
  scopes: ['notes:read', 'notes:write'],
});
const client = new TadorinoClient({
  baseUrl: process.env.TADORINO_BASE_URL,
  getAccessToken,
});
const found = await client.searchNotes({ query: '機械' });
```

一つのproviderはissuer・client・audience・scopeの固定設定に閉じます。異なる設定は別インスタンスにし、可変の共通token変数で本人や機械を切り替えません。キャッシュはそのインスタンスのメモリだけです。Auth0の正確なHTTPS `/oauth/token` へ固定したPOSTを行い、redirect・Cookieを使いません。応答のbyte上限は64KiB、既定timeoutは10秒（設定可能範囲1〜60000ms）です。token、Bearer型、整数の `expires_in` を検査し、期限の安全余裕を10%・上限30秒だけ取ります。HTTP通信時間も有効期間へ含めます。

同時取得は一つにまとめます。一つのSDK操作を取り消すと、その操作だけが待つのをやめます。他の待機者の発行要求は壊しません。全員が取り消した場合も発行は有限のprovider timeoutまで続き、成功時は同じ機械の次の操作でcacheを利用できます。失敗はcacheせず、自動retryは0回です。Refresh Token・永続保存・生のOAuthエラー転送は行いません。

今回確認した開発テナントのFree枠はM2M token月1000件です。有効期間900秒からcacheの安全余裕30秒を引くと実効870秒であり、常時要求がある1 providerでも31日で約3079回（約3100回）の発行となり枠を超えます。必要な操作時だけ取得しcacheを使う前提で、複数backend・再起動による追加発行も含めて利用量を設計します。共有APIのtoken寿命や契約の有料化は自動変更しません。

Secretを更新したらproviderを作り直すかアプリを再起動します。Secret更新だけでは発行済みAccess Tokenは失効しません。サービス側の機械停止・client解除は別の認可処理です。停止・未登録はメモRESTで401、scope不足は403となります。SDKとこの例は401を受けて自動再送しません。

## エラーと検証

Auth0取得の一時障害（network・timeout・429・5xx）はローカル入口で安全な503、設定・応答不正等は502へ変換します。メモRESTの拒否はHTTP状態を保ち、正常状態の壊れたbodyは502、SDKの期限超過は504です。応答にSecret・token・OAuth body・生例外を含めません。保存結果が不明なら同じキー・同じ内容を利用者の指示で再送します。

`npm run check` はproviderのcache・期限・並行・取消・設定分離・上限・失敗、ローカル入口の保護・起動失敗・3操作・再送を検査します。同じcandidate tarballと公開済みnpm0.1.0の両方で例を新規installします。`npm run browser:check` は本人例に加えて機械例をChromium／Firefox／WebKitの合成HTTP fixtureで検査します。これは実Auth0や実PostgreSQLを確認した証拠ではありません。

親プロジェクトでの実JWT／一時PostgreSQLを経由する画面検証と、実Auth0 Client Credentials／公開サービスの検証は別に記録します。本人OTP・本人sessionの例はそのまま残しています。公開npm・Pagesの更新も独立した工程です。

2026-10-15には、実サービスで本人の新しいメールOTP＋PKCE、メモRESTの保存・同一再送・検索・全文取得、MCPでの同じメモの検索・全文一致、メモ用tokenの管理REST拒否も回帰確認しました。具体的な検証範囲はCompatibilityガイド、配布状態はnpm・GitHub Release・版別Pagesで確認します。Windowsと実Safariの確認とは区別します。
