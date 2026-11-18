// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis.js";
import { applyPedal, type PedalMode } from "../src/pedal.js";
import type { Note } from "../src/types.js";

const run = (notes: Note[], mode: PedalMode, clipEnd?: number) => {
  const a = analyze(notes);
  const work = notes.map((n) => ({ ...n }));
  applyPedal(work, a, a.groups.map(() => true), mode, clipEnd);
  return work.map((n) => n.startTime + n.duration);
};

const chord = (startTime: number, pitches: number[]): Note[] => pitches.map((pitch) => ({ pitch, startTime, duration: 0.5 }));

describe("pseudo pedal", () => {
  it("holds notes to the end of the bar", () => {
    const notes = [...chord(0, [48, 64]), { pitch: 67, startTime: 1, duration: 0.25 }, ...chord(4, [50, 65])];
    expect(run(notes, "bar")).toEqual([4, 4, 4, 4.5, 4.5]);
  });

  it("holds until the bass changes", () => {
    const notes = [...chord(0, [48, 64]), ...chord(1, [48, 67]), ...chord(2, [53, 65])];
    expect(run(notes, "chord")).toEqual([1, 2, 2, 2, 2.5, 2.5]);
  });

  it("re-striking the same pitch cuts the held note", () => {
    const notes = [...chord(0, [48, 64]), ...chord(2, [52, 64])];
    expect(run(notes, "bar", 4)).toEqual([4, 2, 4, 4]);
  });

  it("without a clip end, the last note end bounds the last bar", () => {
    const notes = [...chord(0, [48, 64]), ...chord(2, [52, 64])];
    expect(run(notes, "bar")).toEqual([2.5, 2, 2.5, 2.5]);
  });

  it("off leaves notes alone", () => {
    expect(run(chord(0, [48, 64]), "off")).toEqual([0.5, 0.5]);
  });
});
