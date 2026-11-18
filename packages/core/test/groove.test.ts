// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis.js";
import { applyGroove, DEFAULT_GROOVE, defaultGrooveVelocity } from "../src/groove.js";
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
