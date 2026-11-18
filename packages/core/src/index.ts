// SPDX-License-Identifier: MIT

export * from "./types.js";
export { createRng } from "./rng.js";
export { analyze, metricLevel, msToBeats, targetGroups, type Analysis, type Group } from "./analysis.js";
export { DEFAULT_GROOVE, defaultGrooveVelocity, type GrooveParams } from "./groove.js";
export { DEFAULT_HUMANIZE, driftCurve, type HumanizeParams } from "./humanize.js";
export { chordKey, DEFAULT_STRUM, resolveMotion, strumDirection, type ChordOverride, type Direction, type StrumParams } from "./strum.js";
export type { PedalMode } from "./pedal.js";
export { DEFAULT_CONNECT, type ConnectParams, type RunDirection, type Scale } from "./connect.js";
export { chordWindowBeats, completeParams, DEFAULT_PARAMS, noteKey, process, STAGES, type Mode, type NoteOverride, type Overrides, type Params, type Result, type Stage } from "./pipeline.js";
export { hashNotes } from "./hash.js";
export { BUILTIN_PRESETS, type Preset } from "./presets.js";
