# ADR-0015: MIDI Tools 版は core を v8.codebox に埋め込んだ 1 ファイルの .amxd にする

- 状態: 採用
- 日付: 2026-11-19

## 背景

Extension 版はクリップを右クリックしてダイアログを開く必要があり、ピアノロールで選んだノートにすぐかけられない。Live 12 の MIDI Tools（Transformation）なら、選んだノートにその場でかけ、つまみを回しながら試聴できる。ADR-0001 で core を SDK に依存しない形にしてあるので、処理はそのまま使える。

## 決定

- `packages/miditool` を足し、`build.ts` で core をまとめた JS を `v8.codebox` に埋め込んだ `humino.amxd` を生成する。パッチは手で編集せず、ビルドで作る
- 配線は `live.miditool.in` → `dict.join`（ノートとコンテキスト）→ `v8.codebox` → `live.miditool.out`
- 元のノートは保存しない。MIDI Tools は適用中、つまみを動かすたびに最初のノートを送り直すので、変換が重ならない
- つまみが動いたら `live.miditool.in` に bang を送り、その場でかけ直す
- テンポはコンテキストに無いので `LiveAPI("live_set")` から読む。シードはコンテキストの `seed` を使う
- パネルは 152×147 に収める。上に Mode とプリセット、その下に Hum / Feel / Strum のページを置き、`thispatcher` で表示を切り替える。Groove の 16 ステップの表以外のパラメータはすべて出す。コントロールの定義は `src/controls.ts` にまとめ、パッチの生成と v8 側の処理で共有する。手での上書きは Extension 版で行う
- デバイスを読み込んだ直後の 1 秒は、つまみの値を受けてもかけ直さない

## 結果

- core の修正がそのまま MIDI Tools 版にも入る
- 生成した .amxd は Max で開いて保存し直すと形式が変わる可能性がある。変更はいつも `build.ts` で行う
- Live 上での動作は CI で確かめられず、手で確かめる
