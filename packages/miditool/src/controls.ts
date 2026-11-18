// SPDX-License-Identifier: MIT

// Every panel control in one list: build.ts lays them out, humino.ts reads and
// writes params through the same get / set. The 16-step groove table does not
// fit the 152 × 147 panel and stays in the Extension.

import type { Params } from "@humino/core";

export const PAGES = ["Hum", "Feel", "Str", "Con"];

/** `tip` is shown in Live's Info View when the pointer is over the control. */
type Base = { key: string; label: string; tip: string; page: number; x: number; y: number; get: (p: Params) => number; set: (p: Params, v: number) => void };
export type Control =
  | (Base & { kind: "dial"; max: number; unit: number })
  | (Base & { kind: "tab"; options: string[]; w: number });

const UNIT = { int: 0, ms: 2, pct: 5 };
// Header row (page + mode) is y 2-17; two dial rows with a gap so a value never
// touches the name below it; then one row of tabs (or the preset menu on Hum).
const COL = [4, 54, 104];
const ROW = [21, 75];
export const TAB_Y = 129;

const dial = (key: string, label: string, tip: string, page: number, slot: number, max: number, unit: number, get: Base["get"], set: Base["set"]): Control => ({
  kind: "dial", key, label, tip, page, x: COL[slot % 3]!, y: ROW[Math.floor(slot / 3)]!, max, unit, get, set,
});
/** `x` / `w` place the tab; it sits in the tab row unless `y` is given. */
const tab = <T>(key: string, label: string, tip: string, page: number, [x, w, y = TAB_Y]: [number, number, number?], values: readonly T[], names: string[], get: (p: Params) => T, set: (p: Params, v: T) => void): Control => ({
  kind: "tab", key, label, tip, page, x, y, w, options: names,
  get: (p) => Math.max(0, values.indexOf(get(p))),
  set: (p, i) => set(p, values[i] ?? values[0]!),
});

