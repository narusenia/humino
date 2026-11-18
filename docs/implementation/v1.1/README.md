# v1.1 MIDI Tools 版

core を 1 つの JS にまとめ、Max 9 の `v8.codebox` で動かす Transformation を作る。方針は [ADR-0015](../../adr/0015-midi-tools-device.md)。

| # | 作業 | 状況 |
|---|---|---|
| 01 | `packages/miditool` と `humino.ts`（ノートの変換、つまみのメッセージ、bang でのかけ直し） | 完了 |
| 02 | `build.ts` で `humino.amxd` を生成（ヘッダー、パッチ、パネル 152×147） | 完了 |
| 03 | mise タスク `miditool:build` と `miditool:install` | 完了 |
| 04 | Live で確かめる（読み込み、変換、つまみでのかけ直し、プリセット、テンポ） | 未着手 |
| 05 | Releases に `humino.amxd` を添付 | 未着手 |
