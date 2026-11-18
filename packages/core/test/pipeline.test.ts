// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { BUILTIN_PRESETS, DEFAULT_PARAMS, hashNotes, process, type Note, type Params } from "../src/index.js";

const chords = (): Note[] =>
  [0, 0.5, 1, 1.5].flatMap((startTime) =>
    [40, 47, 52, 56, 59, 64].map((pitch) => ({ pitch, startTime, duration: 0.5, velocity: 90 })),
  );
const ctx = { tempo: 100, seed: 3 };

describe("process", () => {
  it("does not modify its input and is deterministic", () => {
    const input = chords();
    const a = process(input, DEFAULT_PARAMS, ctx);
    expect(input).toEqual(chords());
    expect(process(input, DEFAULT_PARAMS, ctx).notes).toEqual(a.notes);
  });

  it("drops upstroke-skipped notes in guitar mode only", () => {
    const guitar = process(chords(), DEFAULT_PARAMS, ctx);
    expect(guitar.notes).toHaveLength(24 - 2); // two upstrokes, one low string each
    const piano: Params = { ...DEFAULT_PARAMS, mode: "piano" };
    expect(process(chords(), piano, ctx).notes).toHaveLength(24);
  });

  it("changing strum settings leaves the humanize stage unchanged", () => {
    const a = process(chords(), DEFAULT_PARAMS, ctx);
    const b = process(chords(), { ...DEFAULT_PARAMS, strum: { ...DEFAULT_PARAMS.strum, downSpeed: 80 } }, ctx);
    expect(b.snapshots.humanize).toEqual(a.snapshots.humanize);
    expect(b.snapshots.strum).not.toEqual(a.snapshots.strum);
  });

  it("leaves unselected chords untouched", () => {
    const input = chords();
    input[6]!.selected = true; // second chord
    const out = process(input, DEFAULT_PARAMS, ctx).snapshots.pedal;
    expect(out.slice(0, 6)).toEqual(input.slice(0, 6));
    expect(out.slice(12)).toEqual(input.slice(12));
    expect(out.slice(6, 12)).not.toEqual(input.slice(6, 12));
  });
});

describe("hashNotes", () => {
  it("ignores order, selection and float noise", () => {
    const a = chords();
    const b = [...chords()].reverse().map((n, i) => ({ ...n, selected: i % 2 === 0, startTime: n.startTime + 1e-6 }));
    expect(hashNotes(b)).toBe(hashNotes(a));
  });
  it("changes when a note changes", () => {
    const b = chords();
    b[0]!.velocity = 91;
    expect(hashNotes(b)).not.toBe(hashNotes(chords()));
  });
});

it("every builtin preset runs", () => {
  for (const p of BUILTIN_PRESETS) expect(process(chords(), p.params, ctx).notes.length).toBeGreaterThan(0);
});
