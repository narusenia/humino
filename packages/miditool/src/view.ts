// SPDX-License-Identifier: MIT

// The picture on the panel, running in a v8ui. Like Live's own MIDI Tools it shows the
// values as text (drag up / down to change them, click a switch's label to flip it)
// above a drawing of an example phrase run through @humino/core. Values come in from
// humino.ts as "value <key> <v>", the page as "page <i>", Live's scale as "scale <json>";
// edits go out as "<key> <v>" to the matching (hidden) dial or button.

import { CONTROLS, DEVICES, neutral, type Control, type Field, type Picture } from "./controls.js";
import { process, type Note, type Params, type Scale } from "@humino/core";

const g = globalThis as Record<string, unknown>;
g.inlets = 1;
g.outlets = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

const device = DEVICES.find((d) => d.id === g.HUMINO_DEVICE) ?? DEVICES[0]!;
let params: Params = device.params();
let page = 0;
let scale: Scale | undefined;
const control = (key: string) => CONTROLS.find((c) => c.key === key);

// ---------------------------------------------------------------- colours and text

const color = (name: string, fallback: number[]) => {
  try {
    const c = max.getcolor(name);
    return c.length >= 3 ? c : fallback;
  } catch {
    return fallback; // outside Live: keep a dark LCD look
  }
};
const rgba = (c: number[], a = 1) => mgraphics.set_source_rgba(c[0]!, c[1]!, c[2]!, (c[3] ?? 1) * a);
let C = { bg: [0, 0, 0, 1], frame: [0, 0, 0, 1], fg: [0, 0, 0, 1], title: [0, 0, 0, 1], dim: [0, 0, 0, 1] };
const text = (s: string, x: number, y: number) => {
  mgraphics.move_to(x, y);
  mgraphics.show_text(s);
  return x + mgraphics.text_measure(s)[0]!;
};
const line = (x1: number, y1: number, x2: number, y2: number) => {
  mgraphics.move_to(x1, y1);
  mgraphics.line_to(x2, y2);
  mgraphics.stroke();
};

