# React Vite TypeScript

`examples/vite/` はReact＋Vite＋TypeScriptのブラウザアプリです。メモ保存・検索・全文取得と取消を、同じ {@link TadorinoClient} で実行します。本文は文字列として表示し、HTMLとして挿入しません。

## 実Auth0への接続

SDKリポジトリで `npm ci && npm run build` を実行し、`examples/vite/.env.example` を `.env.local` へコピーして公開設定を入れます。

```text
VITE_TADORINO_BASE_URL=https://notes.example.com
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-public-spa-client-id
VITE_AUTH0_AUDIENCE=https://notes.example.com/mcp
VITE_DEMO_MODE=false
```

これは置換する設定例です。公開メモREST・Auth0 SPAの設定済み値へ置き換え、callback・logout・web originとCORSへ `http://127.0.0.1:5173` を正確に登録します。`npm run dev:vite` で起動します。

ログインのコード入力・同意は利用者が行います。SPAのClient Secretはありません。トークンはAuth0 SDKのmemory cacheを使用し、SDKのエラーに認証例外を転載しません。

## 合成データだけのローカル確認

別terminalで `node scripts/fixture-server.mjs` を起動し、例の `.env.local` を次のように設定します。

```text
VITE_TADORINO_BASE_URL=http://127.0.0.1:4010
VITE_DEMO_MODE=true
```

`npm run dev:vite` を実行します。画面には合成データ専用の表示が出ます。このモードはOTP・Auth0・PostgreSQL・公開REST接続を検証しません。合成token以外はfixtureへ送らないでください。

CIの配布物検査は新しいディレクトリへ同じSDK tarballとこの例をinstallしてbuildします。ブラウザ検査は合成fixtureへ3操作と同一キーの再送を実行します。実認証の成功として報告しません。
