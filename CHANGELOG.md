# Changelog

## 0.3.0 (2026-11-19)

- Connect: passing tones, runs into the next bass note (1–6 notes, through Live's scale or by semitones) and grace notes climbing into the top note. Each kind has its own switch, chance and velocity, and stays off until you switch it on. Passing tones and in-scale steps need Live's Scale Mode
- Guitar voicing (guitar mode): rewrites each chord as a playable shape, one note per string (standard or Drop D, capo 0–7), and Strum plays it string by string
- Groove extraction: right-click a played clip → `humino: Extract Groove`, then load its per-step timing and velocity in another clip's Groove tab
- Chord window: notes starting within 0–50 ms of each other count as one chord, so slightly off-grid chords are still chords
- Dialog: chord names and degrees over the preview, a piano keyboard beside the rows, an on / off dot for Groove, Humanize and Strum on each tab; controls the current mode does not use are hidden
- MIDI Tools: every page is drawn as a picture of an example phrase with draggable values, plus one device per stage (`humino Guitar Voicing`, `humino Humanize`, `humino Swing`, `humino Strum`, `humino Pedal`, `humino Connect`) in `humino-midi-tools.zip`
- Settings saved by 0.2.0 get the new fields filled with defaults

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
