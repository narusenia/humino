// SPDX-License-Identifier: MIT

import { analyze, targetGroups, type Analysis } from "./analysis.js";
import { applyGroove, DEFAULT_GROOVE, type GrooveParams } from "./groove.js";
import { applyHumanize, DEFAULT_HUMANIZE, type HumanizeParams } from "./humanize.js";
import { applyPedal, type PedalMode } from "./pedal.js";
import { createRng } from "./rng.js";
import { applyStrum, DEFAULT_STRUM, type StrumParams } from "./strum.js";
import type { Context, Note } from "./types.js";

export type Mode = "guitar" | "piano";

export type Params = {
  mode: Mode;
  groove: GrooveParams;
  humanize: HumanizeParams;
  /** Guitar mode only. */
  strum: StrumParams;
  /** Piano mode only. */
  pedal: PedalMode;
};

export const DEFAULT_PARAMS: Params = {
  mode: "guitar",
  groove: DEFAULT_GROOVE,
  humanize: DEFAULT_HUMANIZE,
  strum: DEFAULT_STRUM,
  pedal: "off",
};

export const STAGES = ["groove", "humanize", "strum", "pedal"] as const;
export type Stage = (typeof STAGES)[number];

export type Result = {
  /** Output notes (upstroke-skipped notes removed). */
  notes: Note[];
  /** Notes after each stage, index-aligned with the input, for the preview. */
  snapshots: Record<Stage, Note[]>;
  /** Input indices removed from `notes`. */
  dropped: Set<number>;
  analysis: Analysis;
  target: boolean[];
  /** Drift in ms per group. */
  drift: number[];
};

/** Independent stream per stage so changing one stage's amounts never reshuffles another. */
const stageRng = (seed: number, k: number) => createRng((seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0);

/** Groove → Humanize → Strum → Pedal (ADR-0004). Pure: `notes` is not modified. */
export function process(notes: readonly Note[], p: Params, ctx: Context): Result {
  const a = analyze(notes, ctx.beatsPerBar ?? 4);
  const target = targetGroups(notes, a);
  const work = notes.map((n) => ({ ...n }));
  const snap = () => work.map((n) => ({ ...n }));

  applyGroove(work, a, target, p.groove);
  const groove = snap();
  const drift = applyHumanize(work, a, target, p.humanize, ctx, stageRng(ctx.seed, 1));
  const humanize = snap();
  const dropped =
    p.mode === "guitar" ? applyStrum(work, a, target, p.strum, ctx, stageRng(ctx.seed, 2)) : new Set<number>();
  const strum = snap();
  applyPedal(work, a, target, p.mode === "piano" ? p.pedal : "off", ctx.clipEnd);

  return {
    notes: work.filter((_, i) => !dropped.has(i)),
    snapshots: { groove, humanize, strum, pedal: snap() },
    dropped,
    analysis: a,
    target,
    drift,
  };
}