const format = (c: Control, v: number) => {
  if (c.kind !== "dial") return String(v);
  if (c.unit === 2) return `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
  if (c.unit === 5) return `${Math.round(v)} %`;
  return String(Math.round(v));
};
/** Controls the current mode does not use are dimmed and locked, like greyed-out dials. */
const usable = (c: Control | undefined) => !!c && (!c.mode || c.mode === params.mode);

// ---------------------------------------------------------------- values row

const ROW_H = 12;
type Cell = { field: Field; x: number; y: number; w: number; labelEnd: number };
let cells: Cell[] = [];

const BOX = 9; // switch box + gap before a label
/** Label and value of a cell. */
const cellText = (field: Field) => {
  const c = control(field.key)!;
  return [field.label ?? c.label, format(c, c.get(params))] as const;
};

function drawFields(rows: (Field | null)[][], w: number) {
  cells = [];
  mgraphics.select_font_face("Ableton Sans Medium");
  // columns as wide as their widest cell, the rest of the width shared out as gaps;
  // a smaller size when the widest values do not fit
  const ncol = Math.max(0, ...rows.map((r) => r.length));
  // per column: the widest label (switch box included) and the widest value, so values line up
  let colL: number[] = [];
  let colW: number[] = [];
  for (const size of [9, 8.5, 8, 7.5]) {
    mgraphics.set_font_size(size);
    colL = new Array<number>(ncol).fill(0);
    const colV = new Array<number>(ncol).fill(0);
    for (const row of rows)
      row.forEach((field, k) => {
        if (!field || !control(field.key)) return;
        const [label, value] = cellText(field);
        colL[k] = Math.max(colL[k]!, (field.toggle ? BOX : 0) + mgraphics.text_measure(label)[0]!);
        colV[k] = Math.max(colV[k]!, mgraphics.text_measure(value)[0]!);
      });
    colW = colL.map((l, k) => l + 4 + colV[k]!);
    if (colW.reduce((s, x) => s + x, 0) + 6 * (ncol - 1) <= w - 8) break;
  }
  const gap = ncol > 1 ? Math.max(4, (w - 8 - colW.reduce((s, x) => s + x, 0)) / (ncol - 1)) : 0;
  const colX = colW.map((_, k) => 4 + colW.slice(0, k).reduce((s, x) => s + x + gap, 0));
  rows.forEach((row, r) => {
    row.forEach((field, k) => {
      if (!field) return;
      const c = control(field.key);
      if (!c) return;
      const cw = row.length === ncol ? colW[k]! + gap : w - 8;
      const x = colX[k]!;
      const y = 4 + r * ROW_H;
      const on = !field.toggle || control(field.toggle)!.get(params) > 0;
      const live = usable(c) && on;
      let lx = x;
      if (field.toggle) {
        // a small switch box before the label
        rgba(on ? C.fg : C.dim);
        mgraphics.rectangle(x + 0.5, y + 2.5, 6, 6);
        if (on) mgraphics.fill();
        else mgraphics.stroke();
        lx = x + BOX;
      }
      rgba(live ? C.title : C.dim);
      const [label, value] = cellText(field);
      const labelEnd = text(label, lx, y + 9);
      rgba(live ? C.fg : C.dim);
      text(value, row.length === ncol ? x + colL[k]! + 4 : labelEnd + 4, y + 9);
      cells.push({ field, x, y, w: cw, labelEnd });
    });
  });
  return 4 + rows.length * ROW_H + (rows.length ? 3 : 0);
}

// ---------------------------------------------------------------- pictures

type Area = { x: number; y: number; w: number; h: number };

/** A small piano roll: input outlines, result filled; `added` in the accent, the rest in the title colour. */
function roll(a: Area, beats: number, input: Note[], out: Note[], added: Note[] = []) {
  const x = (b: number) => a.x + (b / beats) * a.w;
  mgraphics.set_line_width(1);
  for (let b = 0; b <= beats * 4; b++) {
    rgba(C.frame, b % 4 === 0 ? 1 : 0.45);
    line(Math.round(x(b / 4)) + 0.5, a.y, Math.round(x(b / 4)) + 0.5, a.y + a.h);
  }
  const pitches = [...new Set([...input, ...added].map((n) => n.pitch))].sort((p, q) => q - p);
  const rowH = Math.min(12, a.h / pitches.length);
  const y0 = a.y + (a.h - rowH * pitches.length) / 2;
  const box = (n: Note) => {
    const left = x(n.startTime);
    mgraphics.rectangle(left, y0 + pitches.indexOf(n.pitch) * rowH + 1, Math.max(2, x(n.startTime + n.duration) - left - 1), Math.max(1, rowH - 2));
  };
  for (const n of input) {
    rgba(C.dim, 0.8);
    box(n);
    mgraphics.stroke();
  }
  for (const n of out) {
    rgba(added.length ? C.title : C.fg, added.length ? 0.55 : 0.9);
    box(n);
    mgraphics.fill();
  }
  for (const n of added) {
    rgba(C.fg);
    box(n);
    mgraphics.fill();
  }
}

const chord = (t: number, pitches: number[], duration: number): Note[] => pitches.map((pitch) => ({ pitch, startTime: t, duration, velocity: 100 }));
const ctx = { tempo: 120, seed: 1 };
const msOf = (beats: number) => (beats * 60000) / ctx.tempo;

const PICTURES: Record<Picture, (a: Area) => void> = {
  swing(a) {
    const p = neutral();
    p.groove.swing = params.groove.swing;
    p.groove.swingGrid = params.groove.swingGrid;
    const step = p.groove.swingGrid === 16 ? 0.25 : 0.5;
    const input = Array.from({ length: 2 / step }, (_, k) => ({ pitch: 60, startTime: k * step, duration: step / 2, velocity: 100 }));
    roll(a, 2, input, process(input, p, { ...ctx, clipEnd: 2 }).final);
  },

  pedal(a) {
    const p = neutral();
    p.pedal = params.pedal;
    // a bar of C, C, F, F with short notes; Chord holds until the bass changes
    const input = [0, 1, 2, 3].flatMap((t) => chord(t, t < 2 ? [48, 64, 67] : [53, 65, 69], 0.4));
    roll(a, 4, input, process(input, p, { ...ctx, clipEnd: 4 }).final);
  },

  humanize(a) {
    // timing only: two bars of chords on the beat, offset from the grid in ms (0 in the middle)
    const p = neutral();
    p.humanize = { ...params.humanize };
    const input = Array.from({ length: 8 }, (_, t) => chord(t, [48, 60, 64, 67], 0.5)).flat();
    const r = process(input, p, ctx);
    const range = Math.max(10, 2.5 * (p.humanize.drift + p.humanize.jitter + p.humanize.spread));
    const x = (b: number) => a.x + 4 + (b / 8) * (a.w - 8);
    const y = (ms: number) => a.y + a.h / 2 - (Math.max(-range, Math.min(range, ms)) / range) * (a.h / 2 - 3);
    rgba(C.frame);
    mgraphics.set_line_width(1);
    line(a.x, Math.round(y(0)) + 0.5, a.x + a.w, Math.round(y(0)) + 0.5);
    for (let b = 0; b <= 8; b += 4) line(Math.round(x(b)) + 0.5, a.y, Math.round(x(b)) + 0.5, a.y + a.h);
    // drift: the slow wander the chords follow
    rgba(C.fg, 0.45);
    mgraphics.set_line_width(1.5);
    r.drift.forEach((ms, k) => (k ? mgraphics.line_to(x(k), y(ms)) : mgraphics.move_to(x(k), y(ms))));
    mgraphics.stroke();
    // every note: where it lands
    input.forEach((n, i) => {
      const ms = msOf(r.final[i]!.startTime - n.startTime);
      rgba(C.fg, 0.35 + 0.65 * ((r.final[i]!.velocity ?? 100) / 127));
      mgraphics.rectangle(x(n.startTime) - 1.5, y(ms) - 1.5, 3, 3);
      mgraphics.fill();
    });
    rgba(C.dim);
    mgraphics.set_font_size(8);
    text(`±${Math.round(range)} ms`, a.x + a.w - 34, a.y + 8);
  },

  strum(a) {
    // one downstroke and one upstroke of an open E chord, each string's start in ms
    const p = neutral();
    p.mode = "guitar";
    // auto motion needs a whole phrase to decide; the picture assumes 8ths
    const motion = params.strum.motion === "auto" ? 8 : params.strum.motion;
    p.strum = { ...params.strum, motion };
    const shape = [40, 47, 52, 56, 59, 64];
    const second = motion === 16 ? 0.25 : 0.5;
    const input = [...chord(0, shape, second), ...chord(second, shape, second)];
    const r = process(input, p, ctx);
    const offs = input.map((n, i) => msOf(r.final[i]!.startTime - n.startTime));
    const lo = Math.min(0, ...offs);
    const span = Math.max(40, Math.max(...offs) - lo) * 1.15;
    const half = (a.w - 6) / 2;
    [0, 1].forEach((k) => {
      const px = a.x + k * (half + 6);
      const x = (ms: number) => px + 4 + ((ms - lo) / span) * (half - 8);
      const y = (string: number) => a.y + 12 + (string / 5) * (a.h - 18);
      const idx = shape.map((_, s) => k * 6 + s);
      const sounding = idx.filter((i) => !r.dropped.has(i)); // low to high
      const down = r.final[sounding[0]!]!.startTime <= r.final[sounding[sounding.length - 1]!]!.startTime;
      rgba(C.dim);
      mgraphics.set_font_size(8);
      text(params.mode === "guitar" ? (down ? "Down" : "Up") : "Guitar only", px + 4, a.y + 8);
      rgba(C.frame);
      mgraphics.set_line_width(1);
      line(Math.round(x(0)) + 0.5, a.y + 10, Math.round(x(0)) + 0.5, a.y + a.h);
      // strings, high E on top
      const pts: [number, number][] = [];
      idx.forEach((i, s) => {
        const yy = y(5 - s);
        rgba(C.frame, 0.6);
        line(px + 2, yy, px + half - 2, yy);
        if (r.dropped.has(i)) {
          rgba(C.dim);
          mgraphics.rectangle(x(offs[i]!) - 2, yy - 2, 4, 4);
          mgraphics.stroke();
          return;
        }
        pts.push([x(offs[i]!), yy]);
        rgba(C.fg, 0.35 + 0.65 * ((r.final[i]!.velocity ?? 100) / 127));
        mgraphics.rectangle(x(offs[i]!) - 2, yy - 2, 4, 4);
        mgraphics.fill();
      });
      pts.sort((p1, p2) => p1[0] - p2[0]);
      rgba(C.fg, 0.5);
      pts.forEach(([px1, py1], j) => (j ? mgraphics.line_to(px1, py1) : mgraphics.move_to(px1, py1)));
      mgraphics.stroke();
    });
  },

  connect(a) {
    // C → F → Am: the first change shows the run, the second the passing tone; grace notes on both
    const A = chord(0, [48, 64, 67, 72], 2);
    const B = chord(2, [53, 65, 69, 72], 2);
    const Am = chord(4, [57, 64, 69, 72], 2);
    const c = params.connect;
    const with_ = (run: boolean) => {
      const p = neutral();
      p.connect = { ...c, chromatic: run ? 100 : 0, passing: run ? 0 : 100, grace: 100 };
      return p;
    };
    const sc = scale ? { scale } : {};
    const r1 = process([...A, ...B], with_(true), { ...ctx, ...sc });
    const r2 = process([...B, ...Am], with_(false), { ...ctx, ...sc });
    roll(a, 6, [...A, ...B, ...Am], [...r1.final.slice(0, 4), ...r2.final], [...r1.added, ...r2.added]);
    rgba(C.dim);
    mgraphics.set_font_size(8);
    const name = scale ? `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][scale.root % 12]} ${scale.name ?? ""}`.trim() : "No scale";
    const tw = mgraphics.text_measure(name)[0]!;
    rgba(C.bg, 0.85); // keep the name readable over the notes
    mgraphics.rectangle(a.x + a.w - tw - 4, a.y, tw + 4, 10);
    mgraphics.fill();
    rgba(C.dim);
    text(name, a.x + a.w - tw - 2, a.y + 8);
  },
};

// ---------------------------------------------------------------- paint

g.paint = () => {
  try {
    draw();
  } catch (e) {
    post(`humino view: ${String(e)}\n`); // shows in the Max window instead of a blank panel
  }
};

function draw() {
  const s = mgraphics.size;
  const [w, h] = s && s[0] && s[1] ? [s[0], s[1]] : device.view.rect.slice(2);
  C = {
    bg: color("live_lcd_bg", [0.07, 0.07, 0.07, 1]),
    frame: color("live_lcd_frame", [0.25, 0.25, 0.25, 1]),
    fg: color("live_lcd_control_fg", [0.36, 0.93, 0.95, 1]),
    title: color("live_lcd_title", [0.85, 0.85, 0.85, 1]),
    dim: color("live_lcd_passive", [0.45, 0.45, 0.45, 1]),
  };
  rgba(C.bg);
  mgraphics.rectangle_rounded(0.5, 0.5, w! - 1, h! - 1, 4, 4);
  mgraphics.fill_preserve();
  rgba(C.frame);
  mgraphics.set_line_width(1);
  mgraphics.stroke();

  const vp = device.view.pages[page] ?? device.view.pages[0]!;
  const top = drawFields(vp.rows, w!);
  PICTURES[vp.picture]({ x: 4, y: top, w: w! - 8, h: h! - top - 4 });
}

// ---------------------------------------------------------------- messages and mouse

g.value = (key: string, v: number) => {
  control(key)?.set(params, v);
  mgraphics.redraw();
};
g.page = (i: number) => {
  page = i;
  mgraphics.redraw();
};
g.scale = (json: string) => {
  try {
    scale = (JSON.parse(json) as Scale | null) ?? undefined;
  } catch {
    scale = undefined;
  }
  mgraphics.redraw();
};
/** humino.ts also tells the picture the mode, so mode-only values dim. */
g.mode = (m: string) => {
  params = { ...params, mode: m === "guitar" ? "guitar" : "piano" };
  mgraphics.redraw();
};

let drag: { key: string; y: number; v: number } | undefined;
g.onclick = (x: number, y: number) => {
  drag = undefined;
  const cell = cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + ROW_H);
  if (!cell) return;
  const t = cell.field.toggle && control(cell.field.toggle);
  if (t && x < cell.labelEnd) {
    const v = t.get(params) > 0 ? 0 : 1;
    t.set(params, v);
    mgraphics.redraw();
    outlet(0, t.key, v);
    return;
  }
  const c = control(cell.field.key);
  if (usable(c)) drag = { key: cell.field.key, y, v: c!.get(params) };
};
g.ondrag = (_x: number, y: number, button: number) => {
  if (!drag) return;
  if (!button) {
    drag = undefined; // mouse up
    return;
  }
  const c = control(drag.key)!;
  if (c.kind !== "dial") return;
  // about 150 px for the whole range, like a Live dial; whole numbers for counts
  const raw = Math.min(c.max, Math.max(0, drag.v + ((drag.y - y) * c.max) / 150));
  const v = c.unit === 0 ? Math.round(raw) : Math.round(raw * 10) / 10;
  if (v === c.get(params)) return;
  c.set(params, v);
  mgraphics.redraw();
  outlet(0, c.key, v);
};
