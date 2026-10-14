# Express

`examples/express/app.js` は利用アプリの本人sessionへ {@link TadorinoClient} を組み込む関数です。固定の共通tokenを全ユーザーへ使わず、各要求のsessionへ閉じたtoken取得関数を渡します。

## アプリへの組込み

次はアプリ固有の認証実装を示す疑似コードです。`sessions` はSDKのexportではありません。

```js
import { createApp } from './app.js';

const app = createApp({
  baseUrl: 'https://notes.example.com',
  resolveSession: async req => {
    const session = await sessions.requireAuthenticated(req);
    return {
      userId: session.subject,
      getAccessToken: ({ signal }) => session.getMemoAccessToken({ signal }),
    };
  },
});
app.listen(3000, '127.0.0.1');
```

`resolveSession` では署名検証済みのsessionから本人を確定します。要求のquery・header・bodyで渡された任意のtokenやuser IDを認証済みとして扱わないでください。Cookie sessionを使用するアプリにはCSRF対策とCookie保護をアプリ側で追加します。SDKにはsessionサーバーやログイン画面を含めません。

アプリのルートは `POST /api/notes`、`POST /api/notes/search`、`GET /api/notes/:noteId` です。アプリのsessionを経由してメモRESTの対応操作を呼び出します。期限・取消をSDKへ伝え、返すエラーは安全な分類とcodeに限定します。

`example.test.js` の `x-test-session` は合成試験専用です。この試験実装を認証ミドルウェアとして公開しないでください。テストでは二人の要求を並行実行し、本人tokenが入れ替わらないことと3操作を検査します。
