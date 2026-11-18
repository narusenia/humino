# humino

An Ableton Live Extension that makes programmed guitar and piano MIDI sound played. It rewrites the notes of a MIDI clip, adding human variation to timing, velocity, note length and guitar strums.

Early development. Tested on macOS; Windows is untested.

## Requirements

- Ableton Live 12 Suite
- Live 12.4.5 beta or later (the Extensions SDK beta)

## Install

Download `humino.ablx` from Releases and drop it onto the Extensions page in Live's settings.

## Usage

Right-click a MIDI clip and choose:

| Menu | What it does |
|---|---|
| `humino…` | Opens the dialog. Set things up in the Groove, Humanize, Strum and Connect tabs, compare before and after in the preview, then apply |
| `humino: Re-apply` | Applies the last settings again with a new seed |
| `humino: Strum Down` | Makes the selected chords downstrokes |
| `humino: Strum Up` | Makes the selected chords upstrokes |

With notes selected, only those notes and the rest of their chords are processed; otherwise the whole clip.

Every apply starts again from the original notes, so the variation never piles up. One undo reverts an apply.

## MIDI Tools version

`humino.amxd` is a MIDI Transformation for Live 12 Suite (Max for Live). It works on the notes selected in the piano roll and re-applies as you turn its dials, so you can listen while adjusting.

Put `humino.amxd` in `User Library/MIDI Tools/Max Transformations/`, then pick humino in the Transform tab of the clip view. The panel has Mode, a preset menu, Drift, Jitter, Spread, Vel ±, Swing, Strum and Legato. The groove table, the other parameters and hand edits are only in the Extension.

## Features

### v1

- **Groove**: a 16-step table of timing and velocity offsets, plus swing.
- **Humanize**: slow timing drift and per-chord jitter in ms, spread that offsets each note of a chord on its own, velocity jitter, chord balance, legato and length jitter.
- **Strum** (guitar): down and up strokes follow a hand moving in 8ths or 16ths; upstrokes skip low strings; speed in ms.
- **Pseudo pedal** (piano): sustains notes per bar or per chord. The Extensions SDK cannot write CC64, so note lengths stand in for it.

### v2 (planned)

- **Connect**: passing tones, chromatic runs (1–4 notes) and grace notes.
- **Guitar voicing**: rearranges chords into shapes a guitarist can actually play (standard, Drop D, capo).
- Extract a groove from another clip.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. The bundled Allo typeface is licensed under the SIL Open Font License 1.1.

humino is an unofficial project and is not affiliated with Ableton AG.
