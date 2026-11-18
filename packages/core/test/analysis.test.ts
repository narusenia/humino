// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze, metricLevel, msToBeats, targetGroups } from "../src/analysis.js";
import type { Note } from "../src/types.js";

const n = (startTime: number, pitch = 60, extra: Partial<Note> = {}): Note => ({ pitch, startTime, duration: 0.25, ...extra });

describe("metricLevel", () => {
  it("ranks positions in 4/4", () => {
    expect([0, 2, 1, 3, 0.5, 0.25, 4].map((s) => metricLevel(s, 4, false))).toEqual([0, 1, 2, 2, 3, 4, 0]);
  });
  it("treats triplet off-beats as level 3", () => {
    expect(metricLevel(1 / 3, 4, true)).toBe(3);
    expect(metricLevel(1 / 6, 4, true)).toBe(4);
  });
});

describe("analyze", () => {
  it("groups chords and sorts by pitch", () => {
    const a = analyze([n(0, 64), n(0, 48), n(0.004, 55), n(1, 60)]);
    expect(a.groups.map((g) => g.idx)).toEqual([[1, 2, 0], [3]]);
    expect(a.groupOf).toEqual([0, 0, 0, 1]);
  });
  it("finds 16th steps", () => {
    const a = analyze([n(0), n(0.25), n(1.75), n(4.5)]);
    expect(a.triplet).toBe(false);
    expect(a.groups.map((g) => g.step)).toEqual([0, 1, 7, 2]);
  });
  it("keeps a straight clip straight despite one triplet fill", () => {
    const eighths = [0, 0.5, 1, 1.5, 2, 2.5].map((t) => ({ pitch: 60, startTime: t, duration: 0.25 }));
    const a = analyze([...eighths, { pitch: 62, startTime: 3 + 1 / 3, duration: 0.25 }]);
    expect(a.triplet).toBe(false);
    expect(a.groups[1]!.step).toBe(2);
  });

  it("detects triplet clips", () => {
    const a = analyze([n(0), n(1 / 3), n(2 / 3)]);
    expect(a.triplet).toBe(true);
    expect(a.groups.map((g) => g.step)).toEqual([0, 1, 2]);
  });
});

describe("targetGroups", () => {
  it("widens a selection to the whole chord", () => {
    const notes = [n(0, 48), n(0, 52, { selected: true }), n(1)];
    expect(targetGroups(notes, analyze(notes))).toEqual([true, false]);
  });
  it("targets everything when nothing is selected", () => {
    const notes = [n(0), n(1)];
    expect(targetGroups(notes, analyze(notes))).toEqual([true, true]);
  });
});

it("msToBeats", () => {
  expect(msToBeats(500, 120)).toBe(1);
});

describe("chord window", () => {
  it("joins a chord played slightly off the grid when the window allows it", () => {
    const loose = [0, 0.02, 0.035].map((startTime, i) => ({ pitch: 60 + i * 4, startTime, duration: 1 }));
    expect(analyze(loose).groups).toHaveLength(3);
    const a = analyze(loose, 4, 0.05);
    expect(a.groups).toHaveLength(1);
    const late = analyze(loose.map((n) => ({ ...n, startTime: n.startTime + 1.02 })), 4, 0.05);
    expect(late.groups[0]!.level).toBe(2); // 0.02 beat late is still on beat 2
  });
});
