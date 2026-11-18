// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECT, DEFAULT_PARAMS, process, type ConnectParams, type Note, type Params } from "../src/index.js";

const C_MAJOR = { root: 0, intervals: [0, 2, 4, 5, 7, 9, 11] };
const still = { ...DEFAULT_PARAMS.humanize, drift: 0, jitter: 0, spread: 0, velJitter: 0, chordBalance: 0, lengthJitter: 0 };
const params = (c: Partial<ConnectParams>): Params => ({
  ...DEFAULT_PARAMS,
  humanize: still,
  groove: { ...DEFAULT_PARAMS.groove, swing: 0, velocity: DEFAULT_PARAMS.groove.velocity.map(() => 0) },
  connect: { ...DEFAULT_CONNECT, on: true, passing: 0, chromatic: 0, grace: 0, ...c },
});
const bass = (...pitches: number[]): Note[] => pitches.map((pitch, i) => ({ pitch, startTime: i * 2, duration: 2, velocity: 100 }));
const ctx = { tempo: 120, seed: 1, scale: C_MAJOR };

describe("connect", () => {
  it("adds nothing when off, and keeps the other stages as they were", () => {
    const off = process(bass(48, 55), params({ on: false, chromatic: 100 }), ctx);
    expect(off.added).toEqual([]);
    const on = process(bass(48, 55), params({ chromatic: 100 }), ctx);
    expect(on.snapshots.pedal).toEqual(off.snapshots.pedal);
  });

  it("runs into the next bass by semitones from the side of the previous one", () => {
    const up = process(bass(48, 55), params({ chromatic: 100, steps: 3 }), ctx);
    expect(up.added.map((n) => n.pitch)).toEqual([52, 53, 54]);
    expect(up.added.map((n) => n.startTime)).toEqual([1.25, 1.5, 1.75]);
    expect(up.final[0]!.duration).toBe(1.25); // previous note trimmed, total length kept
    expect(up.added[0]!.velocity).toBe(80);
    expect(process(bass(48, 55), params({ chromatic: 100, velocity: 50 }), ctx).added[0]!.velocity).toBe(50);
    const down = process(bass(55, 48), params({ chromatic: 100, steps: 2 }), ctx);
    expect(down.added.map((n) => n.pitch)).toEqual([50, 49]);
  });

  it("shortens the run to fit half the gap and skips gaps under an 8th", () => {
    const tight: Note[] = [0, 0.5, 0.75].map((startTime, i) => ({ pitch: [48, 55, 57][i]!, startTime, duration: 0.25, velocity: 100 }));
    const r = process(tight, params({ chromatic: 100, steps: 4 }), ctx);
    expect(r.added).toHaveLength(1); // 0 → 0.5 fits one 16th; 0.5 → 0.75 is too close
    expect(r.added[0]!.startTime).toBe(0.25);
  });

  it("picks the scale tone nearest the middle, and none without a scale", () => {
    const r = process(bass(48, 55), params({ passing: 100 }), ctx);
    expect(r.added.map((n) => n.pitch)).toEqual([52]); // C → G: D, E and F are in scale; E is nearest the middle
    const { scale: _s, ...noScale } = ctx;
    expect(process(bass(48, 55), params({ passing: 100 }), noScale).added).toEqual([]);
  });

  it("puts a grace note a scale step below the next top note", () => {
    const chords: Note[] = [0, 2].flatMap((startTime) => [48, 64, 72].map((pitch) => ({ pitch, startTime, duration: 2, velocity: 100 })));
    const r = process(chords, params({ grace: 100, graceLength: 1 / 32 }), ctx);
    expect(r.added).toEqual([{ pitch: 71, startTime: 2 - 1 / 32, duration: 1 / 32, velocity: 80 }]);
    expect(r.final[2]!.duration).toBe(2 - 1 / 32);
  });

  it("only connects targeted groups", () => {
    const notes = bass(48, 55, 60).map((n, i) => ({ ...n, selected: i === 2 }));
    const r = process(notes, params({ chromatic: 100 }), ctx);
    expect(r.added).toEqual([]); // 2 → 3 needs both selected; 1 → 2 has an unselected side
  });
});
