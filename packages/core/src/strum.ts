// SPDX-License-Identifier: MIT

import { msToBeats, type Analysis, type Group } from "./analysis.js";
import type { createRng } from "./rng.js";
import { clampVelocity, DEFAULT_VELOCITY, MIN_DURATION, type Context, type Note } from "./types.js";

type Rng = ReturnType<typeof createRng>;
export type Direction = "down" | "up";

export type StrumParams = {
  direction: "auto" | "down";
  motion: "auto" | 8 | 16;
  /** ms from first to last string. */
  downSpeed: number;
  upSpeed: number;
  /** 0..50 %, per-chord speed variation. */
  speedJitter: number;
  /** Velocity drop reached by the last string. */
  taper: number;
  /** Low strings skipped on upstrokes (0..3). */
  upSkip: number;
  anchor: "first" | "center";
  /** ms the previous chord rings past the next chord's start. */
  overlap: number;
  /** Per-chord overrides (Strum Down / Up, the dialog), keyed by `chordKey` of the original start. */
  chords?: Record<string, ChordOverride>;
};

export type ChordOverride = {
  direction?: Direction;
  /** ms, replaces downSpeed / upSpeed for this chord. */
  speed?: number;
  upSkip?: number;
};

export const DEFAULT_STRUM: StrumParams = {
  direction: "auto",
  motion: "auto",
  downSpeed: 30,
  upSpeed: 20,
  speedJitter: 15,
  taper: 8,
  upSkip: 1,
  anchor: "first",
  overlap: 5,
};

export const chordKey = (start: number) => String(Math.round(start * 1024) / 1024);

const isChord = (g: Group) => g.idx.length >= 2;

/** 16ths if any chord sits on a 16th off-beat, else 8ths (ADR-0006). */
export const resolveMotion = (a: Analysis, p: StrumParams): 8 | 16 =>
  p.motion !== "auto" ? p.motion : a.groups.some((g) => isChord(g) && g.level === 4) ? 16 : 8;

/** The hand moves down on even motion steps and up on odd ones. */
export function strumDirection(g: Group, motion: 8 | 16, p: StrumParams): Direction {
  const forced = p.chords?.[chordKey(g.start)]?.direction;
  if (forced) return forced;
  if (p.direction === "down") return "down";
  return Math.round(g.start / (motion === 16 ? 0.25 : 0.5)) % 2 === 0 ? "down" : "up";
}

/** Low string first. Uses guitar strings when every note has one (v2 voicing), else pitch. */
function lowToHigh(work: Note[], idx: number[]): number[] {
  const byString = idx.every((i) => work[i]!.string !== undefined);
  return [...idx].sort((x, y) =>
    byString ? work[y]!.string! - work[x]!.string! : work[x]!.pitch - work[y]!.pitch,
  );
}

/** Mutates `work`; returns the indices of notes skipped on upstrokes. */
export function applyStrum(work: Note[], a: Analysis, target: boolean[], p: StrumParams, ctx: Context, rng: Rng): Set<number> {
  const dropped = new Set<number>();
  const motion = resolveMotion(a, p);
  const toBeats = (ms: number) => msToBeats(ms, ctx.tempo);

  a.groups.forEach((g, gi) => {
    if (!isChord(g)) return;
    const jitter = rng.next() * 2 - 1; // drawn for every chord so partial applies match
    if (!target[gi]) return;

    const dir = strumDirection(g, motion, p);
    const ov = p.chords?.[chordKey(g.start)];
    let order = lowToHigh(work, g.idx);
    if (dir === "up") {
      order.reverse();
      const skip = Math.min(ov?.upSkip ?? p.upSkip, order.length - 2);
      for (const i of order.slice(order.length - skip)) dropped.add(i);
      order = order.slice(0, order.length - skip);
    }

    const base = work[g.idx[0]!]!.startTime;
    const chordEnd = Math.max(...g.idx.map((i) => work[i]!.startTime + work[i]!.duration));
    const next = a.groups.slice(gi + 1).find(isChord);
    const cut = next ? work[next.idx[0]!]!.startTime + toBeats(p.overlap) : Infinity;
    const end = Math.min(chordEnd, cut);
    const speed = (ov?.speed ?? (dir === "down" ? p.downSpeed : p.upSpeed)) * (1 + (jitter * p.speedJitter) / 100);
    const last = Math.max(1, order.length - 1);

    order.forEach((i, k) => {
      const n = work[i]!;
      const offset = (speed * k) / last - (p.anchor === "center" ? speed / 2 : 0);
      n.startTime = Math.max(0, base + toBeats(offset));
      n.duration = Math.max(MIN_DURATION, end - n.startTime);
      n.velocity = clampVelocity((n.velocity ?? DEFAULT_VELOCITY) - (p.taper * k) / last);
    });
  });
  return dropped;
}
