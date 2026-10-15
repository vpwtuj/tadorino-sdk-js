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

## ライフサイクル追加版のローカル検証

2026-10-15、未公開の追加ソースで、全JSONメソッド、metadata／由来の検査、ZIPの120秒既定期限と途中取消、80 MiB実測上限、同じtokenでの準備＋PUT、committed準備の再PUT、完全削除pendingの扱いを合成HTTPで検証しました。NodeのネイティブFetchによるstreamアップロードと、一時ディレクトリへの実ファイル保存・部分ファイル除去・再読込によるimport再送も確認しました。実Auth0や公開サービスの新機能はこの試験に含めません。

同じtarballからESM／CommonJS・NodeNext型・TypeDoc・React／Express／M2Mの既存例を検証しています。追加のReact TypeScript helperはブラウザでFileを保持した再送と出力先closeまでの待機を確認します。ChromiumとWebKitは各9件に成功しました。Firefox 157.0も、後述の一時アプリデータ分離で、当初起動に失敗した8件と追加のstream import能力試験1件、合計9件に成功しました。3エンジン合計27件はすべて合成HTTPによる検証です。今回の変更のLinux CIはまだ実行していません。既存のCI成功を今回の追加APIの成功として扱いません。

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

### 0.1.2に含める機械主体例

2026-10-15、追加したlocalhost React＋Vite＋TypeScript → Express → SDKの機械例を、Node.js 24.21.0で検査しました。SDK41件・本人Express4件・機械例20件に加え、機械providerと入口の検査、React build・型・TypeDoc・同一candidate tarballによる導入が成功しました。公開npm0.1.0を新規installした同じ機械例でも検査を実行し、既存 `getAccessToken` APIでの互換を確認しました。

Chromium 156.0.8078.4・Playwright WebKit 27.2では、本人例と機械例の保存・同じキーの再送・検索・全文取得、HTTP失敗、取消の合成ブラウザ検査12件が成功しました。機械tokenがブラウザの要求に付かず、bootstrap応答がCSRF nonceとモードだけであることも確認しています。このMacのFirefox6件はprofile folderが見つからず、ブラウザ起動前に失敗しました。成功・skipとして扱いません。Firefox・Linux CIの結果は、対象commitのGitHub Actionsで別途確認します。

