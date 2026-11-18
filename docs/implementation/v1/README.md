# v1 実装計画

仕様は `docs/specifications/design.md`。core のチケットは SDK なしで進められる。上から順に進める。

| # | チケット | 中身 | 完了条件 | 状況 |
|---|---|---|---|---|
| 01 | リポジトリの雛形 | workspaces、mise、lefthook、CI、文書、ADR | `mise run check` が通る | 完了 |
| 02 | core：拍とグリッドの解析 | 和音の判定、ステップ位置、拍の強さ、3 連の判定、ms と拍の変換 | テストで 16 分・3 連・和音を判定できる | 完了 |
| 03 | core：Groove | ステップ表、Swing、拍のアクセントの初期値 | Swing 50 % で裏の 16 分が想定どおりずれるテスト | 完了 |
| 04 | core：Humanize | Drift（時間ベースの平均回帰）、Jitter と beat weight、ベロシティ、chord balance、legato、length jitter | シード値が同じなら同じ出力、和音の構成音が同じだけ動くテスト | 完了 |
| 05 | core：Strum | 振りの細かさと向き、速さ、taper、up skip、anchor、終わりを揃える、overlap、向きの固定 | 8 分と 16 分のパターンで向きが正しいテスト | 完了 |
| 06 | core：疑似ペダル | bar / chord の区間、同じ音程の切断 | 区間の終わりまで伸びるテスト | 完了 |
| 07 | core：パイプラインと選択範囲 | 処理の順番、選択の和音への広げ方、Drift を全体で計算して部分に当てる | 選択ありと選択なしの両方のテスト | 完了 |
| 08 | core：元データのハッシュ | ノートのハッシュ（`selected` を除く） | 並び順と `selected` に影響されないテスト | 完了 |
| 09 | extension：SDK とのつなぎ | 右クリックメニュー 4 つ、ノートの読み書き、`withinTransaction`、元データと last.json の保存 | Live で Re-apply を 2 回かけても 1 回分の効果になる | 実装済み（Live で未確認） |
| 10 | extension：ダイアログの骨組み | ヘッダー、タブ、フッター、配色トークン、Allo の埋め込み、結果の受け渡し | Live でダイアログが開き、Apply で設定が返る | 実装済み（Live で未確認） |
| 11 | extension：パラメータ操作 | ドラッグで値を変える、ダブルクリックで初期値、Advanced の折りたたみ、無効化の表示 | 全パラメータを操作できる | 実装済み（Live で未確認） |
| 12 | extension：プレビュー | ミニピアノロール、処理ごとの色のずれ、Drift の曲線 | つまみの操作で即座に描き直される | 実装済み（Live で未確認） |
| 13 | extension：Groove の表 | 16 本のステップ表（timing / velocity） | 描いた表が結果に反映される | 実装済み（Live で未確認） |
| 14 | プリセット | 組み込み 6 種、ユーザープリセットの保存と読み込み | 保存したプリセットが Live の再起動後も残る | 実装済み（Live で未確認） |
| 15 | 配布 | `.ablx`（OFL.txt を同梱）、GitHub Releases、CHANGELOG | Windows と macOS でインストールして動く | .ablx 作成済み（Releases と実機確認が残り） |
| 16 | ピアノロールでの編集 | ダイアログ内の選択、ロック、和音ごとの stroke・speed・up skip、⌥ ドラッグでのずらし、ベロシティのレーン、音名・小節番号、ホバーの詳細、拡大縮小、960 × 720 | Live で選択・ロック・ずらしが Apply に反映される | 実装済み（Live で未確認） |
