# Installation

## 導入

npm公開後は `npm install @bright203/tadorino-sdk-js` で導入できます。公開前はREADMEのtarball手順を使ってください。SDK以外にTypeDoc、React、Auth0 SDKをインストールする必要はありません。

ES Modules:

```js
import { TadorinoClient, TadorinoError } from '@bright203/tadorino-sdk-js';
```

CommonJS:

```js
const { TadorinoClient, TadorinoError } = require('@bright203/tadorino-sdk-js');
```

TypeScriptは `exports` のimport/require条件に合う型宣言を自動で参照します。NodeNextとViteのBundler解決で検査します。内部ファイルのdeep importは公開APIに含みません。

## クライアントの設定

{@link TadorinoClient} に `baseUrl` と本人の `getAccessToken` を渡します。baseUrlはHTTPSのoriginのみで、`/v1`を付けません。ローカル試験だけ明示したlocalhost・127.0.0.1・[::1]のHTTPを許容します。

既定timeoutは60秒です。操作単位の `timeoutMs` は1〜300000の整数、`signal` はAbortSignalです。期限にはtoken取得と応答本文の読込みも含まれます。自動再試行はありません。

Node.jsは22.12以降の22系と24系を対象とし、ブラウザはFetch、AbortController、ReadableStream、TextEncoder、TextDecoderを備えたChrome・Firefox・Safariの直近2主要版を対象とします。具体的な検証版・未検証範囲は公開時の記録を確認してください。ブラウザ向けpolyfillは自動挿入しません。
