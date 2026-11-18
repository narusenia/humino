# humino 設計仕様

humino は MIDI クリップのノートを書き換えるヒューマナイザーである。この文書は処理の仕様、パラメータ、UI を定める。決定の理由は `docs/adr/` にある。

## 前提

- 対象：Live 12 Suite、Extensions SDK 1.0.0（Live 12.4.5 ベータ以降）
- 入力はクオンタイズ済みの MIDI クリップ（ADR-0002）
- 時間の単位：人の揺れ（Drift、Jitter、Strum）は ms、ノリ（Groove、Swing）はステップ長に対する %（ADR-0003）。ms から拍への変換には適用時の `Song.tempo` を使う
- 拍子は 4/4 を前提に作り始める。ほかの拍子の扱いは未定（下の「未決事項」）

## 全体の流れ

1. 右クリックのコマンドを受ける
2. クリップのノートを読み、保存してある元のノートと照合する（ADR-0002）
3. 処理対象を決める（ADR-0007）
4. パイプラインを通す（ADR-0004）：Groove → Humanize → Strum → 疑似ペダル → Connect（v2）
5. `withinTransaction` の中でクリップのノートを書き換え、元のノートと出力のハッシュを保存する

パイプラインは `packages/core` の純粋関数で、`(notes, params, context) => notes` の形にする。`context` はテンポ、拍子、スケール、シード値を持つ。ダイアログのプレビューも同じ関数を呼ぶ。

## 元のノートの保存

- 保存先：`storageDirectory/originals.json`
- 中身：出力ノートのハッシュ → `{ original: Note[], savedAt }`
- ハッシュは pitch、startTime、duration、velocity、muted、probability、velocityDeviation、releaseVelocity から作る。`selected` は含めない
- 適用時、現在のノートのハッシュがあればその `original` を元データにする。なければ現在のノートを元データにする
- 件数の上限は 500。超えたら `savedAt` が古い順に消す

## 和音の判定

開始位置が同じ（差が 1/128 拍未満）で 2 音以上あるものを和音とする。和音の最低音をベース、最高音をトップと呼ぶ。

## Groove

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| steps | 16 固定（v1） | – | 1 小節を 16 分で 16 ステップに分ける。3 連グリッドのクリップでは 12 ステップ |
| timing[i] | −50〜+50 % | 0 | ステップ i のノートのずれ（ステップ長に対する %） |
| velocity[i] | −40〜+40 | 拍のアクセント | ステップ i のノートのベロシティ増減 |
| swing | 0〜75 % | 0 | 裏のステップを後ろへずらす。timing 表への上乗せ |
| swing grid | 8 分 / 16 分 | 16 分 | swing をかける細かさ |

velocity の初期値は拍のアクセントにする：1 拍目 +8、3 拍目 +4、2・4 拍目 0、8 分の裏 −4、16 分の裏 −8。

ノートの開始位置から最も近いステップを求め、そのステップの値を当てる。

## Humanize

### タイミング（ADR-0005）

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| drift | 0〜40 ms | 8 | ゆっくりした揺れの大きさ |
| drift return | 0〜1 | 0.3 | 中心へ戻る速さ（Advanced） |
| jitter | 0〜20 ms | 4 | ノートごとのずれの標準偏差 |
| beat weight | 0〜100 % | 50 | 表拍で jitter を弱める割合。拍の頭では jitter × (1 − beat weight)、16 分の裏では jitter × 1 |

Drift は時間に対する平均回帰ランダムウォーク（Ornstein–Uhlenbeck 過程）で、クリップ全体について和音とノートの開始位置（拍）で計算する。ノートの密度に関係なく同じ速さで揺れる。drift return は戻るまでの時定数 τ =0.5 + (1 − drift return) × 8 拍に対応する（初期値 0.3 で約 6 拍）。和音の構成音は同じずれを受ける。開始位置が 0 拍より前になったら 0 にする。

### ベロシティ

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| vel jitter | 0〜30 | 6 | ノートごとのランダムな増減（一様分布 ±） |
| chord balance | 0〜100 % | 40 | 和音のトップを強く、ベースをやや強く、中の音を弱くする度合い。100 % でトップ +12、ベース +6、中の音 −6 |

