// SPDX-License-Identifier: MIT

import {
  analyze,
  BUILTIN_PRESETS,
  chordKey,
  resolveMotion,
  strumDirection,
  DEFAULT_PARAMS,
  defaultGrooveVelocity,
  process,
  type Mode,
  type Params,
  type Preset,
  type Note,
  type Stage,
} from "@humino/core";
import type { DialogInput, DialogOutput } from "../src/dialog.js";

declare global {
  interface Window {
    HUMINO: DialogInput;
    webkit?: { messageHandlers?: { live?: { postMessage(m: unknown): void } } };
    chrome?: { webview?: { postMessage(m: unknown): void } };
  }
}

const input = window.HUMINO;
const ja = input.language === "JA";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------- state

let params: Params = clone(input.params);
let seed = input.seed;
type Tab = "groove" | "humanize" | "strum" | "connect";
let tab: Tab = "humanize";
let userPresets: Preset[] = clone(input.presets);
let presetsChanged = false;
let presetIndex = -1;
/** Stroke directions fixed by Strum Down / Up; Clear empties it. */
let forced = { ...input.forced };
const allPresets = () => [...BUILTIN_PRESETS, ...userPresets];
const triplet = analyze(input.notes).triplet;

function close(out: DialogOutput) {
  const message = { method: "close_and_send", params: [JSON.stringify(out)] };
  if (window.webkit?.messageHandlers?.live) window.webkit.messageHandlers.live.postMessage(message);
  else window.chrome?.webview?.postMessage(message);
}
const presetsOut = () => (presetsChanged ? { presets: userPresets } : {});

// ---------------------------------------------------------------- parameter definitions

type Section = "groove" | "humanize" | "strum";
type NumDef = {
  kind: "num";
  section: Section;
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  tip: [en: string, ja: string];
  advanced?: boolean;
  mode?: Mode;
};
type ChoiceDef = {
  kind: "choice";
  section: Section | "pedal";
  key: string;
  label: string;
  options: [value: string | number, label: string][];
  tip: [string, string];
  advanced?: boolean;
  mode?: Mode;
};
type Def = NumDef | ChoiceDef;

const HUMANIZE: Def[] = [
  { kind: "num", section: "humanize", key: "drift", label: "drift", min: 0, max: 40, step: 0.5, unit: "ms", tip: ["Slow timing wander that comes and goes", "ゆっくり走って戻るタイミングの揺れ"] },
  { kind: "num", section: "humanize", key: "jitter", label: "jitter", min: 0, max: 20, step: 0.5, unit: "ms", tip: ["Small per-note timing error", "ノートごとの細かいずれ"] },
  { kind: "num", section: "humanize", key: "beatWeight", label: "beat weight", min: 0, max: 100, step: 1, unit: "%", tip: ["Keeps strong beats tighter than off-beats", "表拍を裏拍よりきっちり保つ"] },
  { kind: "num", section: "humanize", key: "velJitter", label: "vel ±", min: 0, max: 30, step: 1, tip: ["Random velocity change", "ベロシティのランダムな増減"] },
  { kind: "num", section: "humanize", key: "chordBalance", label: "chord bal", min: 0, max: 100, step: 1, unit: "%", tip: ["Louder top and bass, softer inner notes", "和音の最高音と最低音を強く、中の音を弱く"] },
  { kind: "num", section: "humanize", key: "legato", label: "legato", min: 0, max: 100, step: 1, unit: "%", tip: ["Closes the gap to the next note", "次のノートとの隙間を詰める"] },
  { kind: "num", section: "humanize", key: "lengthJitter", label: "length ±", min: 0, max: 30, step: 1, unit: "%", tip: ["Random length change", "ノート長のランダムな増減"] },
  { kind: "num", section: "humanize", key: "driftReturn", label: "drift return", min: 0, max: 1, step: 0.01, advanced: true, tip: ["How fast the drift comes back to the grid", "揺れがグリッドへ戻る速さ"] },
];

