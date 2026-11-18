// SPDX-License-Identifier: MIT

// Every panel control in one list: build.ts lays them out, humino.ts reads and
// writes params through the same get / set. The 16-step groove table does not
// fit the 152 × 147 panel and stays in the Extension.

import type { Params } from "@humino/core";

export const PAGES = ["Hum", "Feel", "Strum"];

type Base = { key: string; label: string; page: number; x: number; y: number; get: (p: Params) => number; set: (p: Params, v: number) => void };
export type Control =
  | (Base & { kind: "dial"; max: number; unit: number })
  | (Base & { kind: "tab"; options: string[]; w: number });

const UNIT = { int: 0, ms: 2, pct: 5 };
// Dial rows and the tab row under them (see build.ts for the header).
const COL = [4, 54, 104];
const ROW = [36, 82];
const TAB_Y = 130;

const dial = (key: string, label: string, page: number, slot: number, max: number, unit: number, get: Base["get"], set: Base["set"]): Control => ({
  kind: "dial", key, label, page, x: COL[slot % 3]!, y: ROW[Math.floor(slot / 3)]!, max, unit, get, set,
});
const tab = <T>(key: string, label: string, page: number, x: number, w: number, values: readonly T[], names: string[], get: (p: Params) => T, set: (p: Params, v: T) => void): Control => ({
  kind: "tab", key, label, page, x, y: TAB_Y, w, options: names,
  get: (p) => Math.max(0, values.indexOf(get(p))),
  set: (p, i) => set(p, values[i] ?? values[0]!),
});

export const CONTROLS: Control[] = [
  // Hum
  dial("drift", "Drift", 0, 0, 40, UNIT.ms, (p) => p.humanize.drift, (p, v) => (p.humanize.drift = v)),
  dial("jitter", "Jitter", 0, 1, 20, UNIT.ms, (p) => p.humanize.jitter, (p, v) => (p.humanize.jitter = v)),
  dial("spread", "Spread", 0, 2, 20, UNIT.ms, (p) => p.humanize.spread, (p, v) => (p.humanize.spread = v)),
  dial("vel", "Vel ±", 0, 3, 30, UNIT.int, (p) => p.humanize.velJitter, (p, v) => (p.humanize.velJitter = v)),
  dial("length", "Length ±", 0, 4, 30, UNIT.pct, (p) => p.humanize.lengthJitter, (p, v) => (p.humanize.lengthJitter = v)),
  dial("legato", "Legato", 0, 5, 100, UNIT.pct, (p) => p.humanize.legato, (p, v) => (p.humanize.legato = v)),
  // Feel
  dial("swing", "Swing", 1, 0, 75, UNIT.pct, (p) => p.groove.swing, (p, v) => (p.groove.swing = v)),
  dial("beatweight", "Beat Wt", 1, 1, 100, UNIT.pct, (p) => p.humanize.beatWeight, (p, v) => (p.humanize.beatWeight = v)),
  dial("chordbal", "Chord Bal", 1, 2, 100, UNIT.pct, (p) => p.humanize.chordBalance, (p, v) => (p.humanize.chordBalance = v)),
  dial("driftreturn", "Drift Ret", 1, 3, 100, UNIT.pct, (p) => Math.round(p.humanize.driftReturn * 100), (p, v) => (p.humanize.driftReturn = v / 100)),
  tab("grid", "Swing Grid", 1, 4, 64, [8, 16] as const, ["8th", "16th"], (p) => p.groove.swingGrid, (p, v) => (p.groove.swingGrid = v)),
  tab("pedal", "Pedal", 1, 76, 72, ["off", "bar", "chord"] as const, ["Off", "Bar", "Chd"], (p) => p.pedal, (p, v) => (p.pedal = v)),
  // Strum
  dial("down", "Down", 2, 0, 120, UNIT.ms, (p) => p.strum.downSpeed, (p, v) => (p.strum.downSpeed = v)),
  dial("up", "Up", 2, 1, 120, UNIT.ms, (p) => p.strum.upSpeed, (p, v) => (p.strum.upSpeed = v)),
  dial("speedjitter", "Speed ±", 2, 2, 50, UNIT.pct, (p) => p.strum.speedJitter, (p, v) => (p.strum.speedJitter = v)),
  dial("taper", "Taper", 2, 3, 30, UNIT.int, (p) => p.strum.taper, (p, v) => (p.strum.taper = v)),
  dial("upskip", "Up Skip", 2, 4, 3, UNIT.int, (p) => p.strum.upSkip, (p, v) => (p.strum.upSkip = Math.round(v))),
  dial("overlap", "Overlap", 2, 5, 20, UNIT.ms, (p) => p.strum.overlap, (p, v) => (p.strum.overlap = v)),
  tab("direction", "Direction", 2, 4, 44, ["auto", "down"] as const, ["Auto", "Dn"], (p) => p.strum.direction, (p, v) => (p.strum.direction = v)),
  tab("motion", "Motion", 2, 52, 50, ["auto", 8, 16] as const, ["A", "8", "16"], (p) => p.strum.motion, (p, v) => (p.strum.motion = v)),
  tab("anchor", "Anchor", 2, 106, 42, ["first", "center"] as const, ["1st", "Ctr"], (p) => p.strum.anchor, (p, v) => (p.strum.anchor = v)),
];
