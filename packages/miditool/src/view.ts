// SPDX-License-Identifier: MIT

// The picture on a stage device's panel, running in a v8ui. It runs an example phrase
// through @humino/core with the device's current settings and draws it like a small
// piano roll: the input as outlines, the result filled. Values come in from humino.ts
// as "value <key> <v>"; dragging sends "<key> <v>" out to the matching dial.

import { CONTROLS, DEVICES } from "./controls.js";
import { process, type Note, type Params } from "@humino/core";

const g = globalThis as Record<string, unknown>;
g.inlets = 1;
g.outlets = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

const device = DEVICES.find((d) => d.id === g.HUMINO_DEVICE) ?? DEVICES[0]!;
const params: Params = device.params();

type Picture = {
  /** Beats shown. */
  beats: number;
  notes: () => Note[];
  /** Title and value text at the top left. */
  title: () => [string, string];
  /** Vertical drag, like Live's dials: the key it moves and how much per pixel upward. */
  drag?: { key: string; min: number; max: number; perPx: number; get: () => number };
};

const PICTURES: Record<string, Picture> = {
  swing: {
    beats: 2,
    // one note per grid step, half a step long, so the shift is easy to see
    notes: () => {
      const step = params.groove.swingGrid === 16 ? 0.25 : 0.5;
      return Array.from({ length: 2 / step }, (_, k) => ({ pitch: 60, startTime: k * step, duration: step / 2, velocity: 100 }));
    },
    title: () => ["Swing", `${params.groove.swing.toFixed(1)} %`],
    drag: { key: "swing", min: 0, max: 75, perPx: 0.5, get: () => params.groove.swing },
  },
  pedal: {
    beats: 4,
    // a bar of C, C, F, F with short notes; Chord holds until the bass changes
    notes: () =>
      [0, 1, 2, 3].flatMap((t) => (t < 2 ? [48, 64, 67] : [53, 65, 69]).map((pitch) => ({ pitch, startTime: t, duration: 0.4, velocity: 100 }))),
    title: () => ["Pedal", { off: "Off", bar: "Bar", chord: "Chord" }[params.pedal]],
  },
};
const pic = PICTURES[device.id]!;

// ---------------------------------------------------------------- drawing

const color = (name: string, fallback: number[]) => {
  try {
    const c = max.getcolor(name);
    return c.length >= 3 ? c : fallback;
  } catch {
    return fallback; // outside Live: keep a dark LCD look
  }
};
const rgba = (c: number[], a = 1) => mgraphics.set_source_rgba(c[0]!, c[1]!, c[2]!, (c[3] ?? 1) * a);

const PAD = 6;
const TOP = 20;
const size = (): [number, number] => {
  const s = mgraphics.size;
  return s && s[0] && s[1] ? [s[0], s[1]] : [144, 120];
};

g.paint = () => {
  const [w, h] = size();
  const bg = color("live_lcd_bg", [0.07, 0.07, 0.07, 1]);
  const frame = color("live_lcd_frame", [0.25, 0.25, 0.25, 1]);
  const fg = color("live_lcd_control_fg", [0.36, 0.93, 0.95, 1]);
  const title = color("live_lcd_title", [0.85, 0.85, 0.85, 1]);
  const dim = color("live_lcd_passive", [0.45, 0.45, 0.45, 1]);

  rgba(bg);
  mgraphics.rectangle_rounded(0.5, 0.5, w - 1, h - 1, 4, 4);
  mgraphics.fill_preserve();
  rgba(frame);
  mgraphics.set_line_width(1);
  mgraphics.stroke();

  // title and value, like Live's own MIDI Tools
  const [name, value] = pic.title();
  mgraphics.select_font_face("Ableton Sans Medium");
  mgraphics.set_font_size(10);
  rgba(title);
  mgraphics.move_to(PAD, 13);
  mgraphics.show_text(name);
  rgba(fg);
  mgraphics.move_to(PAD + mgraphics.text_measure(name)[0]! + 6, 13);
  mgraphics.show_text(value);

  // grid: beats, then the roll
  const x0 = PAD;
  const plotW = w - PAD * 2;
  const top = TOP + 2;
  const bottom = h - PAD;
  const x = (beat: number) => x0 + (beat / pic.beats) * plotW;
  for (let b = 0; b <= pic.beats * 4; b++) {
    rgba(frame, b % 4 === 0 ? 1 : 0.45);
    mgraphics.move_to(Math.round(x(b / 4)) + 0.5, top);
    mgraphics.line_to(Math.round(x(b / 4)) + 0.5, bottom);
    mgraphics.stroke();
  }

  const input = pic.notes();
  const out = process(input, params, { tempo: 120, seed: 1, clipEnd: pic.beats }).final;
  const pitches = [...new Set(input.map((n) => n.pitch))].sort((a, b) => b - a);
  const rowH = Math.min(14, (bottom - top) / pitches.length);
  const y0 = top + (bottom - top - rowH * pitches.length) / 2;
  const y = (p: number) => y0 + pitches.indexOf(p) * rowH + 1;
  const bar = (n: Note) => [x(n.startTime), y(n.pitch), Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), rowH - 2] as const;

  mgraphics.set_line_width(1);
  for (const n of input) {
    rgba(dim, 0.8);
    mgraphics.rectangle(...bar(n));
    mgraphics.stroke();
  }
  for (const n of out) {
    rgba(fg, 0.9);
    mgraphics.rectangle(...bar(n));
    mgraphics.fill();
  }
};

// ---------------------------------------------------------------- messages and mouse

/** From humino.ts: a control's current value. */
g.value = (key: string, v: number) => {
  const c = findControl(key);
  if (!c) return;
  c.set(params, v);
  mgraphics.redraw();
};

let dragFrom: { y: number; v: number } | undefined;
g.onclick = (_x: number, y: number) => {
  if (pic.drag) dragFrom = { y, v: pic.drag.get() };
};
g.ondrag = (_x: number, y: number, button: number) => {
  const d = pic.drag;
  if (!d || !dragFrom) return;
  if (!button) {
    dragFrom = undefined; // mouse up
    return;
  }
  const v = Math.round(Math.min(d.max, Math.max(d.min, dragFrom.v + (dragFrom.y - y) * d.perPx)) * 10) / 10;
  findControl(d.key)?.set(params, v);
  mgraphics.redraw();
  outlet(0, d.key, v);
};

function findControl(key: string) {
  return CONTROLS.find((c) => c.key === key);
}