const STRUM: Def[] = [
  { kind: "choice", section: "strum", key: "direction", label: "direction", options: [["auto", "auto"], ["down", "all down"]], mode: "guitar", tip: ["Follow the strumming hand, or downstrokes only", "腕の振りに合わせるか、全部ダウンにするか"] },
  { kind: "choice", section: "strum", key: "motion", label: "motion", options: [["auto", "auto"], [8, "8th"], [16, "16th"]], mode: "guitar", tip: ["How fast the hand moves up and down", "腕を振る細かさ"] },
  { kind: "num", section: "strum", key: "downSpeed", label: "down", min: 0, max: 120, step: 1, unit: "ms", mode: "guitar", tip: ["Time from first to last string on a downstroke", "ダウンで最初の弦から最後の弦までの時間"] },
  { kind: "num", section: "strum", key: "upSpeed", label: "up", min: 0, max: 120, step: 1, unit: "ms", mode: "guitar", tip: ["Same for upstrokes", "アップの同じ時間"] },
  { kind: "num", section: "strum", key: "upSkip", label: "up skip", min: 0, max: 3, step: 1, mode: "guitar", tip: ["Low strings left out on upstrokes", "アップで省く低音弦の数"] },
  { kind: "num", section: "strum", key: "taper", label: "taper", min: 0, max: 30, step: 1, mode: "guitar", tip: ["Later strings get softer", "後から鳴る弦ほど弱くする"] },
  { kind: "choice", section: "pedal", key: "pedal", label: "pedal", options: [["off", "off"], ["bar", "bar"], ["chord", "chord"]], mode: "piano", tip: ["Hold notes to the end of the bar or chord", "小節またはコードの終わりまでノートを伸ばす"] },
  { kind: "num", section: "strum", key: "speedJitter", label: "speed ±", min: 0, max: 50, step: 1, unit: "%", advanced: true, mode: "guitar", tip: ["Stroke speed varies per chord", "和音ごとのストロークの速さの揺れ"] },
  { kind: "choice", section: "strum", key: "anchor", label: "anchor", options: [["first", "first"], ["center", "center"]], advanced: true, mode: "guitar", tip: ["Which string lands on the grid", "グリッドに合わせる弦"] },
  { kind: "num", section: "strum", key: "overlap", label: "overlap", min: 0, max: 20, step: 1, unit: "ms", advanced: true, mode: "guitar", tip: ["How long a chord rings into the next one", "次の和音に重ねて残す時間"] },
];

const GROOVE: Def[] = [
  { kind: "num", section: "groove", key: "swing", label: "swing", min: 0, max: 75, step: 1, unit: "%", tip: ["Pushes off-beats later", "裏のステップを後ろへずらす"] },
  { kind: "choice", section: "groove", key: "swingGrid", label: "swing grid", options: [[8, "8th"], [16, "16th"]], tip: ["Which off-beats swing", "Swing をかける細かさ"] },
];

type Bag = Record<string, unknown>;
const bag = (section: Def["section"]): Bag => (section === "pedal" ? (params as unknown as Bag) : (params[section] as unknown as Bag));
const defaultBag = (section: Def["section"]): Bag =>
  section === "pedal" ? (DEFAULT_PARAMS as unknown as Bag) : (DEFAULT_PARAMS[section] as unknown as Bag);
const enabled = (d: Def) => !d.mode || d.mode === params.mode;

function edited() {
  presetIndex = -1;
  renderPresetName();
  schedule();
}

// ---------------------------------------------------------------- controls

function format(d: NumDef, v: number) {
  return d.step < 1 ? v.toFixed(d.step < 0.1 ? 2 : 1) : String(Math.round(v));
}

