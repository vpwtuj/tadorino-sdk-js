# Tadorino JavaScript SDK

`@bright203/tadorino-sdk-js` は、ブラウザとNode.jsからタドリノのメモを保存・検索・全文取得するJavaScript SDKです。ES ModulesとCommonJS、TypeScript型宣言をひとつのパッケージで提供します。

## 配布とサービス利用

このソースのSDKバージョンは **0.1.2** です。npmの配布名は`@bright203/tadorino-sdk-js`、文書は版ごとに管理します。タドリノの利用にはサービス側の利用許可とAccess Tokenが必要です。本人sessionと登録済みの機械主体は、それぞれ別のメモ所有者として扱います。配布状態は[npm](https://www.npmjs.com/package/@bright203/tadorino-sdk-js)、接続の実績は対応環境ガイドで確認してください。

## インストール

導入コマンド:

```sh
npm install @bright203/tadorino-sdk-js
```

ローカルの配布物を検証する場合は、生成したtarballを利用アプリへインストールします。

```sh
npm ci
npm run build
npm pack
# 利用アプリのディレクトリで:
npm install /absolute/path/bright203-tadorino-sdk-js-0.1.2.tgz
```

## 保存・検索・取得

以下は、[配布物の検証](#開発と検証)で同じtarballから実行する例です。`TADORINO_ACCESS_TOKEN`は利用アプリが本人のAccess Tokenを安全に取得する部分の代替で、SDKがログインや更新を担当するものではありません。実アプリでは本人sessionまたはAuth0 SPA SDKから取得してください。

<!-- executable: memo-example -->
```js
import { TadorinoClient } from '@bright203/tadorino-sdk-js';

const client = new TadorinoClient({
  baseUrl: process.env.TADORINO_BASE_URL,
  getAccessToken: () => process.env.TADORINO_ACCESS_TOKEN,
});
const input = {
  title: 'SDKの確認',
  body: '## メモ\n原文と出典を保存する。',
  sources: [{ title: '合成資料', url: 'https://example.com/reference' }],
  idempotency_key: '22222222-2222-4222-8222-222222222222',
};
const saved = await client.createNote(input);
const found = await client.searchNotes({ query: 'SDK 確認', limit: 10 });
const note = await client.getNote(saved.note_id);
export { saved, found, note };
```

固定UUIDはこの合成例専用です。実アプリでは保存操作ごとに一度だけ `crypto.randomUUID()` で生成し、内容とともに保持します。結果不明の再送では、同じキー・同じ内容を使ってください。

CommonJSでも同じAPIを使えます。

```js
const { TadorinoClient, TadorinoError } = require('@bright203/tadorino-sdk-js');
```

## 利用例と文書

- [導入ガイド](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Installation.md): ESM、CommonJS、型宣言、対応環境。
- [認証ガイド](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Authentication.md): Auth0 SPA、本人session、トークン更新。
- [保存の再送とエラー](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Errors-and-retries.md): 取消、期限、結果不明時の再送。
- [React＋Vite＋TypeScript](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/React-Vite.md): ブラウザからメモRESTへ接続する例。
- [対応環境と検証状況](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Compatibility.md): 実際に確認した版と外部検証の範囲。
- [公開手順](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Publishing.md): 初回CLI公開、版を固定した文書公開、以後のtrusted publishing。
- [Express](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Express.md): アプリの本人sessionへSDKを組み込む例。

APIリファレンスは `src/index.js` のJavaScript＋JSDocからTypeDocで生成します。内部helper、MCP、管理RESTは公開SDKの入口に含みません。

### 機械主体の利用例

`examples/m2m` にReact＋Vite＋TypeScript → localhost Express → SDK → メモRESTの例を追加しています。Node専用のClient Credentials取得helperをバックエンドへ置き、ブラウザへClient Secretや機械のAccess Tokenを返しません。既存の本人OTP例・本人session例も維持しています。

この例は0.1.0からある `getAccessToken` と3操作だけで動作します。Node専用helperとReact/Express例はGitHubのソースで提供し、npmパッケージのexportや実行時依存へ追加していません。[機械主体ガイド](https://github.com/vpwtuj/tadorino-sdk-js/blob/v0.1.2/docs/guides/Machine-to-machine.md)で設定・制約を確認できます。メモサービス側のM2M登録・有効化が別途必要です。

## 開発と検証

Node.js 22.12以降の22系と24系を対象とします。

```sh
npm ci
npm run check
```

`check` はソースの型検査、ESM/CJS・型宣言の生成、TypeDocの説明・参照検査、Nodeテスト、React build、Expressの並行sessionと機械provider・安全なローカル入口、同じtarballを新規アプリへinstallした検証を実行します。機械例は公開npm0.1.0を新規installした互換検査も実行します。掲載例は合成HTTP fixtureで実行し、実Auth0・実DB・実サービス接続の成功として扱いません。

```sh
npm run docs:build
npm run docs:check
npm run dev:vite
node scripts/fixture-server.mjs
# 独立したブラウザ検査（ループバックの5173/5174/5181/4010/4011を使用）:
npx playwright install chromium firefox webkit
npm run browser:check
```

生成HTMLは `site/`、配布コード・型宣言は `dist/` です。生成物を手で修正せず、Gitへ含めません。GitHub Pagesではリリースtagとnpm versionが一致した文書を、バージョン別に公開します。公開workflowは実際にnpmへ出ている版を確認してから配置します。

SDKに実行時の外部依存はありません。React・Auth0・Express・文書生成ツールは例または開発用です。テストで確認した具体的なNode/ブラウザの版は対応環境ガイド・CI・公開時の検証記録に残します。Chromium/Firefox/WebKitの自動検査は実Safariと直近2主要版すべての確認を代替しません。

## パッケージと文書の公開

初回は検証済みtarballを所有者の2FA付きnpm CLIから公開し、次の新しい版を公開する直前にnpmのパッケージ設定で `vpwtuj/tadorino-sdk-js` の `release.yml` をtrusted publisherとして登録します。長期の `NPM_TOKEN` は使いません。

初回版の文書は、公開済みnpm版と一致する `v0.1.0` タグを指定し、SDK release workflowの手動実行から配置できます。この操作は文書だけを生成・配置し、同じnpm版を再公開しません。以後は新しい版のGitHub Releaseから、検証・trusted publishing・文書公開を順に行います。詳しくは公開手順を参照してください。

## ライセンス

MIT。Copyright (c) 2026 BRIGHT203 Co., ltd.
