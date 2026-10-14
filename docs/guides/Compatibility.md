# Compatibility and verification

## 対応対象

Node.js 22.12以降の22系・24系、Chrome・Firefox・Safariの直近2主要版を対象とします。SDK本体はFetch、AbortController、ReadableStream、TextEncoder、TextDecoderを利用します。追加polyfillは自動挿入しません。

## 実装時のローカル検証

2026-10-14、SDK0.1.0の実装時に次の範囲を確認しました。対応するtagのCIと実接続記録を合わせて参照してください。

| 環境 | 検証範囲・状態 |
| --- | --- |
| Node.js 24.21.0 | ESM/CJS、NodeNext型、同じtarballによるREADME・React/Vite build・Expressの合成試験が成功 |
| Chrome for Testing 156.0.8078.4 | 配布tarballのReact UIから合成HTTPへの3操作、再送、HTTP失敗、取消が成功 |
| Playwright WebKit 27.2 | 同じReact UIの合成試験が成功。実Safariの検証とは別 |
| Playwright Firefox 157.0 | このMacではprofile選択がOSの保護により起動前に失敗。ローカルでのアプリ動作は未検証。Linux CIでは下記のブラウザ試験に成功 |
| 実Chrome/Firefox/Safariの直近2主要版 | このローカル記録だけでは全対象の確認は完了していない |

自動ブラウザ検査の具体的なエンジン版は結果JSONのbrowser-version注釈へ残します。Chromium・Firefox・WebKitのCI成功を実Safariや未実行の過去版の成功として報告しません。

## GitHub CIの検証

初回の検査に続き、2026-10-14にSDKコードcommit `03b551487249c6a5d636f7b0bdbd2404696b12e5` の[GitHub Actions](https://github.com/vpwtuj/tadorino-sdk-js/actions/runs/38576264732)が成功しました。

| 環境 | 検証範囲・結果 |
| --- | --- |
| Node.js 22.23.3／24.21.0 | SDK 36件・Express 4件、型・配布物・文書・React/Vite buildの検査に成功 |
| Linux上のPlaywright Chromium／Firefox／WebKit | React UIから合成HTTPへの3操作・再送、失敗、取消のブラウザ試験9件に成功 |

このCIのブラウザ試験は独立した合成HTTP fixtureを使います。実Safari、各ブラウザの前の主要版、Auth0・OTP・公開メモRESTへの接続は検証していません。

## 親プロジェクトのローカル実DB検証

2026-10-14、親プロジェクトのReact例から、実際のRS256 JWT検証・メモ専用CORS・REST・一時PostgreSQL schemaを経由した保存、同じキーでの再送、検索、全文取得を確認しました。Chromium 156とPlaywright WebKit 27.2を使い、モバイル表示も確認しました。

この試験はloopback上のローカル署名JWTと合成メモを使います。実PostgreSQLを通した結果ですが、Auth0のメールOTP・開発Supabase・公開サービスへの接続とは別の証拠です。Playwright WebKitの成功も実Safariの成功とは区別します。

## 公開開発サービスへの実接続

2026-10-14、このPCのChrome（インストール版155.0.8059.41）でReact＋Vite＋TypeScript例を使い、実Auth0のメールOTPログイン、Authorization Code＋PKCE、メモ専用CORS、Renderの公開開発サービスcommit `c13f21b`、開発Supabaseを経由した保存・同じキーの再送・検索・全文取得に成功しました。合成メモの絵文字・全角文字を含む原文を保持し、既存MCPからも同じメモを検索・取得できることを確認しました。

| 時刻（JST） | 確認した内容 |
| --- | --- |
| 22:55:52 | Auth0でAuthorization CodeをAccess Tokenへ交換 |
| 23:07:58 | 公開メモREST経由で合成メモを保存。その後、同じキーの再送・検索・全文取得を確認 |
| 23:10:52 | 初回Access Tokenが900秒の有効期間で自然に期限到達 |
| 23:11 | React例からの検索が成功。23:11:16のAuth0成功ログ `sertft` でRefresh Token交換を確認 |
| 23:12頃 | トークン更新後も同じ内容・同じキーで再送し、元のメモを確認。重複は作成されなかった |

トークン取得・更新は利用アプリのAuth0 SDKが担当し、タドリノSDKは各操作でその取得関数を呼びます。この検証をSDKによる自動refreshや401後の自動再送の証拠として扱いません。実ユーザーの識別情報・token・認証コード・メモ本文は、この公開ガイドへ含めません。

検証対象は利用許可済みアカウントと公開開発サービスです。実Safari・各ブラウザの前の主要版は未検証です。アカウントの利用許可はサービス側で管理します。

## 配布と文書の確認

### 0.1.1の機械主体例

2026-10-15、追加したlocalhost React＋Vite＋TypeScript → Express → SDKの機械例を、Node.js 24.21.0で検査しました。SDK41件・本人Express4件・機械例20件に加え、機械providerと入口の検査、React build・型・TypeDoc・同一candidate tarballによる導入が成功しました。公開npm0.1.0を新規installした同じ機械例でも検査を実行し、既存 `getAccessToken` APIでの互換を確認しました。

Chromium 156.0.8078.4・Playwright WebKit 27.2では、本人例と機械例の保存・同じキーの再送・検索・全文取得、HTTP失敗、取消の合成ブラウザ検査12件が成功しました。機械tokenがブラウザの要求に付かず、bootstrap応答がCSRF nonceとモードだけであることも確認しています。このMacのFirefox6件はprofile folderが見つからず、ブラウザ起動前に失敗しました。成功・skipとして扱いません。Firefox・Linux CIの結果は、対象commitのGitHub Actionsで別途確認します。

親プロジェクトでは、このPCのChromeで機械例の画面から実RS256 JWT検証・一時PostgreSQL schemaを経由する3操作と同一キー再送を確認しました。機械JWTはバックエンドへだけ注入しています。ローカル署名鍵・合成機械・一時DBによる検証であり、実Auth0 Client Credentialsや公開環境への接続成功は主張しません。実Safari・前の主要ブラウザ版の確認、npm・版別Pagesへの配置も別の工程です。

合成HTTP・ローカル実DB・公開開発サービスの各検証は、上記の環境と範囲で区別して記録します。npmの配布確認とGitHub Pagesの配置・閲覧確認も、それぞれの完了条件として扱います。

対象版のnpm配布情報は[npm package](https://www.npmjs.com/package/@bright203/tadorino-sdk-js)、版別文書は[0.1.0](https://vpwtuj.github.io/tadorino-sdk-js/v0.1.0/)を保持し、0.1.1の配置後は `/v0.1.1/` で提供します。公開完了の記録では、取得したtarballとタグの一致、新規利用アプリでの検査、Pagesの `version.json` とnpm版の一致を確認します。文書内のリンクやローカルbuildの成功だけを、公開済みの証拠にはしません。

Firefoxのローカル起動失敗は[PlaywrightのmacOS報告](https://github.com/microsoft/playwright/issues/42768)と[Mozillaのprofile選択の報告](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988)に対応する症状です。SDKの検査をskipして成功と扱う設定は加えていません。
