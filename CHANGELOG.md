# Changelog

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
