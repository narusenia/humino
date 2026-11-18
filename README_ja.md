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

Releases から `humino.amxd` をダウンロードし、`User Library/MIDI Tools/Max Transformations/` に置き、クリップビューの Transform タブで humino を選びます。パネルの上のタブで 4 つのページを切り替えます。Mode もその横にあり、プリセットは Hum ページの下にあります。Hum は揺れ、Spread、ベロシティ、ノート長、レガート、Feel は Swing、Beat Weight、Chord Balance、Drift Return、Chord Window、Swing Grid、ペダル、Str はストロークの速さと揺れ、Taper、Up Skip、Overlap、向き、Motion、Anchor、ギターボイシング（チューニングとカポ）、Con は Run、経過音、前打音です。Live 標準の MIDI Tools と同じように、値は文字で並び、その下に例のフレーズを humino に通した絵が出ます。値は上下にドラッグして変えます。Connect の 3 種類はそれぞれスイッチ（名前をクリック）とベロシティを持ち、オンにするまで何もしません。今のモードで使わない値は暗くなります。Groove の 16 ステップの表と手での修正は Extension 版だけで使えます。

処理ごとに分けたデバイスもあります。`humino Guitar Voicing`、`humino Humanize`、`humino Swing`、`humino Strum`、`humino Pedal`、`humino Connect` の 6 つで、それぞれ自分の処理だけをかけるので、続けてかけられます。Guitar Voicing は最初に、Connect は Strum より先にかけてください。ストロークをかけた和音は音の頭がそろわないので、和音として読めません。

## 機能

### v1

- **Groove**：16 ステップの表で、ステップごとのタイミングとベロシティのずれを決めます。Swing も使えます。
- **Humanize**：ゆっくりしたタイミングの揺れ（Drift）と和音ごとのずれ（Jitter）を ms で指定します。Spread で和音の音を 1 つずつずらすこともでき、0 にすると和音はそろって動きます。ベロシティの揺れ、和音の中の音量バランス、レガート、ノート長の揺れも調整できます。
- **Strum**（ギター）：8 分か 16 分で振り続ける腕の動きに合わせて、ダウンとアップを自動で決めます。アップでは低音弦を省きます。速さは ms で指定します。
- **疑似ペダル**（ピアノ）：小節ごと、またはコードごとにノートを伸ばします。Extensions SDK では CC64 を書けないため、ノートの長さで代わりにします。

### v2

- **Connect**：和音と和音のあいだに、経過音、次のベースへ近づく Run（1〜6 音、スケール音か半音ずつ）、前打音を足します。経過音とスケール音で進む設定には Live の Scale Mode が要ります。
- **コード名**：ダイアログのプレビューに和音のコード名を出します。Live の Scale Mode がオンなら、ディグリー（I、vi、V7 など）も添えます。ヘッダーの chord window で、どこまで音の頭がずれていても 1 つの和音とみなすかを決めます。
- **ギターボイシング**（ギター）：和音をギターで押さえられる形（1 弦に 1 音）に置き換え、Strum が弦の順に鳴らします。チューニングは Standard と Drop D、カポは 0〜7 です。ダイアログの Strum タブ、Str ページ、単体のデバイスで使えます。
- 別のクリップから Groove を抜き出します（予定）。

## 開発

[CONTRIBUTING_ja.md](CONTRIBUTING_ja.md) を見てください。

## ライセンス

MIT です。同梱している Allo フォントは SIL Open Font License 1.1 です。

humino は非公式のプロジェクトで、Ableton AG とは関係ありません。
