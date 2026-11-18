// SPDX-License-Identifier: MIT

import { analyze, msToBeats, targetGroups, type Analysis } from "./analysis.js";
import { applyGroove, DEFAULT_GROOVE, type GrooveParams } from "./groove.js";
import { applyHumanize, DEFAULT_HUMANIZE, type HumanizeParams } from "./humanize.js";
import { applyPedal, type PedalMode } from "./pedal.js";
import { applyConnect, DEFAULT_CONNECT, type ConnectParams } from "./connect.js";
import { createRng } from "./rng.js";
import { applyStrum, chordKey, DEFAULT_STRUM, type ChordOverride, type StrumParams } from "./strum.js";
import { clampVelocity, DEFAULT_VELOCITY, type Context, type Note } from "./types.js";

export type Mode = "guitar" | "piano";

export type Params = {
  mode: Mode;
  groove: GrooveParams;
  humanize: HumanizeParams;
  /** Guitar mode only. */
  strum: StrumParams;
  /** Piano mode only. */
  pedal: PedalMode;
  connect: ConnectParams;
};

export const DEFAULT_PARAMS: Params = {
  mode: "piano",
  groove: DEFAULT_GROOVE,
  humanize: DEFAULT_HUMANIZE,
  strum: DEFAULT_STRUM,
  pedal: "off",
  connect: DEFAULT_CONNECT,
};

/** Fills fields missing from settings saved by an older version with the defaults. */
export function completeParams(p: Params): Params {
  return {
    ...DEFAULT_PARAMS,
    ...p,
    groove: { ...DEFAULT_PARAMS.groove, ...p.groove },
    humanize: { ...DEFAULT_PARAMS.humanize, ...p.humanize },
    strum: { ...DEFAULT_PARAMS.strum, ...p.strum },
    connect: { ...DEFAULT_PARAMS.connect, ...p.connect },
  };
}

export const STAGES = ["groove", "humanize", "strum", "pedal", "connect"] as const;
export type Stage = (typeof STAGES)[number];

export type Result = {
  /** Output notes (upstroke-skipped notes removed, Connect's notes appended). */
  notes: Note[];
  /** Notes Connect added (also at the end of `notes`). */
  added: Note[];
  /** Notes after each stage, index-aligned with the input, for the preview. */
  snapshots: Record<Stage, Note[]>;
  /** After hand edits (lock, nudge), index-aligned with the input. */
  final: Note[];
  /** Input indices removed from `notes`. */
  dropped: Set<number>;
  analysis: Analysis;
  target: boolean[];
  /** Drift in ms per group. */
  drift: number[];
};

export type NoteOverride = {
  /** Keep the original note untouched. */
  lock?: boolean;
  /** ms added to the processed start (hand nudge). */
  dt?: number;
  /** Added to the processed velocity. */
  dv?: number;
};

/** Per-clip hand edits, stored with the original notes (ADR-0002). */
export type Overrides = {
  chords?: Record<string, ChordOverride>;
  /** Keyed by `noteKey` of the original note. */
  notes?: Record<string, NoteOverride>;
};

export const noteKey = (n: Note) => `${n.pitch}@${chordKey(n.startTime)}`;

/** Independent stream per stage so changing one stage's amounts never reshuffles another. */
const stageRng = (seed: number, k: number) => createRng((seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0);

/**
 * Groove → Humanize → Strum → Pedal → Connect (ADR-0004), then hand edits.
 * Pure: `notes` is not modified.
 */
export function process(notes: readonly Note[], p: Params, ctx: Context, ov: Overrides = {}): Result {
  const a = analyze(notes, ctx.beatsPerBar ?? 4);
  const target = targetGroups(notes, a);
  const work = notes.map((n) => ({ ...n }));
  const snap = () => work.map((n) => ({ ...n }));

  applyGroove(work, a, target, p.groove);
  const groove = snap();
  const drift = applyHumanize(work, a, target, p.humanize, ctx, stageRng(ctx.seed, 1));
  const humanize = snap();
  const dropped =
    p.mode === "guitar"
      ? applyStrum(work, a, target, { ...p.strum, chords: { ...p.strum.chords, ...ov.chords } }, ctx, stageRng(ctx.seed, 2))
      : new Set<number>();
  const strum = snap();
  applyPedal(work, a, target, p.mode === "piano" ? p.pedal : "off", ctx.clipEnd);
  const pedal = snap();
  const added = applyConnect(work, a, target, dropped, p.connect, ctx.scale, stageRng(ctx.seed, 3));
  const connect = snap();

  // Hand edits last, so they hold whatever the seed or the amounts do.
  notes.forEach((orig, i) => {
    const o = ov.notes?.[noteKey(orig)];
    if (!o) return;
    if (o.lock) {
      work[i] = { ...orig };
      dropped.delete(i);
      return;
    }
    const n = work[i]!;
    if (o.dt) n.startTime = Math.max(0, n.startTime + msToBeats(o.dt, ctx.tempo));
    if (o.dv) n.velocity = clampVelocity((n.velocity ?? DEFAULT_VELOCITY) + o.dv);
  });

  return {
    notes: [...work.filter((_, i) => !dropped.has(i)), ...added],
    added,
    snapshots: { groove, humanize, strum, pedal, connect },
    final: work,
    dropped,
    analysis: a,
    target,
    drift,
  };
}
