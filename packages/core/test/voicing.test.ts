// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, DEFAULT_VOICING, process, voice, type Note, type Params } from "../src/index.js";

const chord = (t: number, ...pitches: number[]): Note[] => pitches.map((pitch) => ({ pitch, startTime: t, duration: 1, velocity: 90 }));
const on = { ...DEFAULT_VOICING, on: true };
const shape = (notes: Note[]) => notes.map((n) => `${n.string}:${n.pitch}`).join(" ");

describe("voice", () => {
  it("finds the open shapes for chords a pianist would write", () => {
    expect(voice(chord(0, 48, 52, 55, 60, 64), on).map((n) => n.pitch)).toEqual([48, 52, 55, 60, 64]); // C x32010
    expect(voice(chord(0, 45, 52, 57, 60, 64), on).map((n) => n.pitch)).toEqual([45, 52, 57, 60, 64]); // Am x02210
    expect(voice(chord(0, 40, 47, 52, 56, 59, 64), on).map((n) => n.pitch)).toEqual([40, 47, 52, 56, 59, 64]); // E 022100
  });

  it("turns a close piano chord into a playable shape and numbers the strings", () => {
    const out = voice(chord(0, 60, 64, 67), on); // C in the middle of the keyboard
    expect(new Set(out.map((n) => n.pitch % 12))).toEqual(new Set([0, 4, 7]));
    expect(out[0]!.pitch % 12).toBe(0); // C stays in the bass
    expect(Math.max(...out.map((n) => n.pitch))).toBeGreaterThanOrEqual(64);
    const strings = out.map((n) => n.string!);
    expect(new Set(strings).size).toBe(out.length); // one note per string
    expect(strings).toEqual([...strings].sort((a, b) => b - a)); // low string first
    expect(out.every((n) => n.velocity === 90 && n.duration === 1)).toBe(true);
  });

  it("uses the tuning and the capo", () => {
    const d = voice(chord(0, 38, 45, 50, 57, 62, 66), { on: true, tuning: "dropd", capo: 0 });
    expect(d[0]!.pitch).toBe(38); // low D on the dropped string
    expect(d[0]!.string).toBe(6);
    const capo2 = voice(chord(0, 50, 54, 57, 62, 66), { on: true, tuning: "standard", capo: 2 }); // D as a C shape at capo 2
    expect(capo2.map((n) => n.pitch)).toEqual([50, 54, 57, 62, 66]);
  });

  it("keeps single notes and unselected chords as they are", () => {
    const notes = [...chord(0, 48, 52, 55), ...chord(1, 60), ...chord(2, 60, 64, 67).map((n) => ({ ...n, selected: false }))];
    notes[0]!.selected = true;
    const out = voice(notes, on);
    expect(out.slice(-4).map((n) => n.pitch)).toEqual([60, 60, 64, 67]);
  });

  it("strums voiced chords string by string", () => {
    const g: Params = { ...DEFAULT_PARAMS, mode: "guitar", humanize: { ...DEFAULT_PARAMS.humanize, drift: 0, jitter: 0, spread: 0 } };
    const r = process(voice(chord(0, 48, 52, 55, 60, 64), on), g, { tempo: 120, seed: 1 });
    const byTime = [...r.notes].sort((a, b) => a.startTime - b.startTime);
    expect(byTime.map((n) => n.string)).toEqual([5, 4, 3, 2, 1]); // a downstroke from the 5th string
    expect(shape(byTime)).toContain("5:48");
  });
});
