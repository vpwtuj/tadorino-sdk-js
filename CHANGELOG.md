# Changelog

## 0.1.1

- Node専用Client Credentials token providerと、localhostのReact＋Vite＋TypeScript → Express → SDK例をソースへ追加。Secretと機械tokenはバックエンドだけに保持します。
- 固定設定ごとの期限付きcache、並行取得の共有、各callerの取消、安全なtimeout・応答上限・エラー、明示的再送を検査します。
- 機械と本人の所有者、利用アプリ側の認可責任をJSDoc・認証ガイドへ追記。機械例を0.1.0の公開npm版でも検査します。
- 既存の本人OTP・本人session例、ESM/CJS、型宣言、3操作、`getAccessToken`、SDKの自動retry・refreshなしという契約を維持します。新しいSDK exportや実行時依存はありません。
- 公開時スキャン後のnpm取得可能性を待ってから版別Pagesを配置するworkflowを含みます。

## 0.1.0

- メモRESTの保存・検索・全文取得、取消・期限・安全なエラーを初公開。
- ESM/CJS、JSDoc由来の型宣言とTypeDoc、React/Vite/TypeScript・本人sessionのExpress例を提供。
- 不変tag `v0.1.0`、npm、版別Pagesを公開。Auth0の本人OTP・公開開発REST・開発Supabase、トークン更新と同一キー再送の実接続を確認。
