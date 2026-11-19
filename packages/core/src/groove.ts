// SPDX-License-Identifier: MIT

import { analyze, metricLevel, type Analysis } from "./analysis.js";
import { clampVelocity, DEFAULT_VELOCITY, type Note } from "./types.js";

export type GrooveParams = {
  /** Off skips the stage; on by default, so settings saved before the switch keep working. */
  on: boolean;
  /** Per-step timing offset, % of a step (-50..50). 16 entries; triplet clips use the first 12. */
  timing: number[];
  /** Per-step velocity offset (-40..40). */
  velocity: number[];
  /** 0..75 %, pushes off-beat steps later. */
  swing: number;
  swingGrid: 8 | 16;
};

/** Accent by metric level: downbeat, beat 3, other beats, 8th off-beat, 16th off-beat. */
const LEVEL_ACCENT = [8, 4, 0, -4, -8];

export const defaultGrooveVelocity = () =>
  Array.from({ length: 16 }, (_, s) => LEVEL_ACCENT[metricLevel(s / 4, 4, false)]!);

export const DEFAULT_GROOVE: GrooveParams = {
  on: true,
  timing: new Array(16).fill(0),
  velocity: defaultGrooveVelocity(),
  swing: 0,
  swingGrid: 16,
};

/** Mutates `work` (index-aligned with the analysed notes). */
export function applyGroove(work: Note[], a: Analysis, target: boolean[], p: GrooveParams) {
  const stepLen = 1 / a.stepsPerBeat;
  a.groups.forEach((g, gi) => {
    if (!target[gi]) return;
    let shift = ((p.timing[g.step] ?? 0) / 100) * stepLen;
    if (!a.triplet && p.swing > 0) {
      const sub = p.swingGrid === 16 ? 1 : 2;
      if (g.step % (2 * sub) === sub) shift += (p.swing / 100) * stepLen * sub;
    }
    const dv = p.velocity[g.step] ?? 0;
    for (const i of g.idx) {
      const n = work[i]!;
      n.startTime = Math.max(0, n.startTime + shift);
      n.velocity = clampVelocity((n.velocity ?? DEFAULT_VELOCITY) + dv);
    }
  });
}

/** Timing and velocity per step taken from a played clip: what `applyGroove` would need to make a straight clip feel like it. */
export type ExtractedGroove = Pick<GrooveParams, "timing" | "velocity"> & { triplet: boolean };

/**
 * Averages, for each step of the bar, how far the chords on it sit from the grid (% of a step,
 * -50..50) and how much louder or softer they are than the clip's average (-40..40).
 * Steps with no notes get 0. `window`: chord window in beats.
 */
export function extractGroove(notes: readonly Note[], window?: number): ExtractedGroove {
  const a = analyze(notes, 4, window);
  const stepLen = 1 / a.stepsPerBeat;
  const vel = (i: number) => notes[i]!.velocity ?? DEFAULT_VELOCITY;
  const mean = notes.length ? notes.reduce((s, _, i) => s + vel(i), 0) / notes.length : DEFAULT_VELOCITY;
  const sums = Array.from({ length: 16 }, () => ({ dt: 0, dv: 0, n: 0 }));
  for (const g of a.groups) {
    const s = sums[g.step]!;
    s.dt += (g.start - Math.round(g.start / stepLen) * stepLen) / stepLen;
    s.dv += g.idx.reduce((t, i) => t + vel(i), 0) / g.idx.length - mean;
    s.n++;
  }
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, Math.round(v)));
  return {
    timing: sums.map((s) => (s.n ? clamp((s.dt / s.n) * 100, 50) : 0)),
    velocity: sums.map((s) => (s.n ? clamp(s.dv / s.n, 40) : 0)),
    triplet: a.triplet,
  };
}
