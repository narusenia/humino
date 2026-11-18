// SPDX-License-Identifier: MIT

// Every panel control in one list: build.ts lays them out, humino.ts reads and
// writes params through the same get / set. The 16-step groove table does not
// fit the 152 × 147 panel and stays in the Extension.

import { DEFAULT_CONNECT, DEFAULT_GROOVE, DEFAULT_HUMANIZE, DEFAULT_PARAMS, DEFAULT_STRUM, type Mode, type Params } from "@humino/core";

export const PAGES = ["Hum", "Feel", "Str", "Con"];

/** `tip` is shown in Live's Info View when the pointer is over the control; `mode` greys it out in the other mode. */
type Base = { key: string; label: string; tip: string; mode?: Mode; page: number; x: number; y: number; get: (p: Params) => number; set: (p: Params, v: number) => void };
export type Control =
  | (Base & { kind: "dial"; max: number; unit: number })
  | (Base & { kind: "tab"; options: string[]; w: number; /** live.menu (a drop-down) instead of live.tab. */ menu?: boolean })
  /** live.text button that lights when on; shows `label`. */
  | (Base & { kind: "toggle"; w: number });

const UNIT = { int: 0, ms: 2, pct: 5 };
// Header row (page + mode) is y 2-17; two dial rows with a gap so a value never
// touches the name below it; then one row of tabs (or the preset menu on Hum).
const COL = [4, 54, 104];
const ROW = [21, 75];
export const TAB_Y = 129;

const dial = (key: string, label: string, tip: string, page: number, slot: number, max: number, unit: number, get: Base["get"], set: Base["set"]): Control => ({
  kind: "dial", key, label, tip, page, x: COL[slot % 3]!, y: ROW[Math.floor(slot / 3)]!, max, unit, get, set,
});
/** `x` / `w` place the tab; it sits in the tab row unless `y` is given. `menu` makes it a drop-down. */
const tab = <T>(key: string, label: string, tip: string, page: number, [x, w, y = TAB_Y, menu = false]: [number, number, number?, boolean?], values: readonly T[], names: string[], get: (p: Params) => T, set: (p: Params, v: T) => void): Control => ({
  kind: "tab", key, label, tip, page, x, y, w, options: names, ...(menu && { menu }),
  get: (p) => Math.max(0, values.indexOf(get(p))),
  set: (p, i) => set(p, values[i] ?? values[0]!),
});

