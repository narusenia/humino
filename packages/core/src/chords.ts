// SPDX-License-Identifier: MIT

import type { Scale } from "./connect.js";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** Chord shapes as pitch classes over the root, most common first; `fifth` may be left out. */
const SHAPES: [suffix: string, pcs: number[], minor: boolean][] = [
  ["", [0, 4, 7], false],
  ["m", [0, 3, 7], true],
  ["7", [0, 4, 7, 10], false],
  ["maj7", [0, 4, 7, 11], false],
  ["m7", [0, 3, 7, 10], true],
  ["5", [0, 7], false],
  ["sus4", [0, 5, 7], false],
  ["sus2", [0, 2, 7], false],
  ["7sus4", [0, 5, 7, 10], false],
  ["6", [0, 4, 7, 9], false],
  ["m6", [0, 3, 7, 9], true],
  ["add9", [0, 2, 4, 7], false],
  ["madd9", [0, 2, 3, 7], true],
  ["9", [0, 2, 4, 7, 10], false],
  ["maj9", [0, 2, 4, 7, 11], false],
  ["m9", [0, 2, 3, 7, 10], true],
  ["dim", [0, 3, 6], true],
  ["m7b5", [0, 3, 6, 10], true],
  ["dim7", [0, 3, 6, 9], true],
  ["aug", [0, 4, 8], false],
  ["mMaj7", [0, 3, 7, 11], true],
];

export type ChordName = {
  root: number;
  /** "", "m", "7", "maj7", "m7b5", … */
  suffix: string;
  /** Pitch class of the lowest note when it is not the root (slash chord). */
  bass?: number;
  minor: boolean;
};

const same = (a: number[], b: Set<number>) => a.length === b.size && a.every((x) => b.has(x));

/**
 * Names the chord made by `pitches` (MIDI notes), or undefined when no known shape fits.
 * Roots are tried from the lowest note up, so C/E only comes out when nothing has E as its root.
 */
export function nameChord(pitches: readonly number[]): ChordName | undefined {
  if (pitches.length < 2) return undefined;
  const sorted = [...pitches].sort((a, b) => a - b);
  const pcs = new Set(sorted.map((p) => ((p % 12) + 12) % 12));
  if (pcs.size < 2) return undefined;
  const bass = sorted[0]! % 12;
  const roots = [bass, ...[...pcs].filter((pc) => pc !== bass)];
  for (const root of roots) {
    const rel = new Set([...pcs].map((pc) => (pc - root + 12) % 12));
    for (const [suffix, shape, minor] of SHAPES) {
      // full shape, or the shape without its fifth (common in voicings)
      const no5 = shape.filter((x) => x !== 7);
      if (same(shape, rel) || (shape.length > 3 && shape.includes(7) && same(no5, rel))) {
        return { root, suffix, minor, ...(root !== bass && { bass }) };
      }
    }
  }
  return undefined;
}

export const chordLabel = (c: ChordName) => `${NAMES[c.root]}${c.suffix}${c.bass !== undefined ? `/${NAMES[c.bass]}` : ""}`;

const NUMERALS = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];
const DEGREE_SUFFIX: Record<string, string> = { m: "", dim: "°", m7b5: "ø7", dim7: "°7", aug: "+", "5": "" };

/** Roman numeral against Live's scale root: vi for Am in C, V7 for G7, bVII for Bb. */
export function degree(c: ChordName, scale: Scale): string {
  const n = NUMERALS[(c.root - scale.root + 12) % 12]!;
  const numeral = c.minor ? n.replace(/[IV]+/, (m) => m.toLowerCase()) : n;
  const suffix = DEGREE_SUFFIX[c.suffix] ?? c.suffix.replace(/^m(?!aj)/, "");
  return numeral + suffix;
}
