# Changelog

## 0.2.0 (2026-11-19)

- MIDI Tools version: `humino.amxd`, a MIDI Transformation for Live 12 Suite. Works on the notes selected in the piano roll and re-applies as you turn its dials. Three pages (Hum, Feel, Strum) cover every parameter except the 16-step groove table
- Humanize: new `spread` offsets each note of a chord on its own (0 moves the chord as one)
- Strum: only notes the next stroke plays again are cut, so held chord tones keep ringing; upstrokes keep a missed low string ringing from the previous stroke instead of deleting it
- Groove: a few triplet notes no longer turn a straight clip into a triplet one, which had switched swing off
- Settings saved by 0.1.0 get the new fields filled with defaults

## 0.1.0 (2026-11-19)

First release. Requires Ableton Live 12 Suite with the Extensions SDK beta (12.4.5 or later). Tested on macOS.

- Right-click a MIDI clip: `humino…`, `humino: Re-apply`, `humino: Strum Down`, `humino: Strum Up`
- Groove: 16-step timing and velocity table, swing
- Humanize: time-based drift, jitter weighted by beat, velocity jitter, chord balance, legato, length jitter
- Strum (guitar mode): down / up from the strumming hand's 8th or 16th motion, speed in ms, taper, upstroke string skip, centre or first-string anchor
- Pseudo sustain pedal (piano mode): per bar or per chord
- Every apply starts from the original notes; one undo reverts it
- Dialog with a piano-roll preview: per-stage colours, zoom, pitch folding, note names and bar numbers, velocity lane, hover details
- Hand edits in the preview: select, lock, nudge, velocity, per-chord stroke direction, speed and up skip; undo / redo inside the dialog
- Presets: 6 factory presets, Init, save and delete your own