function numControl(d: NumDef) {
  const b = bag(d.section);
  const value = h("div", { className: "value" });
  const fill = h("div");
  const el = h("div", { className: `param${enabled(d) ? "" : " disabled"}`, title: d.tip[ja ? 1 : 0] }, h("span", { className: "label" }, d.label), value, h("div", { className: "track" }, fill));
  const show = () => {
    const v = b[d.key] as number;
    value.replaceChildren(format(d, v), ...(d.unit ? [h("span", { className: "unit" }, d.unit)] : []));
    fill.style.width = `${((v - d.min) / (d.max - d.min)) * 100}%`;
  };
  const set = (v: number) => {
    b[d.key] = Math.min(d.max, Math.max(d.min, Math.round(v / d.step) * d.step));
    show();
    edited();
  };
  value.addEventListener("pointerdown", (e) => {
    e.preventDefault(); // no text selection while dragging
    value.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const v0 = b[d.key] as number;
    const move = (m: PointerEvent) => set(v0 + ((y0 - m.clientY) * (d.max - d.min)) / (m.shiftKey ? 1000 : 200));
    value.addEventListener("pointermove", move);
    value.addEventListener("pointerup", () => value.removeEventListener("pointermove", move), { once: true });
  });
  value.addEventListener("dblclick", () => set(defaultBag(d.section)[d.key] as number));
  show();
  return el;
}

function segmented(options: [string | number, string][], get: () => unknown, onPick: (v: string | number) => void, disabled = false) {
  const group = h("div", { className: "segmented" });
  group.setAttribute("role", "radiogroup");
  const paint = () =>
    group.querySelectorAll("button").forEach((btn, i) => btn.setAttribute("aria-checked", String(options[i]![0] === get())));
  for (const [value, label] of options) {
    const btn = h("button", { disabled, onclick: () => (onPick(value), paint()) }, label);
    btn.setAttribute("role", "radio");
    group.append(btn);
  }
  paint();
  return group;
}

function choiceControl(d: ChoiceDef) {
  const b = bag(d.section);
  return h(
    "div",
    { className: `param choice${enabled(d) ? "" : " disabled"}`, title: d.tip[ja ? 1 : 0] },
    h("span", { className: "label" }, d.label),
    segmented(d.options, () => b[d.key], (v) => ((b[d.key] = v), edited()), !enabled(d)),
  );
}

const control = (d: Def) => (d.kind === "num" ? numControl(d) : choiceControl(d));

function group(defs: Def[]) {
  const main = defs.filter((d) => !d.advanced);
  const adv = defs.filter((d) => d.advanced);
  const out: HTMLElement[] = [h("div", { className: "row" }, ...main.map(control))];
  if (adv.length) out.push(h("details", { className: "advanced" }, h("summary", {}, "advanced"), h("div", { className: "row" }, ...adv.map(control))));
  return out;
}

// ---------------------------------------------------------------- groove step table

function grooveTable() {
  const steps = h("div", { className: "steps" });
  const active = triplet ? 12 : 16;
  const g = params.groove;
  const defaults = { timing: new Array(16).fill(0) as number[], velocity: defaultGrooveVelocity() };
  const ranges = { timing: 50, velocity: 40 };
  const halves: Record<"timing" | "velocity", HTMLElement[]> = { timing: [], velocity: [] };

  const paintBar = (kind: "timing" | "velocity", i: number) => {
    const bar = halves[kind][i]!.firstElementChild as HTMLElement;
    const v = g[kind][i] ?? 0;
    const pct = (Math.abs(v) / ranges[kind]) * 50;
    bar.style.top = v >= 0 ? `${50 - pct}%` : "50%";
    bar.style.height = `${Math.max(pct, 1)}%`;
  };

  for (let i = 0; i < 16; i++) {
    const col = h("div", { className: `step${i % (triplet ? 3 : 4) === 0 ? " beat" : ""}${i >= active ? " inactive" : ""}` });
    for (const kind of ["timing", "velocity"] as const) {
      const half = h("div", { className: "half", title: kind === "timing" ? (ja ? "タイミング（ステップに対する %）" : "timing (% of a step)") : ja ? "ベロシティ" : "velocity" }, h("div", { className: "bar" }));
      half.dataset.kind = kind;
      half.dataset.index = String(i);
      half.addEventListener("dblclick", () => {
        g[kind][i] = defaults[kind][i]!;
        paintBar(kind, i);
        edited();
      });
      halves[kind].push(half);
      col.append(half);
    }
    steps.append(col);
  }

  // Draw across columns: the row (timing / velocity) is fixed by where the drag started.
  steps.addEventListener("pointerdown", (e) => {
    const start = (e.target as HTMLElement).closest<HTMLElement>(".half");
    if (!start) return;
    const kind = start.dataset.kind as "timing" | "velocity";
    e.preventDefault();
    steps.setPointerCapture(e.pointerId);
    const paint = (ev: PointerEvent) => {
      const cols = halves[kind];
      const i = cols.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return ev.clientX >= r.left - 2 && ev.clientX <= r.right + 2;
      });
      if (i < 0 || i >= active) return;
      const r = cols[i]!.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      g[kind][i] = Math.round((0.5 - t) * 2 * ranges[kind]);
      paintBar(kind, i);
      edited();
    };
    paint(e);
    steps.addEventListener("pointermove", paint);
    steps.addEventListener("pointerup", () => steps.removeEventListener("pointermove", paint), { once: true });
  });

  for (let i = 0; i < 16; i++) (["timing", "velocity"] as const).forEach((k) => paintBar(k, i));
  const legend = h("div", { className: "steps-legend" }, h("span", {}, "timing"), h("span", {}, "velocity"));
  const side = h("div", {}, ...group(GROOVE));
  return h("div", { className: "groove" }, legend, steps, side);
}

