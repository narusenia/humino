// SPDX-License-Identifier: MIT

import { analyze, targetGroups } from "./analysis.js";
import type { Note } from "./types.js";

export type Tuning = "standard" | "dropd";

export type VoicingParams = {
  /** Off by default: voicing rewrites pitches, so it only runs when asked for. */
  on: boolean;
  tuning: Tuning;
  /** 0..7 */
  capo: number;
};

export const DEFAULT_VOICING: VoicingParams = { on: false, tuning: "standard", capo: 0 };

/** Open strings, low to high. */
const TUNINGS: Record<Tuning, number[]> = {
  standard: [40, 45, 50, 55, 59, 64],
  dropd: [38, 45, 50, 55, 59, 64],
};

/** Frets the hand covers (4 frets: lowest fretted to highest is at most 3 apart). */
const SPAN = 3;
const MAX_POSITION = 12;

type Shape = { frets: (number | null)[]; score: number; position: number };

const pc = (p: number) => ((p % 12) + 12) % 12;

/**
 * Best playable shape for one chord: one note per string, muted strings only at the
 * edges, no two strings on the same pitch, the lowest sounding note on the chord's bass pitch class, every pitch class
 * of the chord sounding (one may go when the chord has five or more). Scored on how
 * far the top and bass move, how far the hand moves from `prev`, and how full it is.
 */
function bestShape(pitches: number[], open: number[], prev: number | undefined): Shape | undefined {
  const pcs = new Set(pitches.map(pc));
  const bass = Math.min(...pitches);
  const top = Math.max(...pitches);
  let best: Shape | undefined;
  for (let pos = 1; pos <= MAX_POSITION; pos++) {
    // each string: muted, open, or a fret in the window that plays a chord tone
    const options = open.map((o) => {
      const fr: (number | null)[] = [null];
      for (const f of [0, ...Array.from({ length: SPAN + 1 }, (_, k) => pos + k)]) if (pcs.has(pc(o + f))) fr.push(f);
      return fr;
    });
    const frets: (number | null)[] = new Array(open.length).fill(null);
    const walk = (s: number) => {
      if (s === open.length) return consider(frets.slice(), pos);
      for (const f of options[s]!) {
        frets[s] = f;
        walk(s + 1);
      }
    };
    const consider = (fs: (number | null)[], p: number) => {
      const sounding = fs.map((f, s) => (f === null ? null : open[s]! + f));
      const first = sounding.findIndex((x) => x !== null);
      if (first < 0) return;
      let last = sounding.length - 1;
      while (sounding[last] === null) last--;
      if (sounding.slice(first, last + 1).some((x) => x === null)) return; // inner mute: not strummable
      const notes = sounding.filter((x): x is number => x !== null);
      if (notes.length < Math.min(3, pitches.length)) return;
      if (new Set(notes).size < notes.length) return; // a MIDI unison: one note would cut the other off
      if (pc(notes[0]!) !== pc(bass)) return;
      const have = new Set(notes.map(pc));
      const missing = [...pcs].filter((x) => !have.has(x)).length;
      if (missing > (pcs.size >= 5 ? 1 : 0)) return;
      const fretted = fs.filter((f): f is number => f !== null && f > 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > SPAN) return;
      const position = fretted.length ? Math.min(...fretted) : 0;
      const score =
        3 * Math.abs(Math.max(...notes) - top) +
        1 * Math.abs(notes[0]! - bass) +
        (prev === undefined ? 0.2 * position : 1.5 * Math.abs(position - prev)) +
        0.5 * span -
        1.2 * notes.length;
      if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && p < best.position)) best = { frets: fs, score, position };
    };
    walk(0);
  }
  return best;
}

/**
 * Rewrites each targeted chord (2 notes or more) as a guitar shape and tags every voiced
 * note with its string (1 = high E). Single notes and chords with no playable shape stay
 * as they are. Each voiced note takes length, velocity and the other fields from the
 * input note nearest in pitch. Returns new notes; `notes` is not modified.
 */
/** Open strings low to high with the capo on: a voiced note's fret is its pitch minus its string's entry here. */
export const openStrings = (p: VoicingParams) => TUNINGS[p.tuning].map((o) => o + Math.max(0, Math.min(7, Math.round(p.capo))));

export function voice(notes: readonly Note[], p: VoicingParams, window?: number): Note[] {
  const open = openStrings(p);
  const a = analyze(notes, 4, window);
  const target = targetGroups(notes, a);
  const out: Note[] = [];
  let prev: number | undefined;
  a.groups.forEach((g, gi) => {
    const group = g.idx.map((i) => notes[i]!);
    const shape = target[gi] && group.length >= 2 ? bestShape(group.map((n) => n.pitch), open, prev) : undefined;
    if (!shape) {
      out.push(...group.map((n) => ({ ...n })));
      return;
    }
    prev = shape.position;
    const start = Math.min(...group.map((n) => n.startTime));
    shape.frets.forEach((f, s) => {
      if (f === null) return;
      const pitch = open[s]! + f;
      const near = group.reduce((x, y) => (Math.abs(y.pitch - pitch) < Math.abs(x.pitch - pitch) ? y : x));
      out.push({ ...near, pitch, startTime: start, string: open.length - s });
    });
  });
  return out;
}
