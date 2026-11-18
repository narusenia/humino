// SPDX-License-Identifier: MIT

import { metricLevel, type Analysis } from "./analysis.js";
import { clampVelocity, DEFAULT_VELOCITY, type Note } from "./types.js";

export type GrooveParams = {
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