// ---------------------------------------------------------------- layout

const TABS: [Tab, string, Stage | null][] = [
  ["groove", "groove", "groove"],
  ["humanize", "humanize", "humanize"],
  ["strum", "strum", "strum"],
  ["connect", "connect", null],
];
const STAGE_COLOR: Record<Tab, string> = {
  groove: "--stage-groove",
  humanize: "--stage-humanize",
  strum: "--stage-strum",
  connect: "--stage-connect",
};

function renderTabs() {
  const nav = $("tabs");
  nav.replaceChildren(
    ...TABS.map(([id, label]) => {
      const btn = h("button", { disabled: id === "connect", onclick: () => ((tab = id), renderTabs(), renderParams(), schedule()) }, label);
      if (id === "connect") btn.append(h("span", { className: "badge" }, "v2"));
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(id === tab));
      btn.style.setProperty("--tab-color", `var(${STAGE_COLOR[id]})`);
      return btn;
    }),
  );
}

function renderParams() {
  const main = $("params");
  main.style.setProperty("--section", `var(${STAGE_COLOR[tab]})`);
  if (tab === "groove") main.replaceChildren(grooveTable());
  else if (tab === "humanize") main.replaceChildren(...group(HUMANIZE));
  else main.replaceChildren(...group(STRUM), fixedRow());
}

/** Shows how many chords Strum Down / Up fixed, with a way to release them. */
function fixedRow() {
  const n = Object.keys(forced).length;
  const text = ja ? `向きを固定した和音：${n}` : `fixed chords: ${n}`;
  const clear = h("button", { disabled: n === 0, onclick: () => ((forced = {}), renderParams(), edited()) }, "Clear");
  clear.title = ja ? "Strum Down / Up で固定した向きを解除して自動に戻す" : "Release directions fixed by Strum Down / Up";
  return h("div", { className: "fixed" }, h("span", { className: "label" }, text), clear);
}

function renderMode() {
  $("mode").replaceChildren(
    ...segmented(
      [
        ["guitar", "Guitar"],
        ["piano", "Piano"],
      ],
      () => params.mode,
      (v) => {
        params.mode = v as Mode;
        renderParams();
        edited();
      },
    ).childNodes,
  );
}

function renderPresetName() {
  $("preset-name").textContent = presetIndex >= 0 ? allPresets()[presetIndex]!.name : "custom";
}

function loadPreset(i: number) {
  const list = allPresets();
  presetIndex = (i + list.length) % list.length;
  const p = list[presetIndex]!;
  const mode = params.mode;
  params = clone(p.params);
  params.mode = p.mode === "any" ? mode : p.mode;
  renderMode();
  renderParams();
  renderPresetName();
  schedule();
}