結果は 1〜127 に収める。

### 長さ

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| legato | 0〜100 % | 0 | 次のノートとの隙間を詰める割合。100 % で次のノートの開始にぴったりつなぐ |
| length jitter | 0〜30 % | 5 | 長さのランダムな増減（元の長さに対する %） |

長さの最小値は 1/64 拍。同じ音程の次のノートと重なる場合は、次のノートの開始で切る。

## Strum（ギターモードのみ、ADR-0006）

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| direction | auto / all down | auto | 向きの決め方 |
| motion | auto / 8 分 / 16 分 | auto | 腕の振りの細かさ。auto は 16 分の裏に和音があれば 16 分 |
| down speed | 0〜120 ms | 30 | ダウンで最初の音から最後の音までの時間 |
| up speed | 0〜120 ms | 20 | アップの同じ時間 |
| speed jitter | 0〜50 % | 15 | 和音ごとの速さの揺れ |
| taper | 0〜30 | 8 | 後から鳴る弦ほどベロシティを下げる量（最後の弦での合計） |
| up skip | 0〜3 本 | 1 | アップで省く低音側の弦の数。省いた音は出力から消える |
| anchor | first / center | first | グリッドに合わせる音 |
| overlap | 0〜20 ms | 5 | 次の和音の開始より後まで前の和音を残す時間 |

- ダウンは低い音から、アップは高い音から鳴らす。弦の番号がノートに付いていれば（v2 のボイシング）その順を使う
- 和音の終わりは揃える。遅れて鳴った音ほど短くする
- 次の和音の開始 + overlap で前の和音を切る
- Strum Down / Up コマンドは、選んだ和音の direction をその和音だけ固定して、ほかのパラメータは前回の設定を使う。固定した向きは元データと一緒に保存し、ダイアログからの再適用でも保つ
- ダイアログの Strum タブでは、プレビューの各和音の上に向き（↓ / ↑）を出す。クリックするたびに 自動 → ダウン固定 → アップ固定 → 自動 と切り替わる。固定した和音の数と、すべて解除する Clear ボタンを Strum タブに置く
- motion が auto のとき、クリップに 16 分の位置の和音が 1 つでもあれば 16 分の振りになり、8 分の裏の和音もダウンになる

## 疑似ペダル（ピアノモードのみ）

| パラメータ | 範囲 | 初期値 | 内容 |
|---|---|---|---|
| pedal | off / bar / chord | off | ノートを伸ばす区間 |

区間の中で始まったノートを、区間の終わりまで伸ばす。chord はベースの音程が変わるところを区間の境目にする。同じ音程が区間の中で再び鳴る場合は、そこで前のノートを切る。

## Connect（v2）

| 対象 | 種類 | パラメータ | 初期値 |
|---|---|---|---|
| ベース | passing（経過音） | 確率 0〜100 % | 30 % |
| ベース | chromatic run | 確率 0〜100 %、段数 1〜4、方向 auto / up / down | 30 %、2、auto |
| トップ | grace（前打音） | 確率 0〜100 %、長さ 1/32 拍〜1/16 拍 | 20 %、1/32 |

- 前のノートの末尾を削って、そこに置く。全体の長さは変えない
- 次の音まで 8 分未満のときは入れない。段数ぶんの余裕がなければ入る段数まで減らす
- 経過音はスケール（`Song.rootNote`、`Song.scaleIntervals`）から選ぶ。Scale Mode がオフのときは経過音を出さず、chromatic run だけにする

## ギターボイシング（v2）

- 1 本の弦に 1 音、押さえる範囲は 4 フレット以内、開放弦を使ってよい
- ベースとトップの音程はできるだけ保つ
- 前の和音のフォームとの手の移動が小さい候補を選ぶ
- チューニングのプリセット：Standard、Drop D、カポ（0〜7）
- 出力ノートに弦の番号を付け、Strum が使う

## プリセット

