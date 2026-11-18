// SPDX-License-Identifier: MIT

/** Seeded PRNG (mulberry32): same seed, same humanization. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Standard normal sample (Box-Muller). */
  const gaussian = () => {
    const u = 1 - next(); // (0, 1], avoids log(0)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, gaussian };
}
