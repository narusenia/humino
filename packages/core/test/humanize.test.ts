// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { analyze, targetGroups } from "../src/analysis.js";
import { applyHumanize, DEFAULT_HUMANIZE, type HumanizeParams } from "../src/humanize.js";
import { createRng } from "../src/rng.js";
import type { Note } from "../src/types.js";

const chords = (): Note[] =>
  [0, 1, 2, 3].flatMap((b) => [48, 55, 64].map((pitch) => ({ pitch, startTime: b + 1, duration: 0.5, velocity: 90 })));

const run = (notes: Note[], p: HumanizeParams = DEFAULT_HUMANIZE, seed = 7) => {
  const a = analyze(notes);
  const work = notes.map((n) => ({ ...n }));
  applyHumanize(work, a, targetGroups(notes, a), p, { tempo: 120, seed }, createRng(seed));
  return work;
};

const zero: HumanizeParams = { drift: 0, driftReturn: 0.3, jitter: 0, beatWeight: 0, velJitter: 0, chordBalance: 0, legato: 0, lengthJitter: 0 };

describe("humanize", () => {
  it("is deterministic per seed", () => {
    expect(run(chords())).toEqual(run(chords()));
    expect(run(chords(), DEFAULT_HUMANIZE, 8)).not.toEqual(run(chords()));
  });

  it("moves chord notes together", () => {
    const out = run(chords());
    for (let c = 0; c < 4; c++) {
      const starts = out.slice(c * 3, c * 3 + 3).map((n) => n.startTime);
      expect(new Set(starts).size).toBe(1);
    }
    expect(out.some((n, i) => n.startTime !== chords()[i]!.startTime)).toBe(true);
  });

  it("does nothing with all amounts at zero", () => {
    expect(run(chords(), zero)).toEqual(chords());
  });

  it("chord balance lifts the top and the bass over inner notes", () => {
    const out = run(chords(), { ...zero, chordBalance: 100 });
    expect(out.slice(0, 3).map((n) => n.velocity)).toEqual([96, 84, 102]);
  });

  it("legato 100 % reaches the next chord", () => {
    const out = run(chords(), { ...zero, legato: 100 });
    expect(out[0]!.duration).toBe(1);
    expect(out[11]!.duration).toBe(0.5);
  });

  it("only touches selected chords but keeps the same drift", () => {
    const sel = chords();
    sel[4]!.selected = true; // second chord
    const part = run(sel);
    const full = run(chords());
    expect(part[0]).toEqual(chords()[0]);
    expect(part[3]!.startTime).toBe(full[3]!.startTime);
    expect(part[9]).toEqual(chords()[9]);
  });

  it("cuts a note before the same pitch sounds again", () => {
    const notes: Note[] = [
      { pitch: 60, startTime: 0, duration: 2 },
      { pitch: 60, startTime: 1, duration: 1 },
    ];
    expect(run(notes, zero)[0]!.duration).toBe(1);
  });
});
