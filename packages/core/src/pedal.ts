// SPDX-License-Identifier: MIT

import type { Analysis } from "./analysis.js";
import { nextSamePitch } from "./humanize.js";
import type { Note } from "./types.js";

export type PedalMode = "off" | "bar" | "chord";

/**
 * Pseudo sustain pedal: the SDK cannot write CC64, so notes are held to the end
 * of their segment instead (ADR-0001). Mutates `work`.
 */
export function applyPedal(work: Note[], a: Analysis, target: boolean[], mode: PedalMode, clipEnd?: number) {
  if (mode === "off") return;
  clipEnd ??= Math.max(...work.map((n) => n.startTime + n.duration));
  const segEnd = mode === "bar" ? barEnds(a, clipEnd) : chordEnds(work, a, clipEnd);

  a.groups.forEach((g, gi) => {
    if (!target[gi]) return;
    for (const i of g.idx) {
      const n = work[i]!;
      let end = Math.max(n.startTime + n.duration, segEnd[gi]!);
      const same = nextSamePitch(work, a, gi, n.pitch);
      if (same !== undefined) end = Math.min(end, same);
      n.duration = Math.max(n.duration, end - n.startTime);
    }
  });
}

function barEnds(a: Analysis, clipEnd: number): number[] {
  return a.groups.map((g) => Math.min(clipEnd, (Math.floor(g.start / a.beatsPerBar) + 1) * a.beatsPerBar));
}

/** A segment runs until the next chord whose bass differs; single notes stay in the current segment. */
function chordEnds(work: Note[], a: Analysis, clipEnd: number): number[] {
  const bass = (gi: number) => work[a.groups[gi]!.idx[0]!]!.pitch;
  const boundaries: number[] = [];
  let lastBass: number | undefined;
  a.groups.forEach((g, gi) => {
    if (g.idx.length < 2 || bass(gi) === lastBass) return;
    lastBass = bass(gi);
    boundaries.push(gi);
  });
  return a.groups.map((_, gi) => {
    const nb = boundaries.find((b) => b > gi);
    return nb === undefined ? clipEnd : Math.min(...a.groups[nb]!.idx.map((i) => work[i]!.startTime));
  });
}
