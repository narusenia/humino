# ADR-0014: v1 と v2 の範囲

- 状態: 採用
- 日付: 2026-11-18

## 決定

- v1：Groove（ステップ表 + Swing）、Humanize、Strum、疑似ペダル、プリセット、Re-apply、Strum Down / Up
- v2：Connect（経過音、Chromatic Run 1〜4 段、前打音）、ギターボイシング、別クリップからの Groove 抽出
- Connect は音楽的な判断が多く設計が重いので、v1 の土台ができてから入れる
- ギターボイシングは Connect と同じ v2 に入れ、入ったら Strum を弦の順に切り替える（ADR-0006）

## 結果

- v1 の Strum は「弦の番号があれば使う」という入口だけ用意しておく
