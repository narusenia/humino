// SPDX-License-Identifier: MIT

import { msToBeats, type Analysis } from "./analysis.js";
import type { createRng } from "./rng.js";
import { clampVelocity, DEFAULT_VELOCITY, MIN_DURATION, type Context, type Note } from "./types.js";

type Rng = ReturnType<typeof createRng>;

export type HumanizeParams = {
  /** ms, size of the slow drift (stationary standard deviation). */
  drift: number;
  /** 0..1, how fast the drift returns to the grid (0 = constant offset, 1 = no memory). */
  driftReturn: number;
  /** ms, per-chord jitter standard deviation. */
  jitter: number;
  /** 0..100 %, how much jitter is reduced on strong beats. */
  beatWeight: number;
  /** ± velocity, uniform. */
  velJitter: number;
  /** 0..100 %, top +12 / bass +6 / inner -6 at 100. */
  chordBalance: number;
  /** 0..100 %, closes the gap to the next note. */
  legato: number;
  /** 0..30 %, ± length change. */
  lengthJitter: number;
};

export const DEFAULT_HUMANIZE: HumanizeParams = {
  drift: 8,
  driftReturn: 0.3,
  jitter: 4,
  beatWeight: 50,
  velJitter: 6,
  chordBalance: 40,
  legato: 0,
  lengthJitter: 5,
};

/** Drift in ms per group: mean-reverting AR(1) over the whole clip (ADR-0005). */
export function driftCurve(a: Analysis, p: HumanizeParams, rng: Rng): number[] {
  const k = 1 - p.driftReturn;
  const step = p.drift * Math.sqrt(1 - k * k);
  let x = p.drift * rng.gaussian();
  return a.groups.map((_, gi) => {
    if (gi > 0) x = k * x + step * rng.gaussian();
    return x;
  });
}

/**
 * Mutates `work`. Random numbers are drawn for every note whether targeted or
 * not, so a partial apply sees the same curve as a full one (ADR-0007).
 * Returns the drift curve (ms per group) for the preview.
 */
export function applyHumanize(work: Note[], a: Analysis, target: boolean[], p: HumanizeParams, ctx: Context, rng: Rng): number[] {
  const drift = driftCurve(a, p, rng);
  const jitter = a.groups.map((g) => rng.gaussian() * p.jitter * (1 - (p.beatWeight / 100) * (1 - g.level / 4)));
  const velNoise = work.map(() => (rng.next() * 2 - 1) * p.velJitter);
  const lenNoise = work.map(() => ((rng.next() * 2 - 1) * p.lengthJitter) / 100);
  const cb = p.chordBalance / 100;

  a.groups.forEach((g, gi) => {
    if (!target[gi]) return;
    const shift = msToBeats(drift[gi]! + jitter[gi]!, ctx.tempo);
    g.idx.forEach((i, k) => {
      const n = work[i]!;
      n.startTime = Math.max(0, n.startTime + shift);
      const balance = g.idx.length < 2 ? 0 : k === g.idx.length - 1 ? 12 : k === 0 ? 6 : -6;
      n.velocity = clampVelocity((n.velocity ?? DEFAULT_VELOCITY) + balance * cb + velNoise[i]!);
    });
  });

  // Lengths after all starts moved, so gaps are measured on the new timing.
  a.groups.forEach((g, gi) => {
    if (!target[gi]) return;
    const next = a.groups[gi + 1];
    const nextStart = next ? work[next.idx[0]!]!.startTime : undefined;
    for (const i of g.idx) {
      const n = work[i]!;
      let dur = n.duration;
      const end = n.startTime + dur;
      if (nextStart !== undefined && nextStart > end) dur += ((nextStart - end) * p.legato) / 100;
      dur *= 1 + lenNoise[i]!;
      const sameNext = nextSamePitch(work, a, gi, n.pitch);
      if (sameNext !== undefined) dur = Math.min(dur, sameNext - n.startTime);
      n.duration = Math.max(MIN_DURATION, dur);
    }
  });
  return drift;
}

/** Start of the next note with the same pitch after group `gi`. */
export function nextSamePitch(work: Note[], a: Analysis, gi: number, pitch: number): number | undefined {
  for (let j = gi + 1; j < a.groups.length; j++) {
    const hit = a.groups[j]!.idx.find((i) => work[i]!.pitch === pitch);
    if (hit !== undefined) return work[hit]!.startTime;
  }
  return undefined;
}
