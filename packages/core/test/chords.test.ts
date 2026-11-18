// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { chordLabel, degree, nameChord } from "../src/index.js";

const label = (...p: number[]) => {
  const c = nameChord(p);
  return c && chordLabel(c);
};
const C_MAJOR = { root: 0, intervals: [0, 2, 4, 5, 7, 9, 11] };

describe("nameChord", () => {
  it("names common shapes in any voicing", () => {
    expect(label(48, 64, 67, 72)).toBe("C");
    expect(label(57, 64, 69, 72)).toBe("Am");
    expect(label(40, 47, 52, 56, 59, 64)).toBe("E"); // open E on guitar
    expect(label(43, 59, 62, 65)).toBe("G7");
    expect(label(50, 60, 65, 69)).toBe("Dm7");
    expect(label(48, 52, 59)).toBe("Cmaj7"); // fifth left out
    expect(label(40, 47)).toBe("E5");
    expect(label(47, 50, 53, 57)).toBe("Bm7b5");
  });

  it("writes an inversion as a slash chord", () => {
    expect(label(52, 60, 67)).toBe("C/E");
    expect(label(45, 60, 64, 67)).toBe("Am7"); // A in the bass makes it Am7, not C6/A
  });

  it("gives up on single notes and unknown clusters", () => {
    expect(nameChord([60])).toBeUndefined();
    expect(nameChord([60, 61, 62])).toBeUndefined();
  });
});

describe("degree", () => {
  it("numbers chords against the scale root", () => {
    const d = (...p: number[]) => degree(nameChord(p)!, C_MAJOR);
    expect(d(48, 64, 67)).toBe("I");
    expect(d(57, 64, 69, 72)).toBe("vi");
    expect(d(43, 59, 62, 65)).toBe("V7");
    expect(d(50, 60, 65, 69)).toBe("ii7");
    expect(d(47, 50, 53, 57)).toBe("viiø7");
    expect(d(46, 62, 65)).toBe("bVII");
  });
});
