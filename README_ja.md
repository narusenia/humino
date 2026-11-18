# humino

打ち込んだギターやピアノの MIDI を人が弾いたように聞こえる形に直す Ableton Live の Extension です。MIDI クリップのノートを書き換えて、タイミング、ベロシティ、ノート長、ギターのストロークに人の揺れを加えます。

開発初期の段階です。macOS で動作を確認しています。Windows では確認していません。

## 必要な環境

- Ableton Live 12 Suite
- Live 12.4.5 ベータ以降（Extensions SDK のベータに対応した版）

## インストール

Releases から `humino.ablx` をダウンロードし、Live の設定の Extensions ページへドロップします。

## 使い方

MIDI クリップを右クリックして、次のどれかを選びます。

| メニュー | 動作 |
|---|---|
| `humino…` | ダイアログを開きます。Groove、Humanize、Strum、Connect のタブで設定し、適用前と適用後をプレビューで見比べてから適用します |
| `humino: Re-apply` | 前回の設定のまま、シード値だけ変えて適用します |
| `humino: Strum Down` | 選んだ和音をダウンストロークにします |
| `humino: Strum Up` | 選んだ和音をアップストロークにします |

ノートを選んでいる時は、選んだノートと、それと同じ和音の音だけを処理します。選んでいない時はクリップ全体を処理します。

何度適用しても、毎回元のノートから処理し直すので、揺れが積み重なりません。適用は 1 回の取り消しで元に戻せます。

## MIDI Tools 版

`humino.amxd` は Live 12 Suite の MIDI Tools で使う Transformation（Max for Live）です。ピアノロールで選んだノートにかかり、つまみを回すとその場でかけ直すので、聴きながら調整できます。

`humino.amxd` を `User Library/MIDI Tools/Max Transformations/` に置き、クリップビューの Transform タブで humino を選びます。パネルの上に Mode とプリセットがあり、その下を 3 つのページで切り替えます。Hum は揺れ、Spread、ベロシティ、ノート長、レガート、Feel は Swing、Swing Grid、Beat Weight、Chord Balance、Drift Return、ペダル、Strum はストロークの速さと揺れ、Taper、Up Skip、Overlap、向き、Motion、Anchor です。Groove の 16 ステップの表と手での修正は Extension 版だけで使えます。

## 機能

### v1

- **Groove**：16 ステップの表で、ステップごとのタイミングとベロシティのずれを決めます。Swing も使えます。
- **Humanize**：ゆっくりしたタイミングの揺れ（Drift）と和音ごとのずれ（Jitter）を ms で指定します。Spread で和音の音を 1 つずつずらすこともでき、0 にすると和音はそろって動きます。ベロシティの揺れ、和音の中の音量バランス、レガート、ノート長の揺れも調整できます。
- **Strum**（ギター）：8 分か 16 分で振り続ける腕の動きに合わせて、ダウンとアップを自動で決めます。アップでは低音弦を省きます。速さは ms で指定します。
- **疑似ペダル**（ピアノ）：小節ごと、またはコードごとにノートを伸ばします。Extensions SDK では CC64 を書けないため、ノートの長さで代わりにします。

### v2（予定）

- **Connect**：経過音、半音ずつ進む Chromatic Run（1〜4 音）、前打音を足します。
- **ギターボイシング**：和音をギターで実際に押さえられる形に並べ替えます。チューニングは Standard、Drop D、カポを選べます。
- 別のクリップから Groove を抜き出します。

## 開発

[CONTRIBUTING_ja.md](CONTRIBUTING_ja.md) を見てください。

## ライセンス

MIT です。同梱している Allo フォントは SIL Open Font License 1.1 です。

humino は非公式のプロジェクトで、Ableton AG とは関係ありません。