| モード | 名前 | 主な値 |
|---|---|---|
| Guitar | Acoustic Strum | motion 8 分、down 30 ms、drift 12 ms |
| Guitar | Funk 16 | motion 16 分、down 12 ms、up 10 ms、up skip 2、legato 0 |
| Guitar | Ballad Arp | down 70 ms、up 50 ms、legato 80 % |
| Piano | Ballad | pedal chord、chord balance 70 %、drift 14 ms |
| Piano | Pop Tight | jitter 2 ms、groove のアクセントを 1.5 倍、pedal off |
| 共通 | Subtle | すべての量を初期値の半分 |

ユーザープリセットは `storageDirectory/presets.json` に保存する。Re-apply は最後に使った設定を `storageDirectory/last.json` から読み、シード値だけ新しくする。

## UI（ADR-0008〜0011）

### 右クリックメニュー（MidiClip）

`humino…`、`humino: Re-apply`、`humino: Strum Down`、`humino: Strum Up`

### ダイアログ（760 × 520 px）

```
┌──────────────────────────────────────────────────────────┐
│ humino   [Guitar|Piano]   Acoustic Strum ◂▸  ☰   seed 042 ⟳ │ ヘッダー
├──────────────────────────────────────────────────────────┤
│   プレビュー（ミニピアノロール、Drift の曲線）              │
├──────────────────────────────────────────────────────────┤
│  groove   humanize   strum   connect                      │ タブ
├──────────────────────────────────────────────────────────┤
│  drift     jitter     legato     vel ±     chord bal      │ パラメータ
│  12.0ms    4.0ms      60%        8         40%            │
├──────────────────────────────────────────────────────────┤
│  12 notes selected                  [ Cancel ]  [ Apply ]  │ フッター
└──────────────────────────────────────────────────────────┘
```

- パラメータは「ラベル（小）＋ 数字（大）＋ 小さなグラフ」。数字の上下ドラッグで変え、Shift で細かく、ダブルクリックで初期値に戻す
- Groove タブはパラメータ列の代わりに 16 本のステップ表を置く（上半分が timing、下半分が velocity）
- モードで使えないタブやパラメータは隠さずグレーにする（ギターモードの pedal、ピアノモードの strum）
- 詳細な設定は Advanced として折りたたむ
- ツールチップの説明文だけ、`Environment.language` が `"JA"` なら日本語

### プレビュー

- 元のノートをグレーの輪郭、結果のノートを白っぽい色で描く
- 開いているタブの処理で開始位置、長さ、ベロシティのどれかが変わったノートは、その処理の色で塗る（Strum タブは疑似ペダルの変化も含む）
- 元の位置からのずれを、処理ごとの色の線で積み重ねて描く。開いているタブの処理だけ濃くする
- Connect で足したノートはスカイ色で描く
- 処理対象でないノートは暗く描く

### 配色トークン

```css
:root {
  --bg: #121212;
  --surface: #1a1a1a;
  --line: #2a2a2a;
  --muted: #5e5e5e;      /* 線と面だけ。文字には使わない */
  --text-dim: #8a8a8a;   /* 灰色の文字 */
  --text: #d0d0d0;
  --accent: #e8a55a;
  --stage-groove: #e07a6b;
  --stage-humanize: #e8a55a;
  --stage-strum: #8fb98a;
  --stage-connect: #7fa7d9;
}
```

### 文字

```css
:root {
  --font: "Allo", system-ui, sans-serif;
  font-variation-settings: "ROND" 0;
  font-optical-sizing: auto;
  font-variant-numeric: tabular-nums;
}
.value { font-size: 28px; font-weight: 250; }
.label { font-size: 12px; font-weight: 350; }
.tab   { font-size: 13px; font-weight: 350; }
.tab[aria-selected="true"] { font-weight: 450; }
```

## 未決事項

- 4/4 以外の拍子での Groove のステップ数とアクセント
- ダイアログへのノートの受け渡しは `data:` URL に決めた（フォント込みで約 650KB）。Live で開く速さは未確認
- Allo の数字が tabular-nums に対応しているか
