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
| `humino…` | Opens the dialog. Set things up in the Groove, Humanize, Strum and Connect tabs, compare before and after in the preview, then apply. The dot left of a tab name turns that stage on or off |
| `humino: Re-apply` | Applies the last settings again with a new seed |
| `humino: Strum Down` | Makes the selected chords downstrokes |
| `humino: Strum Up` | Makes the selected chords upstrokes |
| `humino: Extract Groove` | Takes the feel of the clip (per-step timing and velocity offsets) and keeps it; open the dialog on another clip and load it in the Groove tab |

With notes selected, only those notes and the rest of their chords are processed; otherwise the whole clip.

Every apply starts again from the original notes, so the variation never piles up. One undo reverts an apply.

## MIDI Tools version

`humino.amxd` is a MIDI Transformation for Live 12 Suite (Max for Live). It works on the notes selected in the piano roll and re-applies as you turn its dials, so you can listen while adjusting.

Download `humino.amxd` from Releases, put it in `User Library/MIDI Tools/Max Transformations/`, then pick humino in the Transform tab of the clip view. The panel has a page tab and Mode on top and four pages: Hum (drift, jitter, spread, velocity, length, legato), Feel (swing, beat weight, chord balance, drift return, chord window, swing grid, pedal), Str (speeds, speed variation, taper, up skip, overlap, direction, motion, anchor, guitar voicing with tuning and capo) and Con (runs, passing tones, grace notes). Like Live's own MIDI Tools, each page shows its values as text over a picture of an example phrase run through humino: drag a value up or down to change it. Each kind of Connect note has its own switch (click its name) and velocity, and stays off until you switch it on. Values the current mode does not use are dimmed. Hover a control to read what it does in Live's Info View. The 16-step groove table and hand edits are only in the Extension.

There is also one device per stage: `humino Guitar Voicing`, `humino Humanize`, `humino Swing`, `humino Strum`, `humino Pedal` and `humino Connect`. Each one does only its own stage, so you can run them one after another. Run Guitar Voicing first and Connect before Strum: strummed chords no longer start together and are not read as chords.

## Features

### v1

- **Groove**: a 16-step table of timing and velocity offsets, plus swing.
- **Humanize**: slow timing drift and per-chord jitter in ms, spread that offsets each note of a chord on its own, velocity jitter, chord balance, legato and length jitter.
- **Strum** (guitar): down and up strokes follow a hand moving in 8ths or 16ths; upstrokes skip low strings; speed in ms.
- **Pseudo pedal** (piano): sustains notes per bar or per chord. The Extensions SDK cannot write CC64, so note lengths stand in for it.

### v2

- **Connect**: passing tones, runs (1–6 notes, through the scale or by semitones) and grace notes between chords. Passing tones and in-scale steps need Live's Scale Mode.
- **Chord names** in the dialog's preview, with the degree (I, vi, V7…) when Live's Scale Mode is on. The chord window in the header sets how close together notes must start to count as one chord.
- **Guitar voicing** (guitar): rewrites each chord as a shape a guitarist can play, one note per string (standard or Drop D, capo 0–7), and Strum then plays it string by string. In the Strum tab of the dialog, on the Str page, and as its own device.
- **Groove extraction**: take the per-step timing and velocity offsets from a played clip and load them into another clip's groove table (Extension only).
- **Stage on / off**: switch Groove, Humanize or Strum off without losing its values (Extension).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. The bundled Allo typeface is licensed under the SIL Open Font License 1.1.

humino is an unofficial project and is not affiliated with Ableton AG.
