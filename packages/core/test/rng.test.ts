// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createRng } from "../src/index.js";

describe("createRng", () => {
  it("is deterministic per seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 5 }, a.next);
    expect(Array.from({ length: 5 }, b.next)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c.next)).not.toEqual(seqA);
  });

  it("stays in [0, 1) and gaussian is roughly standard", () => {
    const r = createRng(1);
    const xs = Array.from({ length: 10000 }, r.next);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const gs = Array.from({ length: 10000 }, r.gaussian);
    const mean = gs.reduce((s, g) => s + g, 0) / gs.length;
    const sd = Math.sqrt(gs.reduce((s, g) => s + (g - mean) ** 2, 0) / gs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });
});