function renderSeed() {
  $("seed").textContent = String(seed).padStart(3, "0");
}

// ---------------------------------------------------------------- preview

const canvas = $<HTMLCanvasElement>("preview");
const PAD = 12;
/** Visible time window in beats; null = whole clip. */
let view: { t0: number; t1: number } | null = null;
let fullEnd = 1;
let chordHits: { x: number; key: string }[] = [];

const span = () => view ?? { t0: 0, t1: fullEnd };
const plotWidth = () => canvas.getBoundingClientRect().width - PAD * 2;

canvas.addEventListener("click", (e) => {
  const px = e.clientX - canvas.getBoundingClientRect().left;
  const hit = chordHits.reduce<{ x: number; key: string } | undefined>(
    (best, c) => (Math.abs(c.x - px) <= 8 && (!best || Math.abs(c.x - px) < Math.abs(best.x - px)) ? c : best),
    undefined,
  );
  if (!hit) return;
  const next = { undefined: "down", down: "up", up: undefined } as const;
  const to = next[String(forced[hit.key]) as keyof typeof next];
  forced = { ...forced };
  if (to) forced[hit.key] = to;
  else delete forced[hit.key];
  renderParams(); // refresh the fixed-chords count
  edited();
});

// Pinch or ⌘/Ctrl + scroll zooms around the pointer; plain scroll pans; double-click shows the whole clip.
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const { t0, t1 } = span();
    const len = t1 - t0;
    const perPx = len / plotWidth();
    if (e.ctrlKey || e.metaKey) {
      const at = t0 + (e.clientX - canvas.getBoundingClientRect().left - PAD) * perPx;
      const nextLen = Math.min(fullEnd, Math.max(0.5, len * Math.exp(e.deltaY * 0.01)));
      const k = (at - t0) / len;
      setView(at - k * nextLen, nextLen);
    } else {
      setView(t0 + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * perPx, len);
    }
  },
  { passive: false },
);
canvas.addEventListener("dblclick", () => ((view = null), schedule()));

function setView(t0: number, len: number) {
  const start = Math.min(Math.max(0, t0), Math.max(0, fullEnd - len));
  view = len >= fullEnd ? null : { t0: start, t1: start + len };
  schedule();
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    draw();
  });
}

