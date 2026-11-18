// SPDX-License-Identifier: MIT

import type { MidiClip, NoteDescription } from "@ableton-extensions/sdk";
import { analyze, chordKey, hashNotes, process, targetGroups, type Direction, type Note, type Params } from "@humino/core";
import type { Store } from "./store.js";

export const newSeed = () => Math.floor(Math.random() * 1000);

/** What the dialog and the commands need to know about a clip before applying. */
export type ClipState = {
  /** Notes to process: the stored original, with the clip's current selection mapped onto it. */
  original: Note[];
  forced: Record<string, Direction>;
  tempo: number;
  clipEnd: number;
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

export function readClip(clip: MidiClip<"1.0.0">, tempo: number, store: Store): ClipState {
  const current: Note[] = clip.notes;
  const entry = store.original(hashNotes(current));
  return {
    original: entry ? carrySelection(current, entry.original) : current.map((n) => ({ ...n })),
    forced: entry?.forced ?? {},
    tempo,
    clipEnd: clip.looping ? clip.loopEnd : clip.endMarker,
  };
}

/** Strum Down / Up: fix the direction of the targeted chords. */
export function forceDirection(state: ClipState, dir: Direction): Record<string, Direction> {
  const a = analyze(state.original);
  const target = targetGroups(state.original, a);
  const forced = { ...state.forced };
  a.groups.forEach((g, gi) => {
    if (target[gi] && g.idx.length >= 2) forced[chordKey(g.start)] = dir;
  });
  return forced;
}

export function applyToClip(
  clip: MidiClip<"1.0.0">,
  state: ClipState,
  params: Params,
  seed: number,
  store: Store,
  transaction: (fn: () => void) => void,
) {
  const forced = state.forced;
  const result = process(state.original, { ...params, strum: { ...params.strum, forced } }, {
    tempo: state.tempo,
    seed,
    clipEnd: state.clipEnd,
  });
  transaction(() => {
    clip.notes = result.notes.map(toSdk);
  });
  store.saveOriginal(hashNotes(result.notes), {
    original: state.original.map(({ selected: _s, ...n }) => n),
    savedAt: Date.now(),
    forced,
  });
  store.saveLast({ params, seed });
}
