# メモの編集・履歴・ファイル入出力

このガイドはSDK 0.2.0で追加するメソッドを説明します。0.1.2には含まれません。サービス側のライフサイクル機能と利用許可が必要で、SDKの導入だけで権限は増えません。公開候補を試す場合はREADMEのtarball手順を使い、公開済み版はnpmの配布情報で確認します。

## 操作と権限

| 操作 | メソッド | 必要なscope |
| --- | --- | --- |
| 一覧・検索・取得 | `listNotes`, `searchNotes`, `getNote`, `getTrashedNote` | `notes:read` |
| 履歴 | `listNoteVersions`, `getNoteVersion`, `listTrashedNoteVersions`, `getTrashedNoteVersion` | `notes:read` |
| 編集・内容復元 | `updateNote`, `restoreNoteVersion` | `notes:update` |
| アーカイブ・ゴミ箱・復元 | `archiveNote`, `unarchiveNote`, `trashNote`, `restoreNote` | `notes:organize` |
| ZIP出力 | `exportNotes` | `notes:export` |
| ZIP取込・状態・取消 | `importNotes`, `getNoteImport`, `cancelNoteImport` | `notes:import` |
| 完全削除・状態 | `purgeNote`, `getNotePurge` | `notes:purge` |

scopeに加えて、所有者とアプリのClient IDの組に対する現在の許可が必要です。本人と機械は別のメモ所有者です。登録者であることだけでは機械メモを本人として操作できません。Client Secretと機械tokenはバックエンドだけに置きます。

## 編集と状態

```js
const current = await client.getNote(noteId);
if (current.revision === undefined) throw new Error('Server lifecycle support is required.');
const pending = {
  note_id: current.note_id,
  expected_revision: current.revision,
  idempotency_key: crypto.randomUUID(),
  body: '## 更新した原文\n空白やUnicodeもそのまま保存します。\n',
};
const receipt = await client.updateNote(pending);
```

`pending`は最初の送信前に保持します。通信断などで結果が不明な場合は、同じ入力とキーを利用者の指示で再送します。SDKは自動再送しません。`revision_conflict`の場合は現在のメモを取り直し、利用者が変更を確認してから新しい操作を作ります。古い編集を最新revisionへ自動的に当てはめません。

省略した項目は維持し、`sources: []`は出典を消します。`null`と未知の項目は拒否します。内容復元は`restoreNoteVersion({ ...mutation, version: 1 })`です。過去版を上書きせず、新しい内容版を追加します。状態操作も同じ`note_id, expected_revision, idempotency_key`を受けます。ゴミ箱のメモは先に`restoreNote`で元の通常／アーカイブ状態へ戻してから編集します。

## 一覧と履歴

```js
let cursor;
do {
  const page = await client.listNotes({ state: 'archived', limit: 20, ...(cursor ? { cursor } : {}) });
  for (const item of page.items) console.log(item.note_id);
  cursor = page.next_cursor;
} while (cursor);

const history = await client.listNoteVersions({ note_id: noteId, limit: 10 });
const original = await client.getNoteVersion({ note_id: noteId, version: 1 });
```

通常の検索はactiveだけが対象です。`active_and_archived`または`trashed`を明示できます。cursorは同じ条件・同じ所有者の続きにだけ使います。`invalid_cursor`の場合は先頭から確認します。通常の取得からゴミ箱へ暗黙に切り替わることはありません。ゴミ箱の本文・履歴は`getTrashedNote`と`listTrashedNoteVersions`、`getTrashedNoteVersion`で明示します。

## ZIP出力

```js
const exported = await client.exportNotes({ include_history: true });
await exported.stream.pipeTo(destination);
// EOFを読み、destinationのcloseが完了した後にだけ、保存完了を表示します。
```

`destination`はアプリが利用者に選んでもらった`WritableStream<Uint8Array>`です。ブラウザにはストリーミングのファイル保存に未対応のものがあります。その場合も無制限bufferへ切り替えず、80 MiB上限以内のdownload方式をアプリで選びます。SDKはZIPを展開しません。標準は通常＋アーカイブの最新版、履歴とゴミ箱は指定時だけ含みます。

`exportNotes`のPromiseが返った時点ではHTTP headerを受け取っただけです。120秒の既定期限は、その後のZIP読取中や放置中も継続します。実際に受け取ったbyte数が80 MiBを超えると`invalid_response`で取消します。途中切断・取消・出力先のエラーを成功として扱わず、部分ファイルを保存完了と表示しません。

React TypeScript例の`examples/vite/src/lifecycle.ts`は、期限・取消を保ったまま出力先へ接続するhelperを提供します。Express例の`examples/express/archive-files.js`は、新しい0600のファイルへ書き、EOF後にsync・closeして完了します。既存ファイルを上書きせず、失敗時に自分が作成した部分ファイルだけを除去します。

## ZIPから新しいコピーを作る

```js
const pendingImport = { archive: selectedFile, idempotency_key: crypto.randomUUID() };
const imported = await client.importNotes(pendingImport);
// 結果が不明なら、同じFileと同じkeyを保持して明示的に再送します。
```

`selectedFile`は`File`または`Blob`、`Uint8Array`、`ReadableStream<Uint8Array>`です。File/Blobはブラウザ間の互換性を取りやすい選択です。stream送信を扱えないFetchでは`input`で失敗し、SDKが全内容を無制限にbufferすることはありません。Nodeのstream例は毎回同じ変更していないファイルを開き直します。消費済みstreamを再送に使えません。

SDK内部で準備POSTとZIPのPUTを順に実行し、同じtokenと一つの期限を使います。準備で既にcommittedだった場合もPUTし、サーバーに内容の一致を確認させます。SDKはZIPの解凍や改変をしません。既存メモの上書きではなく新IDのコピーになり、含まれる履歴・出典・状態・由来を引き継ぎます。

import IDが分かる場合は`getNoteImport(importId)`で状態を照会できます。未確定の一時資源は`cancelNoteImport(importId)`で取り消します。確定と通信断が重なる可能性があるため、timeoutを「未取込」と断定しません。過去importの一件が完全削除された場合、その操作の再送は`note_purged`です。同じ操作を新しいキーに変えて勝手に作り直しません。

## 完全削除

```js
const pendingPurge = { note_id: noteId, expected_revision: revision, idempotency_key: crypto.randomUUID() };
const deletion = await client.purgeNote(pendingPurge);
if (deletion.status === 'pending') {
  // まだ削除完了ではありません。必要時に getNotePurge(deletion.purge_id) で確認します。
}
```

対象は自分のゴミ箱のメモです。完全削除は追加の明示的な許可が必要で、既定では無効です。MCPで使わせる設定とは独立してREST/SDKの許可も検査します。許可済みtokenを持つAIと人の呼び出しは区別しないため、削除させたくないアプリへ資格情報を渡さない構成にします。SDKは自動pollも自動削除も行いません。

## 期限と互換性

JSON操作の既定は60秒、`exportNotes`と`importNotes`は120秒です。優先順は呼出しの`timeoutMs`、コンストラクターで明示した`timeoutMs`、操作の既定値です。token取得・HTTP・本文を一つの期限に含めます。`AbortSignal`の取消理由、本文、token、元例外はSDKエラーへ含めません。

既存3操作は従来サーバーの応答を読み続けられます。新しいget/searchは返ってきた状態・revision等を検査して公開します。新機能の入力は未知項目を拒否し、出力の未知項目は取り除きます。新メソッドに必要な既知項目の欠落や不正型は`invalid_response`です。
