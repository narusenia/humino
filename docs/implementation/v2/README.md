# v2 Connect、ギターボイシング、Groove 抽出

範囲は [ADR-0014](../../adr/0014-v2-scope.md)。Connect とボイシングは Extension と MIDI Tools の両方に入れる。Groove 抽出はステップ表が Extension にしかないので Extension だけに入れる。

| # | 作業 | 状況 |
|---|---|---|
| 01 | core に Connect（経過音、Chromatic Run、前打音）。`Params.connect`、`Context.scale`、足したノートを `Result.notes` に入れる | 完了 |
| 02 | Extension：Song のスケールを渡す、ダイアログに Connect タブ、足したノートをスカイ色で描く | 完了 |
| 03 | MIDI Tools：Connect のページ、スケールの受け取り、足したノートの出力 | 完了 |
| 04 | MIDI Tools：統合版に加えて、処理ごとのデバイス（Humanize、Swing、Strum、Pedal、Connect）も生成する | 完了 |
| 04b | MIDI Tools：つまみとタブに説明（Live の Info View に出る annotation）を付ける | 完了 |
| 05 | Live で Connect を確かめる（両方の版） | 完了 |
| 05b | UI の見直し：MIDI Tools は全デバイスを v8ui の絵と文字の値に作り直した。ダイアログはタブに処理ごとの on / off を置き、モードで使わない設定を隠し、Connect の列をそろえた | 完了 |
| 05c | 和音の判定幅（chordWindow）：グリッドから少しずれた和音も 1 つの和音として扱う | 完了 |
| 05d | Extension のプレビューにコード名とディグリー（Scale Mode のキーに対するローマ数字）を出す。chord window をヘッダーに置く | 完了 |
| 06 | core にギターボイシング（チューニング、カポ、弦の番号）と、Strum を弦の順にする | 完了 |
| 07 | ボイシングの UI（Extension の Strum タブ、MIDI Tools の Str ページと humino Guitar Voicing） | 完了 |
| 08 | Extension：別クリップから Groove を抽出してステップ表に入れる | 完了 |
| 09 | Live で確かめてリリース（v0.3.0） | 完了 |
