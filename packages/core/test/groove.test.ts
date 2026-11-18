// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis.js";
import { applyGroove, DEFAULT_GROOVE, defaultGrooveVelocity, extractGroove } from "../src/groove.js";
import type { Note } from "../src/types.js";

const sixteenths = (): Note[] => Array.from({ length: 8 }, (_, i) => ({ pitch: 60, startTime: i * 0.25, duration: 0.25, velocity: 80 }));

const run = (notes: Note[], p = DEFAULT_GROOVE) => {
  const a = analyze(notes);
  const work = notes.map((n) => ({ ...n }));
  applyGroove(work, a, a.groups.map(() => true), p);
  return work;
};

describe("groove", () => {
  it("accents by beat position by default", () => {
    expect(defaultGrooveVelocity().slice(0, 9)).toEqual([8, -8, -4, -8, 0, -8, -4, -8, 4]);
  });

  it("swing 50 % on 16ths pushes odd 16ths by half a step", () => {
    const out = run(sixteenths(), { ...DEFAULT_GROOVE, velocity: new Array(16).fill(0), swing: 50 });
    expect(out.map((n) => n.startTime)).toEqual([0, 0.375, 0.5, 0.875, 1, 1.375, 1.5, 1.875]);
    expect(out.every((n) => n.velocity === 80)).toBe(true);
  });

  it("swing on 8ths moves only the 8th off-beats", () => {
    const out = run(sixteenths(), { ...DEFAULT_GROOVE, swing: 50, swingGrid: 8 });
    expect(out.map((n) => n.startTime)).toEqual([0, 0.25, 0.75, 0.75, 1, 1.25, 1.75, 1.75]);
  });

  it("step timing is a % of a step", () => {
    const timing = new Array(16).fill(0);
    timing[1] = -20;
    const out = run(sixteenths(), { ...DEFAULT_GROOVE, timing });
    expect(out[1]!.startTime).toBeCloseTo(0.2);
  });
});

describe("extractGroove", () => {
  it("gets back the step table a straight clip was played with", () => {
    const timing = [0, 12, -8, 20, 0, 10, -6, 18, 4, 12, -8, 20, 0, 10, -6, 18];
    const velocity = [10, -6, 2, -10, 6, -6, 2, -10, 8, -6, 2, -10, 6, -6, 2, -10];
    const straight: Note[] = Array.from({ length: 32 }, (_, i) => ({ pitch: 60, startTime: i * 0.25, duration: 0.25, velocity: 90 }));
    const played = run(straight, { ...DEFAULT_GROOVE, timing, velocity, swing: 0 });
    const g = extractGroove(played);
    expect(g.triplet).toBe(false);
    expect(g.timing).toEqual(timing);
    // velocity comes back relative to the clip's average
    const mean = velocity.reduce((a, b) => a + b, 0) / 16;
    g.velocity.forEach((v, k) => expect(Math.abs(v - (velocity[k]! - mean))).toBeLessThanOrEqual(1));
  });

  it("leaves steps nothing was played on at 0", () => {
    const quarters: Note[] = [0, 1, 2, 3].map((t) => ({ pitch: 60, startTime: t + 0.02, duration: 0.5, velocity: 80 }));
    const g = extractGroove(quarters, 0.01);
    expect(g.timing.filter((_, k) => k % 4 === 0)).toEqual([8, 8, 8, 8]);
    expect(g.timing.filter((_, k) => k % 4 !== 0).every((v) => v === 0)).toBe(true);
  });
});
