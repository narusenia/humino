// SPDX-License-Identifier: MIT

import type { Analysis } from "./analysis.js";
import type { createRng } from "./rng.js";
import { clampVelocity, DEFAULT_VELOCITY, MIN_DURATION, type Note } from "./types.js";

type Rng = ReturnType<typeof createRng>;

export type RunDirection = "auto" | "up" | "down";

export type ConnectParams = {
  /** Off by default so settings saved before v2 never gain notes. */
  on: boolean;
  /** 0..100 %, scale tone between two bass notes. */
  passing: number;
  /** 0..100 %, semitone run into the next bass note (rolled before passing). */
  chromatic: number;
  /** 1..6 run notes. */
  steps: number;
  runDirection: RunDirection;
  /** 0..100 %, grace note before the top note. */
  grace: number;
  /** Beats per grace note, 1/64..1/16. */
  graceLength: number;
  /** 1..6 grace notes climbing into the top note. */
  graceSteps: number;
  /** 0..100 %, velocity of the added notes against the note they lead from (bass) or into (grace). */
  velocity: number;
};

export const DEFAULT_CONNECT: ConnectParams = {
  on: false,
  passing: 30,
  chromatic: 30,
  steps: 2,
  runDirection: "auto",
  grace: 20,
  graceLength: 1 / 32,
  graceSteps: 1,
  velocity: 80,
};

/** Live's current scale; absent when Scale Mode is off. */
export type Scale = { root: number; intervals: number[] };

/** One run / passing note is a 16th. */
const STEP = 1 / 4;
/** No connection when the next note is closer than an 8th. */
const MIN_GAP = 1 / 2;

const inScale = (s: Scale, p: number) => s.intervals.includes((((p - s.root) % 12) + 12) % 12);

/** Scale tone strictly between two bass notes, nearest the middle. */
function passingTone(from: number, to: number, s: Scale): number | undefined {
  const mid = (from + to) / 2;
  let best: number | undefined;
  for (let p = Math.min(from, to) + 1; p < Math.max(from, to); p++)
    if (inScale(s, p) && (best === undefined || Math.abs(p - mid) < Math.abs(best - mid))) best = p;
  return best;
}

const below = (p: number, s?: Scale) => {
  if (s) for (let d = 1; d <= 12; d++) if (inScale(s, p - d)) return p - d;
  return p - 1;
};

/** Ends `n` no later than `t`, keeping a minimal length. */
const trimTo = (n: Note, t: number) => {
  if (n.startTime + n.duration > t) n.duration = Math.max(MIN_DURATION, t - n.startTime);
};

/**
 * Connect (design.md): passing tones and chromatic runs into the next bass note,
 * grace notes before the next top note. Trims `work` in place and returns the new notes.
 */
export function applyConnect(
  work: Note[],
  a: Analysis,
  target: boolean[],
  dropped: ReadonlySet<number>,
  p: ConnectParams,
  scale: Scale | undefined,
  rng: Rng,
): Note[] {
  const added: Note[] = [];
  if (!p.on) return added;
  for (let gi = 1; gi < a.groups.length; gi++) {
    // drawn for every pair so a partial apply matches a full one
    const [rRun, rPass, rGrace] = [rng.next(), rng.next(), rng.next()];
    if (!target[gi - 1] || !target[gi]) continue;
    const prev = a.groups[gi - 1]!.idx.filter((i) => !dropped.has(i));
    const next = a.groups[gi]!.idx.filter((i) => !dropped.has(i));
    if (!prev.length || !next.length) continue;

    // Bass: idx is sorted by pitch, so [0] is the lowest sounding note.
    const pb = work[prev[0]!]!;
    const nb = work[next[0]!]!;
    const gap = nb.startTime - pb.startTime;
    let bassAdded = false;
    if (gap >= MIN_GAP) {
      const room = Math.floor(gap / 2 / STEP + 1e-9);
      let pitches: number[] = [];
      if (rRun < p.chromatic / 100) {
        const dir = p.runDirection === "auto" ? (pb.pitch > nb.pitch ? "down" : "up") : p.runDirection;
        const n = Math.max(1, Math.min(Math.round(p.steps), room));
        pitches = Array.from({ length: n }, (_, k) => nb.pitch + (dir === "up" ? -(n - k) : n - k));
      } else if (scale && rPass < p.passing / 100) {
        const t = passingTone(pb.pitch, nb.pitch, scale);
        if (t !== undefined) pitches = [t];
      }
      if (pitches.length) {
        const start = nb.startTime - pitches.length * STEP;
        trimTo(pb, start);
        const velocity = clampVelocity(((pb.velocity ?? DEFAULT_VELOCITY) * p.velocity) / 100);
        pitches.forEach((pitch, k) => added.push({ pitch, startTime: start + k * STEP, duration: STEP, velocity }));
        bassAdded = true;
      }
    }

    // Grace: a single-note group already got its approach from the bass line.
    const pt = work[prev[prev.length - 1]!]!;
    const nt = work[next[next.length - 1]!]!;
    const topGap = nt.startTime - pt.startTime;
    if (rGrace < p.grace / 100 && !(bassAdded && next.length === 1) && topGap >= MIN_GAP) {
      // as many as fit in half the gap, climbing a scale step (or semitone) at a time
      const n = Math.max(1, Math.min(Math.round(p.graceSteps), Math.floor(topGap / 2 / p.graceLength + 1e-9)));
      const pitches = [below(nt.pitch, scale)];
      while (pitches.length < n) pitches.unshift(below(pitches[0]!, scale));
      const start = nt.startTime - n * p.graceLength;
      trimTo(pt, start);
      const velocity = clampVelocity(((nt.velocity ?? DEFAULT_VELOCITY) * p.velocity) / 100);
      pitches.forEach((pitch, k) => added.push({ pitch, startTime: start + k * p.graceLength, duration: p.graceLength, velocity }));
    }
  }
  return added;
}
