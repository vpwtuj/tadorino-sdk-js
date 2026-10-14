# Compatibility and verification

## 対応対象

Node.js 22.12以降の22系・24系、Chrome・Firefox・Safariの直近2主要版を対象とします。SDK本体はFetch、AbortController、ReadableStream、TextEncoder、TextDecoderを利用します。追加polyfillは自動挿入しません。

## 実装時のローカル検証

2026-10-14の配布候補0.1.0について、次を確認しました。リリース時は対象tagのCIと実接続記録を合わせて確認してください。

| 環境 | 検証範囲・状態 |
| --- | --- |
| Node.js 24.21.0 | ESM/CJS、NodeNext型、同じtarballによるREADME・React/Vite build・Expressの合成試験が成功 |
| Chrome for Testing 156.0.8078.4 | 配布tarballのReact UIから合成HTTPへの3操作、再送、HTTP失敗、取消が成功 |
| Playwright WebKit 27.2 | 同じReact UIの合成試験が成功。実Safariの検証とは別 |
| Playwright Firefox 157.0 | このMacではprofile選択がOSの保護により起動前に失敗。ローカルでのアプリ動作は未検証。Linux CIでは下記のブラウザ試験に成功 |
| 実Chrome/Firefox/Safariの直近2主要版 | このローカル記録だけでは全対象の確認は完了していない |

自動ブラウザ検査の具体的なエンジン版は結果JSONのbrowser-version注釈へ残します。Chromium・Firefox・WebKitのCI成功を実Safariや未実行の過去版の成功として報告しません。

## GitHub CIの検証

初回の検査に続き、2026-10-14にSDKコードcommit `ca0ed7496a45c1fe84b6ef409834554a87d677fc` の[GitHub Actions](https://github.com/vpwtuj/tadorino-sdk-js/actions/runs/38573473514)が成功しました。

| 環境 | 検証範囲・結果 |
| --- | --- |
| Node.js 22.23.3／24.21.0 | SDK 35件・Express 4件、型・配布物・文書・React/Vite buildの検査に成功 |
| Linux上のPlaywright Chromium／Firefox／WebKit | React UIから合成HTTPへの3操作・再送、失敗、取消のブラウザ試験9件に成功 |

このCIのブラウザ試験は独立した合成HTTP fixtureを使います。実Safari、各ブラウザの前の主要版、Auth0・OTP・公開メモRESTへの接続は検証していません。

## 親プロジェクトのローカル実DB検証

2026-10-14、親プロジェクトのReact例から、実際のRS256 JWT検証・メモ専用CORS・REST・一時PostgreSQL schemaを経由した保存、同じキーでの再送、検索、全文取得を確認しました。Chromium 156とPlaywright WebKit 27.2を使い、モバイル表示も確認しました。

この試験はloopback上のローカル署名JWTと合成メモを使います。実PostgreSQLを通した結果ですが、Auth0のメールOTP・開発Supabase・公開サービスへの接続とは別の証拠です。Playwright WebKitの成功も実Safariの成功とは区別します。

## 外部との接続

同じtarballからの独立した合成HTTP試験は、実Auth0・メールOTP・公開REST・Supabase・PostgreSQLとの接続の証拠ではありません。親プロジェクトのローカル実DB検査は上記の範囲で成功しましたが、公開環境検査とは区別します。

実Auth0のメールOTP受信・ログインと、公開メモRESTへのブラウザ直接接続は未完了です。npm公開用アカウントの二要素認証は確認済みですが、パッケージのnpm配布とGitHub Pagesの文書公開・閲覧確認は未実施です。公開の各完了条件を個別に確認してから公開済みと報告します。

Firefoxのローカル起動失敗は[PlaywrightのmacOS報告](https://github.com/microsoft/playwright/issues/42768)と[Mozillaのprofile選択の報告](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988)に対応する症状です。SDKの検査をskipして成功と扱う設定は加えていません。
