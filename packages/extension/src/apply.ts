// SPDX-License-Identifier: MIT

import type { MidiClip, NoteDescription } from "@ableton-extensions/sdk";
import { analyze, chordKey, hashNotes, process, targetGroups, type Direction, type Note, type Overrides, type Params, type Scale } from "@humino/core";
import type { Store } from "./store.js";

export const newSeed = () => Math.floor(Math.random() * 1000);

/** What the dialog and the commands need to know about a clip before applying. */
export type ClipState = {
  /** Notes to process: the stored original, with the clip's current selection mapped onto it. */
  original: Note[];
  overrides: Overrides;
  tempo: number;
  clipEnd: number;
  scale?: Scale;
};

/** core's `string` is internal; the SDK must not receive unknown fields. */
const toSdk = ({ string: _string, ...n }: Note): NoteDescription => n;

/**
 * Map the current selection onto the original notes: same pitch, nearest start
 * within a quarter beat. Chords are widened later anyway (ADR-0007).
 */
function carrySelection(current: readonly Note[], original: Note[]): Note[] {
  const out = original.map((n) => ({ ...n, selected: false }));
  for (const c of current) {
    if (!c.selected) continue;
    let best = -1;
    let bestDist = 0.25;
    out.forEach((o, j) => {
      const d = Math.abs(o.startTime - c.startTime);
      if (o.pitch === c.pitch && d <= bestDist) [best, bestDist] = [j, d];
    });
    if (best >= 0) out[best]!.selected = true;
  }
  return out;
}

export function readClip(clip: MidiClip<"1.0.0">, tempo: number, scale: Scale | undefined, store: Store): ClipState {
  const current: Note[] = clip.notes;
  const entry = store.original(hashNotes(current));
  return {
    original: entry ? carrySelection(current, entry.original) : current.map((n) => ({ ...n })),
    overrides: entry?.overrides ?? fromForced(entry?.forced),
    tempo,
    clipEnd: clip.looping ? clip.loopEnd : clip.endMarker,
    ...(scale && { scale }),
  };
}

const fromForced = (forced: Record<string, Direction> = {}): Overrides => ({
  chords: Object.fromEntries(Object.entries(forced).map(([k, direction]) => [k, { direction }])),
});

/** Strum Down / Up: fix the direction of the targeted chords. */
export function forceDirection(state: ClipState, dir: Direction): Overrides {
  const a = analyze(state.original);
  const target = targetGroups(state.original, a);
  const chords = { ...state.overrides.chords };
  a.groups.forEach((g, gi) => {
    const key = chordKey(g.start);
    if (target[gi] && g.idx.length >= 2) chords[key] = { ...chords[key], direction: dir };
  });
  return { ...state.overrides, chords };
}

export function applyToClip(
  clip: MidiClip<"1.0.0">,
  state: ClipState,
  params: Params,
  seed: number,
  store: Store,
  transaction: (fn: () => void) => void,
) {
  const overrides = state.overrides;
  const result = process(state.original, params, { tempo: state.tempo, seed, clipEnd: state.clipEnd, ...(state.scale && { scale: state.scale }) }, overrides);
  transaction(() => {
    clip.notes = result.notes.map(toSdk);
  });
  store.saveOriginal(hashNotes(result.notes), {
    original: state.original.map(({ selected: _s, ...n }) => n),
    savedAt: Date.now(),
    overrides,
  });
  store.saveLast({ params, seed });
}