export const CONTROLS: Control[] = [
  // Hum
  dial("drift", "Drift", "Slow timing wander that comes and goes.", 0, 0, 40, UNIT.ms, (p) => p.humanize.drift, (p, v) => (p.humanize.drift = v)),
  dial("jitter", "Jitter", "Small timing error per chord.", 0, 1, 20, UNIT.ms, (p) => p.humanize.jitter, (p, v) => (p.humanize.jitter = v)),
  dial("spread", "Spread", "Offsets each note of a chord on its own. 0 moves the chord as one.", 0, 2, 20, UNIT.ms, (p) => p.humanize.spread, (p, v) => (p.humanize.spread = v)),
  dial("vel", "Vel ±", "Random velocity change.", 0, 3, 30, UNIT.int, (p) => p.humanize.velJitter, (p, v) => (p.humanize.velJitter = v)),
  dial("length", "Length ±", "Random note length change.", 0, 4, 30, UNIT.pct, (p) => p.humanize.lengthJitter, (p, v) => (p.humanize.lengthJitter = v)),
  dial("legato", "Legato", "Closes the gap to the next note.", 0, 5, 100, UNIT.pct, (p) => p.humanize.legato, (p, v) => (p.humanize.legato = v)),
  // Feel
  dial("swing", "Swing", "Pushes off-beats later.", 1, 0, 75, UNIT.pct, (p) => p.groove.swing, (p, v) => (p.groove.swing = v)),
  dial("beatweight", "Beat Wt", "Keeps strong beats tighter than off-beats.", 1, 1, 100, UNIT.pct, (p) => p.humanize.beatWeight, (p, v) => (p.humanize.beatWeight = v)),
  dial("chordbal", "Chord Bal", "Louder top and bass notes, softer inner notes.", 1, 2, 100, UNIT.pct, (p) => p.humanize.chordBalance, (p, v) => (p.humanize.chordBalance = v)),
  dial("driftreturn", "Drift Ret", "How fast the drift comes back to the grid.", 1, 3, 100, UNIT.pct, (p) => Math.round(p.humanize.driftReturn * 100), (p, v) => (p.humanize.driftReturn = v / 100)),
  tab("grid", "Swing Grid", "Which off-beats swing: 8th or 16th notes.", 1, [4, 64], [8, 16] as const, ["8th", "16th"], (p) => p.groove.swingGrid, (p, v) => (p.groove.swingGrid = v)),
  tab("pedal", "Pedal", "Piano: hold notes to the end of the bar or chord.", 1, [76, 72], ["off", "bar", "chord"] as const, ["Off", "Bar", "Chd"], (p) => p.pedal, (p, v) => (p.pedal = v)),
  // Strum
  dial("down", "Down", "Guitar: time from the first to the last string on a downstroke.", 2, 0, 120, UNIT.ms, (p) => p.strum.downSpeed, (p, v) => (p.strum.downSpeed = v)),
  dial("up", "Up", "Guitar: the same time for upstrokes.", 2, 1, 120, UNIT.ms, (p) => p.strum.upSpeed, (p, v) => (p.strum.upSpeed = v)),
  dial("speedjitter", "Speed ±", "Stroke speed varies per chord.", 2, 2, 50, UNIT.pct, (p) => p.strum.speedJitter, (p, v) => (p.strum.speedJitter = v)),
  dial("taper", "Taper", "Later strings get softer.", 2, 3, 30, UNIT.int, (p) => p.strum.taper, (p, v) => (p.strum.taper = v)),
  dial("upskip", "Up Skip", "Low strings left out on upstrokes.", 2, 4, 3, UNIT.int, (p) => p.strum.upSkip, (p, v) => (p.strum.upSkip = Math.round(v))),
  dial("overlap", "Overlap", "How long a chord rings into the next one.", 2, 5, 20, UNIT.ms, (p) => p.strum.overlap, (p, v) => (p.strum.overlap = v)),
  tab("direction", "Direction", "Follow the strumming hand (Auto) or downstrokes only.", 2, [4, 44], ["auto", "down"] as const, ["Auto", "Dn"], (p) => p.strum.direction, (p, v) => (p.strum.direction = v)),
  tab("motion", "Motion", "How fast the hand moves: Auto, 8th or 16th notes.", 2, [52, 50], ["auto", 8, 16] as const, ["A", "8", "16"], (p) => p.strum.motion, (p, v) => (p.strum.motion = v)),
  tab("anchor", "Anchor", "Which string lands on the grid: the first or the middle one.", 2, [106, 42], ["first", "center"] as const, ["1st", "Ctr"], (p) => p.strum.anchor, (p, v) => (p.strum.anchor = v)),
  // Connect
  dial("chromatic", "Chromatic", "Chance of a semitone run into the next bass note.", 3, 0, 100, UNIT.pct, (p) => p.connect.chromatic, (p, v) => (p.connect.chromatic = v)),
  dial("steps", "Run Steps", "Run notes, 16ths each. Fewer when there is no room.", 3, 1, 4, UNIT.int, (p) => p.connect.steps, (p, v) => (p.connect.steps = Math.max(1, Math.round(v)))),
  dial("passing", "Passing", "Chance of a scale tone between two bass notes. Needs Scale Mode.", 3, 2, 100, UNIT.pct, (p) => p.connect.passing, (p, v) => (p.connect.passing = v)),
  dial("grace", "Grace", "Chance of a grace note just before the top note.", 3, 3, 100, UNIT.pct, (p) => p.connect.grace, (p, v) => (p.connect.grace = v)),
  tab("connect", "Connect", "Adds notes that lead from one chord to the next. Off by default.", 3, [54, 94, ROW[1]! + 4], [false, true] as const, ["Off", "On"], (p) => p.connect.on, (p, v) => (p.connect.on = v)),
  tab("gracelen", "Grace Len", "Grace note length: 1/32 or 1/16 of a beat.", 3, [54, 94, ROW[1]! + 26], [1 / 32, 1 / 16] as const, ["1/32", "1/16"], (p) => p.connect.graceLength, (p, v) => (p.connect.graceLength = v)),
  tab("rundir", "Run From", "Side the run comes from. Auto follows the previous bass note.", 3, [4, 144], ["auto", "up", "down"] as const, ["Auto", "Below", "Above"], (p) => p.connect.runDirection, (p, v) => (p.connect.runDirection = v)),
];
