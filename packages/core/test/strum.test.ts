// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis.js";
import { createRng } from "../src/rng.js";
import { applyStrum, chordKey, DEFAULT_STRUM, resolveMotion, strumDirection, type StrumParams } from "../src/strum.js";
import type { Note } from "../src/types.js";

const E_MAJOR = [40, 47, 52, 56, 59, 64];
const chordAt = (startTime: number, duration = 0.5): Note[] =>
  E_MAJOR.map((pitch) => ({ pitch, startTime, duration, velocity: 100 }));

// 60 BPM: 1 ms = 0.001 beat, so offsets are easy to read.
const run = (notes: Note[], p: Partial<StrumParams> = {}) => {
  const a = analyze(notes);
  const work = notes.map((n) => ({ ...n }));
  const params = { ...DEFAULT_STRUM, speedJitter: 0, ...p };
  const dropped = applyStrum(work, a, a.groups.map(() => true), params, { tempo: 60, seed: 1 }, createRng(1));
  return { work, dropped, a, params };
};

describe("strum direction", () => {
  it("follows 8th motion: on-beat down, off-beat up", () => {
    const notes = [0, 0.5, 1, 1.5].flatMap((s) => chordAt(s));
    const { a, params } = run(notes);
    expect(resolveMotion(a, params)).toBe(8);
    expect(a.groups.map((g) => strumDirection(g, 8, params))).toEqual(["down", "up", "down", "up"]);
  });

  it("switches to 16th motion when a chord sits on a 16th", () => {
    const notes = [0, 0.75, 1].flatMap((s) => chordAt(s, 0.25));
    const { a, params } = run(notes);
    expect(resolveMotion(a, params)).toBe(16);
    expect(a.groups.map((g) => strumDirection(g, 16, params))).toEqual(["down", "up", "down"]);
  });

  it("honours all-down and forced directions", () => {
    const notes = [0, 0.5].flatMap((s) => chordAt(s));
    const { a } = run(notes);
    const p = { ...DEFAULT_STRUM, direction: "down" as const, chords: { [chordKey(0)]: { direction: "up" as const } } };
    expect(a.groups.map((g) => strumDirection(g, 8, p))).toEqual(["up", "down"]);
  });
});

describe("applyStrum", () => {
  it("spreads a downstroke low to high and aligns the ends", () => {
    const { work } = run(chordAt(1), { taper: 10 });
    expect(work.map((n) => n.startTime)).toEqual([1, 1.006, 1.012, 1.018, 1.024, 1.03]);
    for (const n of work) expect(n.startTime + n.duration).toBeCloseTo(1.5);
    expect(work.map((n) => n.velocity)).toEqual([100, 98, 96, 94, 92, 90]);
  });

  it("plays upstrokes high to low; missed low strings ring on from the downstroke", () => {
    const { work, dropped } = run([...chordAt(0), ...chordAt(0.5)], { upSkip: 2 });
    expect([...dropped].sort()).toEqual([6, 7]);
    expect(work[11]!.startTime).toBe(0.5);
    expect(work[8]!.startTime).toBeCloseTo(0.52);
    expect(work[0]!.startTime + work[0]!.duration).toBeCloseTo(1);
    expect(work[1]!.startTime + work[1]!.duration).toBeCloseTo(1);
    // re-struck strings keep their own end (they are not stretched to the cut)
    expect(work[5]!.startTime + work[5]!.duration).toBeCloseTo(0.5);
  });

  it("keeps a missed low note when nothing was ringing on it", () => {
    const { work, dropped } = run(chordAt(0.5), { upSkip: 2 });
    expect(dropped.size).toBe(0);
    expect(work[5]!.startTime).toBe(0.5);
    expect(work[0]!.startTime).toBeCloseTo(0.52); // played last, at the end of the stroke
  });

  it("centre anchor starts half the stroke early, clamped at 0", () => {
    const { work } = run(chordAt(0), { anchor: "center" });
    expect(work[0]!.startTime).toBe(0);
    const later = run(chordAt(1), { anchor: "center" }).work;
    expect(later[0]!.startTime).toBeCloseTo(0.985);
  });

  it("per-chord speed and up skip override the globals", () => {
    const { work, dropped } = run(chordAt(0.5), { chords: { [chordKey(0.5)]: { speed: 50, upSkip: 0 } } });
    expect(dropped.size).toBe(0);
    expect(work[0]!.startTime).toBeCloseTo(0.55);
  });

  it("lets notes ring when the next chord does not reuse their string", () => {
    const held: Note[] = [40, 47].map((pitch) => ({ pitch, startTime: 0, duration: 4, velocity: 100 }));
    const high: Note[] = [64, 67, 71].map((pitch) => ({ pitch, startTime: 0.25, duration: 0.25, velocity: 100 }));
    const { work } = run([...held, ...high], { overlap: 5 });
    expect(work[0]!.startTime + work[0]!.duration).toBeCloseTo(4);
    expect(work[1]!.startTime + work[1]!.duration).toBeCloseTo(4);
  });

  it("keeps each note's own end instead of the longest one", () => {
    const notes: Note[] = [
      { pitch: 40, startTime: 0, duration: 2, velocity: 100 },
      { pitch: 52, startTime: 0, duration: 0.5, velocity: 100 },
    ];
    const { work } = run(notes);
    expect(work[1]!.startTime + work[1]!.duration).toBeCloseTo(0.5);
  });

  it("does not cut held notes for a nearby but different pitch", () => {
    const held: Note[] = [52, 56, 59].map((pitch) => ({ pitch, startTime: 0, duration: 4, velocity: 100 }));
    const fill: Note[] = [54, 57].map((pitch) => ({ pitch, startTime: 0.5, duration: 0.25, velocity: 100 }));
    const { work } = run([...held, ...fill]);
    for (const n of work.slice(0, 3)) expect(n.startTime + n.duration).toBeCloseTo(4);
  });

  it("cuts the previous chord just after the next one starts", () => {
    const notes = [...chordAt(0, 4), ...chordAt(1)];
    const { work } = run(notes, { overlap: 5 });
    expect(work[0]!.startTime + work[0]!.duration).toBeCloseTo(1.005);
  });
});
