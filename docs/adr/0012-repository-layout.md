# ADR-0012: リポジトリ構成と SDK の扱い

- 状態: 採用
- 日付: 2026-11-18

## 背景

SDK のライセンスは、SDK を自分のアプリの外で配布することを禁じ、付属ドキュメントを機密情報として扱う。SDK は公開 npm にもないので、CI ではインストールできない。

## 決定

- npm workspaces で `packages/core`（SDK 非依存）だけをワークスペースにする。CI は core の型チェックとテストだけを行う
- `packages/extension` は単独のパッケージにし、SDK を `file:../../sdk/*.tgz` で参照する。core は tsconfig の `paths` で参照し、esbuild が 1 ファイルにまとめる
- `sdk/` は git の管理対象外にする。SDK のファイルやドキュメントの内容をリポジトリに書き写さない
- ツールは mise で固定する（Node 24、lefthook）。検査の入り口は `mise run check`
- 文書は tsukumoe の構成にならい、`docs/adr`、`docs/specifications`、`docs/implementation`、`docs/handoff` に置く

## 結果

- コントリビューターは各自 Ableton のベータプログラムから SDK を入手する必要がある（CONTRIBUTING.md）
- `.ablx` に SDK が組み込まれるのは「アプリの一部」としての配布なので、ライセンス上問題ない