function roundRect(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, hh: number) {
  c.beginPath();
  c.roundRect(x0, y0, w, hh, Math.min(2, w / 2, hh / 2));
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const { width: w, height: hgt } = canvas.getBoundingClientRect();
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const color = (v: string) => css.getPropertyValue(v).trim();
  c.clearRect(0, 0, w, hgt);

  const notes = input.notes;
  if (!notes.length) {
    c.fillStyle = color("--text-dim");
    c.font = `13px ${color("--font")}`;
    c.fillText(ja ? "ノートがありません" : "no notes", 16, 24);
    return;
  }

  const r = process(notes, { ...params, strum: { ...params.strum, forced } }, { tempo: input.tempo, seed, clipEnd: input.clipEnd });
  const final = r.snapshots.pedal;
  fullEnd = Math.max(input.clipEnd, ...final.map((n) => n.startTime + n.duration), 1);
  const { t0, t1 } = span();
  const showArrows = tab === "strum" && params.mode === "guitar";
  const top = showArrows ? 22 : 8;

  // Fold: one row per pitch that is used, like Live's Fold.
  const pitches = [...new Set(notes.map((n) => n.pitch))].sort((a, b) => b - a);
  const row = new Map(pitches.map((p, k) => [p, k]));
  const rowH = Math.min(18, (hgt - top - 6) / pitches.length);
  const noteH = Math.max(2, rowH - 2);
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (w - PAD * 2);
  const y = (p: number) => top + row.get(p)! * rowH;
  const pxPerBeat = (w - PAD * 2) / (t1 - t0);
  const targeted = (i: number) => r.target[r.analysis.groupOf[i]!];

  c.save();
  c.beginPath();
  c.rect(PAD - 2, 0, w - PAD * 2 + 4, hgt);
  c.clip();

  // grid: bars always, beats once there is room
  c.lineWidth = 1;
  const beatStep = pxPerBeat >= 24 ? 1 : 4;
  for (let b = Math.floor(t0 / beatStep) * beatStep; b <= t1; b += beatStep) {
    c.strokeStyle = color("--line");
    c.globalAlpha = b % 4 === 0 ? 1 : 0.5;
    c.beginPath();
    c.moveTo(Math.round(x(b)) + 0.5, top - 4);
    c.lineTo(Math.round(x(b)) + 0.5, hgt);
    c.stroke();
  }

  // originals: faint outline
  c.globalAlpha = 0.6;
  c.strokeStyle = color("--muted");
  for (const n of notes) {
    roundRect(c, x(n.startTime) + 0.5, y(n.pitch) + 0.5, Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), noteH);
    c.stroke();
  }

  // results: notes the open tab's stage changed (start, length or velocity) take its colour
  const before: Record<Stage, Note[]> = { groove: notes, humanize: r.snapshots.groove, strum: r.snapshots.humanize, pedal: r.snapshots.strum };
  const changedBy = (stage: Stage, i: number) => {
    const a = before[stage][i]!;
    const b = r.snapshots[stage][i]!;
    return Math.abs(a.startTime - b.startTime) > 1e-6 || Math.abs(a.duration - b.duration) > 1e-6 || a.velocity !== b.velocity;
  };
  const tabStages: Record<Tab, Stage[]> = { groove: ["groove"], humanize: ["humanize"], strum: ["strum", "pedal"], connect: [] };
  final.forEach((n, i) => {
    if (r.dropped.has(i)) return;
    const hit = targeted(i) && tabStages[tab].some((st) => changedBy(st, i));
    c.globalAlpha = !targeted(i) ? 0.25 : hit ? 0.95 : 0.55;
    c.fillStyle = hit ? color(STAGE_COLOR[tab]) : color("--text");
    roundRect(c, x(n.startTime) + 0.5, y(n.pitch) + 0.5, Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), noteH);
    c.fill();
  });

  // how far the open tab's stage moved each note: a line from the previous start
  const activeStage = TABS.find(([id]) => id === tab)![2];
  if (activeStage) {
    c.globalAlpha = 0.9;
    c.strokeStyle = color(STAGE_COLOR[tab]);
    c.lineWidth = 2;
    notes.forEach((_, i) => {
      if (!targeted(i) || r.dropped.has(i)) return;
      const from = x(before[activeStage][i]!.startTime);
      const to = x(r.snapshots[activeStage][i]!.startTime);
      if (Math.abs(to - from) < 1.5) return;
      const py = y(notes[i]!.pitch) + noteH / 2 + 0.5;
      c.beginPath();
      c.moveTo(from, py);
      c.lineTo(to, py);
      c.stroke();
    });
  }

  // stroke arrows on the strum tab: click to cycle auto → down → up → auto
  chordHits = [];
  if (showArrows) {
    const p = { ...params.strum, forced };
    const motion = resolveMotion(r.analysis, p);
    let lastX = -Infinity;
    for (const g of r.analysis.groups) {
      if (g.idx.length < 2) continue;
      const px = Math.round(x(g.start)) + 4.5;
      if (px - lastX < 14 || px < PAD - 4 || px > w - PAD + 4) continue; // too crowded or off screen: zoom in
      lastX = px;
      const key = chordKey(g.start);
      const down = strumDirection(g, motion, p) === "down";
      c.globalAlpha = 1;
      c.strokeStyle = forced[key] ? color("--stage-strum") : color("--text-dim");
      c.lineWidth = forced[key] ? 1.75 : 1.25;
      const [tip, tail] = down ? [16, 5] : [5, 16];
      const dir = down ? -1 : 1;
      c.beginPath();
      c.moveTo(px, tail);
      c.lineTo(px, tip);
      c.moveTo(px - 3.5, tip + 3.5 * dir);
      c.lineTo(px, tip);
      c.lineTo(px + 3.5, tip + 3.5 * dir);
      c.stroke();
      chordHits.push({ x: px, key });
    }
  }

  // drift curve on the humanize tab
  if (tab === "humanize" && r.drift.length > 1) {
    // Fixed ±50 ms axis so the curve grows with the drift amount instead of always filling the box.
    const RANGE_MS = 50;
    const mid = top + (hgt - top) / 2;
    const scale = ((hgt - top) / 2 - 8) / RANGE_MS;
    c.globalAlpha = 0.5;
    c.strokeStyle = color("--line");
    c.fillStyle = color("--text-dim");
    c.font = `10px ${color("--font")}`;
    for (const ms of [-RANGE_MS, 0, RANGE_MS]) {
      const py = mid - ms * scale;
      c.setLineDash(ms === 0 ? [3, 3] : [1, 4]);
      c.beginPath();
      c.moveTo(PAD, py);
      c.lineTo(w - PAD, py);
      c.stroke();
      if (ms) c.fillText(`${ms > 0 ? "+" : ""}${ms} ms`, PAD + 2, py - 3);
    }
    c.setLineDash([]);
    c.globalAlpha = 0.9;
    c.strokeStyle = color("--stage-humanize");
    c.lineWidth = 1.5;
    c.beginPath();
    r.analysis.groups.forEach((g, gi) => {
      const px = x(g.start);
      const py = mid - Math.max(-RANGE_MS, Math.min(RANGE_MS, r.drift[gi]!)) * scale;
      gi ? c.lineTo(px, py) : c.moveTo(px, py);
    });
    c.stroke();
  }
  c.restore();

  // zoom hint
  if (view) {
    c.globalAlpha = 1;
    c.fillStyle = color("--text-dim");
    c.font = `11px ${color("--font")}`;
    c.textAlign = "right";
    c.fillText(`${(t1 - t0).toFixed(1)} beats · ${ja ? "ダブルクリックで全体" : "double-click: whole clip"}`, w - PAD, hgt - 6);
    c.textAlign = "start";
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------- wiring

const selected = input.notes.filter((n) => n.selected).length;
$("count").textContent = selected
  ? ja ? `${selected} ノートを選択中` : `${selected} notes selected`
  : ja ? `${input.notes.length} ノート（クリップ全体）` : `${input.notes.length} notes (whole clip)`;

$("prev").onclick = () => loadPreset(presetIndex < 0 ? allPresets().length - 1 : presetIndex - 1);
$("next").onclick = () => loadPreset(presetIndex + 1);
$("menu").onclick = () => {
  const panel = $("menu-panel");
  panel.hidden = !panel.hidden;
  $("menu").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) $("preset-input").focus();
};
$("save").onclick = () => {
  const name = $<HTMLInputElement>("preset-input").value.trim();
  if (!name || BUILTIN_PRESETS.some((p) => p.name === name)) return;
  userPresets = [...userPresets.filter((p) => p.name !== name), { name, mode: params.mode, params: clone(params) }];
  presetsChanged = true;
  presetIndex = BUILTIN_PRESETS.length + userPresets.length - 1;
  renderPresetName();
  $("menu-panel").hidden = true;
};
$("delete").onclick = () => {
  if (presetIndex < BUILTIN_PRESETS.length) return; // builtins cannot be deleted
  userPresets.splice(presetIndex - BUILTIN_PRESETS.length, 1);
  presetsChanged = true;
  presetIndex = -1;
  renderPresetName();
  $("menu-panel").hidden = true;
};
$("reseed").onclick = () => {
  seed = Math.floor(Math.random() * 1000);
  renderSeed();
  schedule();
};
$("cancel").onclick = () => close(presetsOut());
$("apply").onclick = () => close({ apply: { params, seed, forced }, ...presetsOut() });
document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  if (e.key === "Escape") close(presetsOut());
  if (e.key === "Enter") close({ apply: { params, seed, forced }, ...presetsOut() });
});
new ResizeObserver(schedule).observe(canvas);

renderMode();
renderTabs();
renderParams();
renderPresetName();
renderSeed();
schedule();