0.1.1準備commit `4e3ca38f920672844cf67425a6ce559bdee86772` の[SDK checks](https://github.com/vpwtuj/tadorino-sdk-js/actions/runs/38654929859)は成功しました。Node.js 22.23.3／24.21.0でSDK41件・本人Express4件・機械例20件、型・文書・build・配布検査を確認し、LinuxのChromium／Firefox／WebKitで本人例・機械例のブラウザ18件すべてが成功しました。このCIも合成HTTP fixtureの検証で、実Auth0・実DB・実Safariの成功を意味しません。

親プロジェクトでは、このPCのChromeで機械例の画面から実RS256 JWT検証・一時PostgreSQL schemaを経由する3操作と同一キー再送を確認しました。機械JWTはバックエンドへだけ注入しています。ローカル署名鍵・合成機械・一時DBによる検証であり、実Auth0 Client Credentialsや公開環境への接続成功は主張しません。実Safari・前の主要ブラウザ版の確認、npm・版別Pagesへの配置も別の工程です。

### 0.1.1準備時の実Auth0・公開開発サービス検証

2026-10-15、実Auth0のdefault token profile、Access Tokenの900秒の有効期間、今回の開発テナントのFree枠がM2M token月1000件であることを確認しました。実Auth0 Client Credentialsから取得したtokenで公開メモREST・開発Supabaseを経由し、保存・検索・全文取得、同じキー・同じ内容の再送、同じキーで内容が違う場合の409を確認しました。localhostのReact → Express → SDKから公開メモRESTへの保存も成功しました。資格情報・機械tokenはバックエンドだけで扱います。

この実接続では、要求scopeがreadだけでもClient Grantにread/writeがあれば両方の署名scopeが発行されました。要求scopeだけで最小権限になったと扱わず、Auth0 Client Grantによる制限とAPIでの署名scopeの認可を区別します。

900秒の自然な有効期間が過ぎた旧JWTは401となり、providerによる実Client Credentialsの再取得後も元のメモ取得・同じキーの再送が成功しました。Refresh TokenやSDKの401後の自動再送は使っていません。

| 時刻（2026-10-15 JST） | 確認した内容 |
| --- | --- |
| 08:46:37 | 初回の実Client Credentials token取得を観測 |
| 09:01:36 | 初回JWTの有効期限 |
| 09:01:40 | 発行後903秒時点で旧JWTの401とprovider再取得、元メモ・同一再送の継続を確認 |

機械を停止した状態で、人の既存OTPを起点とするNative CLI sessionを実Refreshし、M2M Secretのrotate・recover・status・receipt・再送を確認しました。Secret管理によって停止解除・メモ所有者・再送履歴が変わらないことも確認しました。管理CLIはSDKとは別配布です。旧管理CLI0.1.0はM2M応答で `invalid_response` を再現し、限定配布の管理CLI0.1.1キットをoffline導入して公開サービスへの操作が成功しました。

機械を再開した後も、回転前の未失効JWTで元メモと同一再送を利用できました。一方、旧Secretによる新規token取得は401 `access_denied`、新Secretによる新規取得は成功しました。新Secretをlocalhost Expressの無視対象設定へ配置してbackendを再起動し、このPCのChromeから新しい保存・同一再送・以前のメモの検索と全文取得も確認しました。Secret交換と発行済みJWTの失効は異なる操作です。

09:10:42 JSTまでにClient ID交換の実測も成功しました。未登録の新clientは401となり、停止中の同じ機械IDへ交換した後も停止中は401、再開後は新clientから元メモ・同一キー再送が成功しました。旧clientの有効期限内JWTは401となり、メモの所有者IDは維持されました。管理対象・本人対応も旧側を停止すると旧操作が404となり、新対象の登録後は本人CLIからrecover・receiptが成功しました。これらは提供側で明示した登録・停止・交換の結果であり、SDKが所有者やclient対応を変更するものではありません。

2026-10-15、本人の新しいメールOTPログインとPKCEによる実JWT取得を経由し、公開メモRESTの保存201、同一キー再送・検索・全文取得200を確認しました。MCPからも同じメモを検索し、全文の一致を確認しています。本人のメモ用tokenを管理RESTへ送ると401となり、検証用に追加したcallbackも元へ戻しました。この本人回帰を、過去の実績や合成CIとは別の今回の実接続結果として記録します。

Windows上の実アプリ、実Safari・前の主要ブラウザ版は、この実接続記録の成功範囲に含めません。実接続とnpm・Pagesの配布状態は別に確認します。

### 0.1.1の公開失敗と0.1.2の修正

npm trusted publisher登録後の[0.1.1公開workflow](https://github.com/vpwtuj/tadorino-sdk-js/actions/runs/38661095479)はcheck成功、publish失敗でした。npmが相対tarballパスをGitHub shorthandと解釈し、`git ls-remote` が終了コード128となったため、アップロード成功はありません。exact0.1.1のpublic registryと版別Pagesは404、latestは0.1.0のままであることを確認しました。不変tag `v0.1.1` は移動・削除せず保持します。

0.1.2はSDK runtimeを変えず、ローカルパスを明示した公開コマンドと同経路の実npm dry-run検査を追加します。dry-runやtrusted publisherの設定成功を、公開済みtarball・OIDC provenanceの検証成功と扱いません。配布状態は[npm](https://www.npmjs.com/package/@bright203/tadorino-sdk-js)、[GitHub Release](https://github.com/vpwtuj/tadorino-sdk-js/releases)、実際の版別Pagesを確認します。

合成HTTP・ローカル実DB・公開開発サービスの各検証は、上記の環境と範囲で区別して記録します。npmの配布確認とGitHub Pagesの配置・閲覧確認も、それぞれの完了条件として扱います。

対象版のnpm配布情報は[npm package](https://www.npmjs.com/package/@bright203/tadorino-sdk-js)、版別文書は[0.1.0](https://vpwtuj.github.io/tadorino-sdk-js/v0.1.0/)を保持し、0.1.2の配置後は `/v0.1.2/` で提供します。公開完了の記録では、取得したtarballとタグの一致、新規利用アプリでの検査、Pagesの `version.json` とnpm版の一致を確認します。文書内のリンクやローカルbuildの成功だけを、公開済みの証拠にはしません。

## Firefoxのローカル起動条件

2026-10-15、macOS 27.0.1 arm64で同一のPlaywright Firefox 157.0を比較しました。通常起動は `Could not find profile folder` で終了し、SDKやページの実行まで到達しません。一方、起動する子プロセスだけの `CFFIXED_USER_HOME` を新規の空一時ディレクトリへ指定すると、起動と合成ページ表示に成功しました。一時profileの置き場所だけを `/tmp` に変える方法では解決しませんでした。

この結果は、Firefoxがprofileとは別に参照するアプリデータ領域とmacOSの保護が原因であるという[Playwrightの報告](https://github.com/microsoft/playwright/issues/42768)と一致します。[Mozillaのprofile選択の修正](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988)はheadless起動失敗時の停止方法を修正したもので、このローカル設定での起動成功を保証するものではありません。

分離条件のまま、失敗していたFirefox8件だけを再実行して8件成功、続いてstream import能力試験だけを実行して1件成功を確認しました。SDKソース・ブラウザバイナリ・OSの権限設定は変更していません。`HOME`や実ユーザーのFirefoxデータも変更せず、合成一時ディレクトリは終了後に削除しました。macOSがその中のLibrary／Downloadsに作成した削除拒否ACLは、この一時ディレクトリ内だけで解除して片付けています。

上の過去の未検証記録は当時の結果として保持します。現在の通常起動ではエラーが再現するため、分離を行わないローカル環境でも成功すると扱いません。検査のskip、ブラウザsandboxの無効化、失敗を成功に置き換える設定は追加していません。実Auth0・公開REST・実Safari・前の主要版・今回のLinux CIは別途検証が必要です。
