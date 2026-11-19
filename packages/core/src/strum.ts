// SPDX-License-Identifier: MIT

import { msToBeats, type Analysis, type Group } from "./analysis.js";
import type { createRng } from "./rng.js";
import { clampVelocity, DEFAULT_VELOCITY, MIN_DURATION, type Context, type Note } from "./types.js";

type Rng = ReturnType<typeof createRng>;
export type Direction = "down" | "up";

export type StrumParams = {
  /** Off skips the stage; on by default, so settings saved before the switch keep working. */
  on: boolean;
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
  on: true,
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

/** Strings in the order the hand hits them, and the low strings an upstroke misses. */
function stroke(work: Note[], g: Group, motion: 8 | 16, p: StrumParams) {
  const dir = strumDirection(g, motion, p);
  const order = lowToHigh(work, g.idx);
  if (dir === "down") return { dir, order, missed: [] as number[] };
  order.reverse();
  const skip = Math.min(p.chords?.[chordKey(g.start)]?.upSkip ?? p.upSkip, order.length - 2);
  return { dir, order: order.slice(0, order.length - skip), missed: order.slice(order.length - skip) };
}

/**
 * Mutates `work`; returns the indices of notes dropped on upstrokes.
 * A missed low string keeps ringing from the previous stroke when that stroke
 * played the same pitch (the note is dropped and the earlier one extended);
 * otherwise the note stays, so the chord keeps all its tones.
 */
export function applyStrum(work: Note[], a: Analysis, target: boolean[], p: StrumParams, ctx: Context, rng: Rng): Set<number> {
  const dropped = new Set<number>();
  const motion = resolveMotion(a, p);
  const toBeats = (ms: number) => msToBeats(ms, ctx.tempo);

  let prev = new Map<number, number>(); // pitch → note index played by the previous stroke
  a.groups.forEach((g, gi) => {
    if (!isChord(g)) return;
    const jitter = rng.next() * 2 - 1; // drawn for every chord so partial applies match
    if (!target[gi]) {
      prev = new Map();
      return;
    }

    const { dir, order, missed } = stroke(work, g, motion, p);
    const ov = p.chords?.[chordKey(g.start)];
    for (const i of missed) {
      const n = work[i]!;
      const held = prev.get(n.pitch);
      const h = held === undefined ? undefined : work[held]!;
      if (!h || h.startTime + h.duration < n.startTime - 1 / 16) {
        order.push(i); // nothing ringing on that string: keep the chord tone
        continue;
      }
      h.duration = Math.max(h.duration, n.startTime + n.duration - h.startTime);
      dropped.add(i);
    }

    const base = work[g.idx[0]!]!.startTime;
    // The next stroke stops only the pitches it strikes again; everything else,
    // including strings its upstroke misses, rings to its own end.
    const next = a.groups.slice(gi + 1).find(isChord);
    const cut = next ? work[next.idx[0]!]!.startTime + toBeats(p.overlap) : Infinity;
    const nextMissed = new Set(next ? stroke(work, next, motion, p).missed.map((i) => work[i]!.pitch) : []);
    const restruck = new Set(next ? next.idx.map((i) => work[i]!.pitch).filter((q) => !nextMissed.has(q)) : []);
    const endOf = new Map(
      g.idx.map((i) => {
        const n = work[i]!;
        return [i, Math.min(n.startTime + n.duration, restruck.has(n.pitch) ? cut : Infinity)];
      }),
    );
    const speed = (ov?.speed ?? (dir === "down" ? p.downSpeed : p.upSpeed)) * (1 + (jitter * p.speedJitter) / 100);
    const last = Math.max(1, order.length - 1);

    order.forEach((i, k) => {
      const n = work[i]!;
      const offset = (speed * k) / last - (p.anchor === "center" ? speed / 2 : 0);
      n.startTime = Math.max(0, base + toBeats(offset));
      n.duration = Math.max(MIN_DURATION, endOf.get(i)! - n.startTime);
      n.velocity = clampVelocity((n.velocity ?? DEFAULT_VELOCITY) - (p.taper * k) / last);
    });
    prev = new Map(order.map((i) => [work[i]!.pitch, i]));
  });
  return dropped;
}
