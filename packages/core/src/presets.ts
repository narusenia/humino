// SPDX-License-Identifier: MIT

import { DEFAULT_CONNECT } from "./connect.js";
import { DEFAULT_GROOVE } from "./groove.js";
import { DEFAULT_HUMANIZE } from "./humanize.js";
import { DEFAULT_PARAMS, type Mode, type Params } from "./pipeline.js";
import { DEFAULT_STRUM } from "./strum.js";

export type Preset = {
  name: string;
  /** "any" keeps whatever mode the dialog is in. */
  mode: Mode | "any";
  params: Params;
};

type Patch = {
  groove?: Partial<Params["groove"]>;
  humanize?: Partial<Params["humanize"]>;
  strum?: Partial<Params["strum"]>;
  pedal?: Params["pedal"];
};

const make = (name: string, mode: Mode | "any", patch: Patch): Preset => ({
  name,
  mode,
  params: {
    mode: mode === "any" ? DEFAULT_PARAMS.mode : mode,
    groove: { ...DEFAULT_GROOVE, ...patch.groove },
    humanize: { ...DEFAULT_HUMANIZE, ...patch.humanize },
    strum: { ...DEFAULT_STRUM, ...patch.strum },
    pedal: patch.pedal ?? "off",
    connect: DEFAULT_CONNECT,
  },
});

const scaledAccent = (k: number) => DEFAULT_GROOVE.velocity.map((v) => Math.round(v * k));

/** design.md「プリセット」. */
export const BUILTIN_PRESETS: Preset[] = [
  make("Acoustic Strum", "guitar", { strum: { motion: 8, downSpeed: 30 }, humanize: { drift: 12 } }),
  make("Funk 16", "guitar", { strum: { motion: 16, downSpeed: 12, upSpeed: 10, upSkip: 2 }, humanize: { legato: 0 } }),
  make("Ballad Arp", "guitar", { strum: { downSpeed: 70, upSpeed: 50 }, humanize: { legato: 80 } }),
  make("Ballad", "piano", { pedal: "chord", humanize: { chordBalance: 70, drift: 14 } }),
  make("Pop Tight", "piano", { humanize: { jitter: 2 }, groove: { velocity: scaledAccent(1.5) } }),
  make("Subtle", "any", {
    humanize: {
      drift: DEFAULT_HUMANIZE.drift / 2,
      jitter: DEFAULT_HUMANIZE.jitter / 2,
      velJitter: DEFAULT_HUMANIZE.velJitter / 2,
      chordBalance: DEFAULT_HUMANIZE.chordBalance / 2,
      lengthJitter: DEFAULT_HUMANIZE.lengthJitter / 2,
    },
    groove: { velocity: scaledAccent(0.5) },
    strum: { taper: DEFAULT_STRUM.taper / 2 },
  }),
];