const toggle = (key: string, label: string, tip: string, page: number, [x, w]: [number, number], get: (p: Params) => boolean, set: (p: Params, v: boolean) => void): Control => ({
  kind: "toggle", key, label, tip, page, x, y: TAB_Y, w, get: (p) => (get(p) ? 1 : 0), set: (p, v) => set(p, v > 0),
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
  dial("chordwin", "Chord Win", "Notes starting this close together count as one chord, so chords played a little off the grid are still chords.", 1, 4, 50, UNIT.ms, (p) => p.chordWindow, (p, v) => (p.chordWindow = v)),
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
  // Con: chromatic run and passing tone (bass), grace notes (top). The switches and amounts live in the picture.
  dial("chromatic", "Run %", "Chance of a semitone run into the next bass note.", 3, 0, 100, UNIT.pct, (p) => p.connect.chromatic, (p, v) => (p.connect.chromatic = v)),
  dial("steps", "Run Steps", "Run notes, 16ths each. Fewer when there is no room.", 3, 1, 6, UNIT.int, (p) => p.connect.steps, (p, v) => (p.connect.steps = Math.max(1, Math.round(v)))),
  dial("runvel", "Run Vel", "Velocity of run notes, as a % of the bass note they leave.", 3, 2, 100, UNIT.pct, (p) => p.connect.chromaticVelocity, (p, v) => (p.connect.chromaticVelocity = v)),
  dial("passing", "Pass %", "Chance of a scale tone between two bass notes, when no run was added. Needs Scale Mode.", 3, 3, 100, UNIT.pct, (p) => p.connect.passing, (p, v) => (p.connect.passing = v)),
  dial("passvel", "Pass Vel", "Velocity of passing tones, as a % of the bass note they leave.", 3, 4, 100, UNIT.pct, (p) => p.connect.passingVelocity, (p, v) => (p.connect.passingVelocity = v)),
  toggle("runon", "Run", "Turns chromatic runs on.", 3, [4, 44], (p) => p.connect.chromaticOn, (p, v) => (p.connect.chromaticOn = v)),
  tab("rundir", "Run From", "Side the run comes from: Auto follows the previous bass note, Up climbs from below, Down comes from above.", 3, [4, 46, TAB_Y, true], ["auto", "up", "down"] as const, ["Auto", "Up", "Down"], (p) => p.connect.runDirection, (p, v) => (p.connect.runDirection = v)),
  toggle("passon", "Passing", "Turns passing tones on.", 3, [100, 48], (p) => p.connect.passingOn, (p, v) => (p.connect.passingOn = v)),
  dial("grace", "Grace %", "Chance of grace notes before the top note.", 3, 0, 100, UNIT.pct, (p) => p.connect.grace, (p, v) => (p.connect.grace = v)),
  dial("gracesteps", "Steps", "Grace notes climbing into the top note. Fewer when there is no room.", 3, 1, 6, UNIT.int, (p) => p.connect.graceSteps, (p, v) => (p.connect.graceSteps = Math.max(1, Math.round(v)))),
  dial("gracevel", "Velocity", "Velocity of grace notes, as a % of the top note they lead into.", 3, 2, 100, UNIT.pct, (p) => p.connect.graceVelocity, (p, v) => (p.connect.graceVelocity = v)),
  toggle("graceon", "Grace", "Turns grace notes on.", 3, [4, 44], (p) => p.connect.graceOn, (p, v) => (p.connect.graceOn = v)),
  tab("gracelen", "Grace Len", "Length of each grace note: 1/64, 1/32 or 1/16 of a beat.", 3, [52, 46, TAB_Y, true], [1 / 64, 1 / 32, 1 / 16] as const, ["1/64", "1/32", "1/16"], (p) => p.connect.graceLength, (p, v) => (p.connect.graceLength = v)),
  tab("gracescale", "Grace Scale", "In: grace notes step through Live's scale. Out: by semitones, leaving the scale.", 3, [100, 48, TAB_Y, true], ["in", "out"] as const, ["In", "Out"], (p) => p.connect.graceScale, (p, v) => (p.connect.graceScale = v)),
];

// Strum works in guitar mode only; spread and pedal in piano mode only.
for (const c of CONTROLS) {
  if (c.page === 2) c.mode = "guitar";
  else if (c.key === "spread" || c.key === "pedal") c.mode = "piano";
}

// ---------------------------------------------------------------- devices

/** A value shown in the picture: `label` overrides the control's; clicking the label flips `toggle`. */
export type Field = { key: string; label?: string; toggle?: string };
export type Picture = "humanize" | "swing" | "pedal" | "strum" | "connect";
/** One page of the picture: what it draws and the values above it, row by row (null leaves a cell empty). */
export type ViewPage = { picture: Picture; rows: (Field | null)[][] };

/**
 * humino.amxd holds every control; the others do one stage each and switch the rest off,
 * so they can be run one after another from the Transform tab.
 */
export type Device = {
  id: string;
  /** File name without .amxd; Live lists the tool under this name. */
  file: string;
  pageNames: string[];
  /** Control keys per page. */
  pages: string[][];
  /** Tab positions that differ from the full device: [x, w, y]. */
  place?: Record<string, [number, number, number]>;
  /** The picture (src/view.ts): where it sits ([x, y, w, h]) and what it shows on each page. */
  view: { rect: [number, number, number, number]; pages: ViewPage[] };
  params: () => Params;
};

const zeros = () => new Array<number>(16).fill(0);
/** Every stage off: humanize at 0, no groove, piano without pedal, Connect off. */
export const neutral = (): Params => ({
  mode: "piano",
  groove: { ...DEFAULT_GROOVE, timing: zeros(), velocity: zeros(), swing: 0 },
  humanize: { ...DEFAULT_HUMANIZE, drift: 0, jitter: 0, spread: 0, velJitter: 0, chordBalance: 0, legato: 0, lengthJitter: 0 },
  strum: { ...DEFAULT_STRUM },
  pedal: "off",
  connect: { ...DEFAULT_CONNECT },
  chordWindow: DEFAULT_PARAMS.chordWindow,
});
const only = (f: (p: Params) => void) => () => {
  const p = neutral();
  f(p);
  return p;
};
const keysOn = (page: number) => CONTROLS.filter((c) => c.page === page).map((c) => c.key);
const f = (key: string, label?: string, toggle?: string): Field => ({ key, ...(label && { label }), ...(toggle && { toggle }) });

const HUM: Field[][] = [
  [f("drift"), f("jitter")],
  [f("spread"), f("vel")],
  [f("length"), f("legato")],
];
const STRUM: (Field | null)[][] = [
  [f("down"), f("up")],
  [f("speedjitter"), f("taper")],
  [f("upskip"), f("overlap")],
];
const CON: (Field | null)[][] = [
  [f("chromatic", "Run", "runon"), f("steps", "Steps"), f("runvel", "Vel")],
  [f("passing", "Pass", "passon"), null, f("passvel", "Vel")],
  [f("grace", "Grace", "graceon"), f("gracesteps", "Steps"), f("gracevel", "Vel")],
];

export const DEVICES: Device[] = [
  {
    id: "all",
    file: "humino",
    pageNames: PAGES,
    pages: PAGES.map((_, i) => keysOn(i)),
    view: {
      rect: [4, 21, 144, 104],
      pages: [
        { picture: "humanize", rows: HUM },
        { picture: "swing", rows: [[f("swing"), f("beatweight")], [f("chordbal"), f("driftreturn")], [f("chordwin"), null]] },
        { picture: "strum", rows: STRUM },
        { picture: "connect", rows: CON },
      ],
    },
    params: () => JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as Params,
  },
  {
    id: "humanize",
    file: "humino Humanize",
    pageNames: ["Humanize"],
    pages: [[...keysOn(0), "beatweight", "chordbal", "driftreturn", "chordwin"]],
    view: { rect: [4, 4, 144, 139], pages: [{ picture: "humanize", rows: [...HUM, [f("beatweight"), f("chordbal")], [f("driftreturn"), f("chordwin")]] }] },
    params: only((p) => (p.humanize = { ...DEFAULT_HUMANIZE })),
  },
  {
    id: "swing",
    file: "humino Swing",
    pageNames: ["Swing"],
    pages: [["swing", "grid"]],
    place: { grid: [4, 144, 4] },
    view: { rect: [4, 23, 144, 120], pages: [{ picture: "swing", rows: [[f("swing")]] }] },
    params: only((p) => (p.groove.swing = 33)),
  },
  {
    id: "strum",
    file: "humino Strum",
    pageNames: ["Strum"],
    pages: [[...keysOn(2), "chordwin"]],
    view: { rect: [4, 4, 144, 121], pages: [{ picture: "strum", rows: [...STRUM, [f("chordwin"), null]] }] },
    params: only((p) => (p.mode = "guitar")),
  },
  {
    id: "pedal",
    file: "humino Pedal",
    pageNames: ["Pedal"],
    pages: [["pedal"]],
    place: { pedal: [4, 144, 4] },
    view: { rect: [4, 23, 144, 120], pages: [{ picture: "pedal", rows: [] }] },
    params: only((p) => (p.pedal = "chord")),
  },
  {
    id: "connect",
    file: "humino Connect",
    pageNames: ["Connect"],
    pages: [[...keysOn(3), "chordwin"]],
    view: { rect: [4, 4, 144, 121], pages: [{ picture: "connect", rows: [...CON, [f("chordwin", "Win"), null, null]] }] },
    params: only((p) => Object.assign(p.connect, { chromaticOn: true, passingOn: true, graceOn: true })),
  },
];

/** Keys the picture shows (values and switches): their dials and buttons stay off the panel. */
export const inPicture = (d: Device) => new Set(d.view.pages.flatMap((pg) => pg.rows.flat().flatMap((x) => (x ? [x.key, ...(x.toggle ? [x.toggle] : [])] : []))));

/** The device's controls with their page and position on its panel. */
export function layout(d: Device): Control[] {
  return d.pages.flatMap((keys, page) =>
    keys.map((key) => {
      const c = CONTROLS.find((x) => x.key === key)!;
      if (c.kind !== "tab") return { ...c, page };
      const [x, w, y] = d.place?.[key] ?? [c.x, c.w, c.y];
      return { ...c, page, x, w, y };
    }),
  );
}
