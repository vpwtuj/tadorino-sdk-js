# Errors and retries

{@link TadorinoError} の `kind`、`status`、`errorCode` を使って失敗を分岐します。token、元の認証例外、メモ本文、応答本文はエラーへ含めません。`message` は固定説明で、分類には使いません。ESMとCommonJSを混在させた `instanceof` の同一性は保証しません。

| kind | 条件 |
| --- | --- |
| configuration | コンストラクターの設定不正 |
| input | 操作の入力・直列化・オプション不正 |
| auth | token取得の失敗・token形式不正 |
| http | 非成功HTTP。401と403も含む |
| network | 通信・stream・CORS・redirect拒否 |
| timeout | token取得から本文までの期限到達 |
| aborted | 利用者による取消 |
| invalid_response | 成功statusでも応答契約が不正 |

## 保存の結果が不明な場合

timeout、network、取消、応答不正でもサーバーでは保存が完了している可能性があります。アプリは最初に生成した `idempotency_key` と同じ内容を保持し、利用者の指示で再送します。SDKは自動再試行をしません。

同じ本人・同じキー・同じ内容なら元の `note_id` が返り、再送では `created: false` です。同じキーの別内容はHTTP409の `idempotency_conflict` です。再ログインで別の本人へ切り替えた場合は、元の保存操作の続きとして扱わないでください。

React例は最初の入力を固定し、「同じ内容を再送」で同じキーを使います。ページ再読み込みをまたぐ保持はアプリの要件に応じて保護された保存場所へ追加してください。例はメモをlocalStorageへ永続化しません。

取消にはAbortControllerを渡せます。期限・取消後にtoken取得関数の処理そのものを強制終了できる保証はありませんが、SDKはその後のfetchを開始しません。
