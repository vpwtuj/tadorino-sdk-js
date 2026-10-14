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
| Playwright Firefox 157.0 | このMacではprofile選択がOSの保護により起動前に失敗。アプリ動作は未検証。Linux CIの結果を別に確認 |
| Node.js 22、実Chrome/Firefox/Safariの直近2主要版 | このローカル記録だけでは全対象の確認は完了していない |

自動ブラウザ検査の具体的なエンジン版は結果JSONのbrowser-version注釈へ残します。Chromium・Firefox・WebKitのCI成功を実Safariや未実行の過去版の成功として報告しません。

## 外部との接続

同じtarballからの独立した合成HTTP試験は、実Auth0・メールOTP・公開REST・Supabase・PostgreSQLとの接続の証拠ではありません。親プロジェクトでの実DB検査や公開環境検査は、その環境と結果を別に記録します。npm配布・GitHub Pages閲覧・ブラウザ直通の各完了条件を個別に確認してください。

Firefoxのローカル起動失敗は[PlaywrightのmacOS報告](https://github.com/microsoft/playwright/issues/42768)と[Mozillaのprofile選択の報告](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988)に対応する症状です。SDKの検査をskipして成功と扱う設定は加えていません。
