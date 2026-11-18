# コントリビューションガイド

## セットアップ

1. [mise](https://mise.jdx.dev/) を入れてから、`mise install`（Node 24 と lefthook）と `mise run hooks:install` を実行します。
2. `mise run install` のあと `mise run check` を実行します。対象は `packages/core` で、Ableton のものは何も必要ありません。

### 拡張機能（任意、Live 12 Suite が必要）

Ableton Extensions SDK は npm で公開されておらず、ライセンスで再配布が禁止されています。そのため、このリポジトリには含めていません。

1. Ableton Beta Program に参加し、Live 12.4.5 ベータ以降を入れます。
2. ベータプログラムから「Extensions SDK and Documentation」をダウンロードし、`*.tgz` をリポジトリ直下の `sdk/` に置きます（git の管理対象外です）。
3. `mise run ext:install` のあと `mise run ext:check` を実行します。
4. Live の Settings → Extensions で Developer Mode をオンにしてから、`mise run ext:start` を実行します。

## コードの置き場所

- ノートの処理は `packages/core` に書きます（SDK を import しない純粋関数）。テストは `packages/core/test` に置きます。
- Live との連携とダイアログの UI は `packages/extension` に書きます。

## コミット

1 行で `<feat|fix|refactor|docs|test|chore|perf|ci>: <小文字の説明>` の形にします。commit-msg フックで検査します。

## 設計資料

仕様、計画、設計の決定事項は `docs/` にあります。
