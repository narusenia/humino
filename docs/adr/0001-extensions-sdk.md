# ADR-0001: Ableton Extensions SDK でクリップを書き換える

- 状態: 採用
- 日付: 2026-11-18

## 背景

候補は 3 つあった。Extensions SDK（JS/TS、右クリックで 1 回実行）、Max for Live の MIDI エフェクト（リアルタイム処理）、Live 12 の MIDI Tools（Max for Live の Transformation）。つなぎのノートや Strum の向きは前後のノートを見て決めるので、先読みができない方式は向かない。MIDI Tools はつまみを回しながら試聴できるが、Max のパッチで書くことになり、テストと配布が重い。

## 決定

- Extensions SDK で MIDI クリップのノートを書き換える方式を採る（Live 12 Suite、12.4.5 ベータ以降）
- 処理本体は SDK に依存しない純粋な TypeScript（packages/core）にし、MIDI Tools へ移植する余地を残す

## 結果

- 試聴しながらの調整はできない。代わりにダイアログ内で適用前と適用後をプレビューする（ADR-0008）
- MIDI CC やオートメーションを書く API がないので、サステインペダル（CC64）は書けない。疑似ペダルで代替する（design.md）
- SDK がベータなので、API の変更に追従する必要がある
