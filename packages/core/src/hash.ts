// SPDX-License-Identifier: MIT

import type { Note } from "./types.js";

/**
 * Order-independent hash of a clip's notes, ignoring `selected` (ADR-0002).
 * Times are rounded to 1/10000 beat so float noise from Live's round trip
 * does not break the match.
 */
export function hashNotes(notes: readonly Note[]): string {
  const rows = notes
    .map((n) =>
      [
        n.pitch,
        n.startTime.toFixed(4),
        n.duration.toFixed(4),
        n.velocity === undefined ? "" : Math.round(n.velocity),
        n.muted ? 1 : 0,
        n.probability ?? "",
        n.velocityDeviation ?? "",
        n.releaseVelocity ?? "",
      ].join(","),
    )
    .sort();
  return cyrb53(rows.join(";"));
}

/** 53-bit string hash (cyrb53, public domain). */
function cyrb53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
