# Publishing and documentation

このガイドはSDKの提供者向けです。npm公開・GitHub Pages公開・利用者の認証許可は別々に確認します。

0.1.0は初回CLI公開済みです。0.1.1のGitHub tag・Releaseは保持しますが、公開workflowはnpmアップロード前に失敗しました。修正した0.1.2では、下記のtrusted publisher設定と検証済みtarballの一致を確認し、新しい不変tag `v0.1.2` からRelease経路を使います。既存tagや0.1.0のnpm配布物・版別Pagesを上書きしません。公開候補の検査だけでnpm公開済みとは扱いません。

## 0.1.1の公開失敗と0.1.2の修正

2026-10-15の[release workflow](https://github.com/vpwtuj/tadorino-sdk-js/actions/runs/38661095479)はcheck成功後、publishで終了コード128となりました。`npm publish release-package/*.tgz` の展開結果をnpmがGitHub shorthandと解釈し、`git ls-remote` が失敗しています。registryへのアップロード成功はなく、exact0.1.1のpublic registryは404、Pagesの0.1.1も404でした。これは公開要求が受理された後のスキャン待ちとは異なります。

0.1.1の不変tagを動かさず、0.1.2で `npm publish ./release-package/*.tgz --access public --provenance` に修正します。check jobは検証済みSHAと同じtarballに `npm publish ./release-package/*.tgz --dry-run --ignore-scripts --access public` を実行し、実CLIがローカルファイルとして読めることを先に検査します。dry-runはuploadやOIDC公開の成功を証明しません。修正後も、publish受理後に同じversionを再uploadしてはいけません。

公開後も繰り返す `pack:check` は、同じローカルtarballパスを実npm CLIのoffline dry-runで2回検査します。専用の空cache・空user/global設定・認証情報やOIDCを渡さない子環境を使い、loopback registryへの要求が0件であることも検査します。npmのdry-runは通常、公開済みの同じversionを拒否するため、ここではレジストリの公開可否判定からファイル解析とSHA/SRIの照合を分けています。本番の公開許可・既存版保護を緩める処理や新しいnpm公開は行いません。0.1.2の不変tag・配布物も変更しません。

## 初回のパッケージ公開

まだnpmパッケージが存在しない初回は、所有者の2FAを有効にしたアカウントで、ログイン済みnpm CLIから検証済みtarballを公開します。CLIのログイン情報をリポジトリやログへ貼らず、長期の `NPM_TOKEN` をGitHub Secretsへ登録しません。

1. ソース・lockfile・文書をレビューしてcommitし、SDK checksのNode22/24とブラウザ3エンジンを確認します。タグとpackage.jsonのversionは一致させます。
2. そのcommitに `v0.1.0` タグを作成してGitHubへpushします。初回手動公開では、npm trusted publisher設定前に公開済みGitHub Releaseを作成しないでください。Releaseイベントは自動npm公開を起動します。
3. そのタグのクリーンなcheckoutで `npm ci` と `npm run check` を実行します。`.artifacts/package-verification.json` は同じtarballのESM/CJS・型・掲載例・新規利用アプリの検証結果とSHA-256です。
4. 初回公開に使うtarballを生成し、記録されたSHA-256と一致することを確認します。下の例は0.1.0用です。出力ディレクトリへ古いtarballを混在させません。

```sh
mkdir -p .artifacts/release
npm pack --ignore-scripts --pack-destination .artifacts/release
node --input-type=module -e 'import{readFile}from"node:fs/promises";import{createHash}from"node:crypto";const expected=JSON.parse(await readFile(".artifacts/package-verification.json","utf8"));const actual=createHash("sha256").update(await readFile(".artifacts/release/bright203-tadorino-sdk-js-0.1.0.tgz")).digest("hex");if(actual!==expected.tarballSha256)throw Error("Publication archive differs from tested package")'
```

5. 公開する名前・version・ファイル一覧を確認したうえで、次のCLI操作を実行します。npmの対話的な2FA確認は所有者が完了します。認証コードをチャットやリポジトリへ残しません。

```sh
npm publish ./.artifacts/release/bright203-tadorino-sdk-js-0.1.0.tgz --access public
npm view @bright203/tadorino-sdk-js@0.1.0 version dist.integrity --json
```

npmは初回作成・公開と設定変更に2FAを要求します。2FAを迂回するtokenや認証設定の緩和で代替しません。[npmの2FA要件](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)

`npm publish` の終了コード0は、公開要求の受理を示します。npmの公開時スキャンが終わるまで、版の取得がHTTP404になり、利用アプリへinstallできないことがあります。典型的には約5分、混雑時などは15分以上かかる場合があります。同じ版を再アップロードせず、公開レジストリでその名前・versionが取得できるようになるのを確認します。[npm公開時スキャンの公式説明](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)

このローカルCLI公開ではGitHub ActionsのOIDC provenanceは付きません。公開されたtarballを新規アプリへinstallし、読み込み・型・主要操作の検証結果と公開元commitを記録します。公開前のローカル検証だけでnpm配布済みと報告しません。[npm publish公式仕様](https://docs.npmjs.com/cli/v11/commands/npm-publish/)

## 初回版の文書だけを公開する

GitHub PagesのSourceをGitHub Actionsへ設定します。npm版と対応する安定版タグが存在し、そのタグのpackage.jsonと生成文書が同じ版であることが必要です。

1. SDKリポジトリのActionsで **SDK release** を選び、**Run workflow** を実行します。workflowのbranchは手動実行入口を含む `main` を選びます。
2. `release_tag` に公開済みnpm版の正確なタグ、例えば `v0.1.0` を入力します。
3. この経路はnpm公開jobを実行しません。指定タグをcheckoutして型・JSDoc由来の文書を生成します。公開レジストリでその版が取得できるまで、最大15分・30秒間隔で待ちます。各要求は最大10秒です。npm公開済みversion・package・文書メタデータの一致を検査してからPagesへ配置します。
4. 公開先の `/v0.1.0/version.json` と版別文書を確認します。`/latest/` は保持している最も新しい安定版を指し、古い版の再配置で新しい版を上書きしません。

HTTP404・429・5xx・通信中断は待機期限内で再確認します。それ以外のHTTP失敗、取得した名前・versionの不一致、不正なメタデータは配置を停止します。15分で公開版を確認できなかった場合も配置を停止し、公開状況を確認してから文書専用の手動実行を再開します。タグ名が安定版形式ではない、タグが存在しない、packageや文書の版が不一致の場合も停止します。文書だけの手動実行は、npm公開後の文書生成・Pages配置失敗を復旧する際にも使えます。

## 以後のtrusted publishing

初回npm公開後、次の新しい版をOIDCで公開する直前に、パッケージのSettingsまたは公式 `npm trust` CLIでGitHub Actionsのtrusted publisherを設定します。作成後2日以内に最初の成功した公開が必要で、それを過ぎると設定が期限切れになります。文書だけの配置は、この初回OIDC公開の代わりにはなりません。

| 設定項目 | 値 |
| --- | --- |
| Organization or user | `vpwtuj` |
| Repository | `tadorino-sdk-js` |
| Workflow filename | `release.yml` |
| Environment name | 未指定。npm公開jobにはenvironmentを設定していません |
| Allowed actions | この直接公開workflowには `npm publish` の明示的な許可が必要 |

`github-pages` environmentは文書配置job用で、npm公開jobの環境とは別です。npm trusted publishingにはnpm CLI11.5.1以降・Node22.14以降とGitHub-hosted runnerが必要です。本workflowはNode24のGitHub-hosted runnerを使用します。[npm trusted publishing公式手順](https://docs.npmjs.com/trusted-publishers/)

2026-09-03以降に作成するtrusted publisherは、既定では `npm stage publish` が許可されます。このworkflowの直接公開には `npm publish` を別に許可する設定が必要です。stage-onlyの保護を使う方針なら、既存の設定を緩和せず、stagingと所有者の2FA承認を組み込むworkflow変更を先に行います。

CLIでの設定にはnpm11.15以降、既存パッケージの書込権限、所有者の2FAが必要です。次はnpm11.19.0で確認した対象設定です。最初にdry-runで名前・repository・workflow・許可操作を確認し、その後に登録します。公開jobにenvironmentがないため `--environment` は指定しません。[npm trust公式仕様](https://docs.npmjs.com/cli/v11/commands/npm-trust/)

```sh
npm trust github @bright203/tadorino-sdk-js --file release.yml --repository vpwtuj/tadorino-sdk-js --allow-publish --dry-run
npm trust github @bright203/tadorino-sdk-js --file release.yml --repository vpwtuj/tadorino-sdk-js --allow-publish --yes
npm trust list @bright203/tadorino-sdk-js
```

`--allow-publish` は直接公開のために必須です。`--yes` はCLIの設定確認を省略するだけで、本人のMFAを代行・省略しません。表示された本人認証は所有者がブラウザで完了します。`list` にもMFAを求められる場合があります。自動でブラウザを開かず本人へ操作を引き継ぐ場合は、CLIへ `BROWSER=false` を前置できます。OTP・token・本人認証の一時URLをチャットやリポジトリへ保存しません。dry-runや本人認証待ちを設定完了と扱わず、登録成功と再取得した設定を確認します。

設定の存在や `npm whoami` だけでtrusted publishing検証済みと報告せず、実際の新しい版のOIDC公開が成功した時点で確認します。

以後の新しい安定版はversionを更新し、対応する `vX.Y.Z` タグのGitHub Releaseを公開します。workflowは検証済みtarballのSHAを照合して渡し、短期OIDC認証でnpmへ公開した後、対応版の文書を配置します。prereleaseはこの安定版経路では公開しません。

0.1.2では、SDK checksのNode22/24と本人・機械の3ブラウザエンジン検査が成功したcommitをmainへ取り込み、その同じcommitへtagを作ります。npm側で直接 `npm publish` が許可されたtrusted publisherを確認してからGitHub Releaseを公開します。初のOIDC公開に失敗した場合は設定・期限・workflow名・repository URLを確認し、長期tokenへ切り替えたり既存の2FAを緩めたりしません。uploadが受理されていないことを確認できる場合だけpublish jobを再実行し、既に公開処理中・公開済みなら同じ版を再uploadせず、公開レジストリの確認と文書jobの復旧へ進みます。

npm公開後に文書jobだけが失敗した場合は、失敗したjobの再実行か文書専用の手動実行で復旧します。同じnpm versionの再公開はできないため、初回手動公開済み `v0.1.0` に後からGitHub Releaseを作成して自動npm公開を起動しないでください。初回タグを保持し、次の新しい版からRelease経路を使います。
