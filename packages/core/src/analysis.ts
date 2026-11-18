// SPDX-License-Identifier: MIT

import type { Note } from "./types.js";

/** Notes starting closer than this are one chord (design.md). */
export const CHORD_EPS = 1 / 128;

export const msToBeats = (ms: number, tempo: number) => (ms * tempo) / 60000;

const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-3;

/**
 * Metric level of a position: 0 bar downbeat, 1 beat 3 (4/4), 2 other beats,
 * 3 off-beat 8th (or triplet), 4 anything finer.
 */
export function metricLevel(start: number, beatsPerBar: number, triplet: boolean): number {
  const b = ((start % beatsPerBar) + beatsPerBar) % beatsPerBar;
  if (near(b)) {
    const k = Math.round(b) % beatsPerBar;
    if (k === 0) return 0;
    return beatsPerBar === 4 && k === 2 ? 1 : 2;
  }
  return near(b * (triplet ? 3 : 2)) ? 3 : 4;
}

export type Group = {
  /** Start of the group in the analysed (original) notes. */
  start: number;
  /** Note indices, sorted by pitch ascending. */
  idx: number[];
  level: number;
  /** Groove step within the bar (0..15, or 0..11 for triplet clips). */
  step: number;
};

export type Analysis = {
  groups: Group[];
  /** Group index of each note. */
  groupOf: number[];
  triplet: boolean;
  stepsPerBeat: number;
  beatsPerBar: number;
};

export function analyze(notes: readonly Note[], beatsPerBar = 4): Analysis {
  // Majority vote, so one triplet fill does not turn a straight clip (and its swing) off.
  const tripletOnly = notes.filter((n) => !near(n.startTime * 4) && near(n.startTime * 6)).length;
  const straightOnly = notes.filter((n) => near(n.startTime * 4) && !near(n.startTime * 3)).length;
  const triplet = tripletOnly > straightOnly;
  const stepsPerBeat = triplet ? 3 : 4;
  // shortcut: one bar of steps assumes 4/4, revisit with other meters (design.md 未決事項)
  const stepsPerBar = stepsPerBeat * 4;
  const order = notes.map((_, i) => i).sort((a, b) => notes[a]!.startTime - notes[b]!.startTime);
  const groups: Group[] = [];
  const groupOf: number[] = new Array(notes.length);
  for (const i of order) {
    const start = notes[i]!.startTime;
    let g = groups[groups.length - 1];
    if (!g || start - g.start >= CHORD_EPS) {
      g = {
        start,
        idx: [],
        level: metricLevel(start, beatsPerBar, triplet),
        step: ((Math.round(start * stepsPerBeat) % stepsPerBar) + stepsPerBar) % stepsPerBar,
      };
      groups.push(g);
    }
    g.idx.push(i);
    groupOf[i] = groups.length - 1;
  }
  for (const g of groups) g.idx.sort((a, b) => notes[a]!.pitch - notes[b]!.pitch);
  return { groups, groupOf, triplet, stepsPerBeat, beatsPerBar };
}

/** Groups to process: those holding a selected note, or all when nothing is selected (ADR-0007). */
export function targetGroups(notes: readonly Note[], a: Analysis): boolean[] {
  const any = notes.some((n) => n.selected);
  return a.groups.map((g) => !any || g.idx.some((i) => notes[i]!.selected));
}
