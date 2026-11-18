// SPDX-License-Identifier: MIT

import {
  analyze,
  BUILTIN_PRESETS,
  DEFAULT_PARAMS,
  defaultGrooveVelocity,
  process,
  type Mode,
  type Params,
  type Preset,
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
  if (tab === "groove") main.replaceChildren(grooveTable());
  else if (tab === "humanize") main.replaceChildren(...group(HUMANIZE));
  else main.replaceChildren(...group(STRUM));
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
let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    draw();
  });
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

  const r = process(notes, { ...params, strum: { ...params.strum, forced: input.forced } }, { tempo: input.tempo, seed, clipEnd: input.clipEnd });
  const final = r.snapshots.pedal;
  const pad = 16;
  const t1 = Math.max(input.clipEnd, ...final.map((n) => n.startTime + n.duration), 1);
  const lo = Math.min(...notes.map((n) => n.pitch)) - 1;
  const hi = Math.max(...notes.map((n) => n.pitch)) + 1;
  const rowH = (hgt - pad) / (hi - lo + 1);
  const x = (t: number) => pad + (t / t1) * (w - pad * 2);
  const y = (p: number) => pad / 2 + (hi - p) * rowH;
  const targeted = (i: number) => r.target[r.analysis.groupOf[i]!];

  // bar lines
  c.strokeStyle = color("--line");
  c.lineWidth = 1;
  for (let b = 0; b <= t1; b += 4) {
    c.beginPath();
    c.moveTo(x(b) + 0.5, 0);
    c.lineTo(x(b) + 0.5, hgt);
    c.stroke();
  }

  // originals: outline
  c.strokeStyle = color("--muted");
  for (const n of notes) c.strokeRect(x(n.startTime) + 0.5, y(n.pitch) + 0.5, Math.max(2, x(n.startTime + n.duration) - x(n.startTime)), Math.max(2, rowH - 1));

  // results
  final.forEach((n, i) => {
    if (r.dropped.has(i)) return;
    c.globalAlpha = targeted(i) ? 0.85 : 0.25;
    c.fillStyle = color("--text");
    c.fillRect(x(n.startTime), y(n.pitch), Math.max(2, x(n.startTime + n.duration) - x(n.startTime)), Math.max(2, rowH - 1));
  });

  // displacement per stage, stacked: original → groove → humanize → strum
  const chain: [Stage, string][] = [
    ["groove", "--stage-groove"],
    ["humanize", "--stage-humanize"],
    ["strum", "--stage-strum"],
  ];
  const activeStage = TABS.find(([id]) => id === tab)![2];
  notes.forEach((n, i) => {
    if (!targeted(i)) return;
    let from = n.startTime;
    for (const [stage, v] of chain) {
      const to = r.snapshots[stage][i]!.startTime;
      if (Math.abs(x(to) - x(from)) >= 0.5) {
        c.globalAlpha = stage === activeStage ? 1 : 0.35;
        c.strokeStyle = color(v);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x(from), y(n.pitch) - 1);
        c.lineTo(x(to), y(n.pitch) - 1);
        c.stroke();
      }
      from = to;
    }
  });

  // drift curve on the humanize tab
  if (tab === "humanize" && r.drift.length > 1) {
    const mid = hgt / 2;
    const scale = (hgt / 2 - pad) / Math.max(1, params.humanize.drift * 2.5, ...r.drift.map(Math.abs));
    c.globalAlpha = 0.4;
    c.strokeStyle = color("--line");
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(pad, mid);
    c.lineTo(w - pad, mid);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 0.9;
    c.strokeStyle = color("--stage-humanize");
    c.lineWidth = 1.5;
    c.beginPath();
    r.analysis.groups.forEach((g, gi) => {
      const px = x(g.start);
      const py = mid - r.drift[gi]! * scale;
      gi ? c.lineTo(px, py) : c.moveTo(px, py);
    });
    c.stroke();
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
$("apply").onclick = () => close({ apply: { params, seed }, ...presetsOut() });
document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  if (e.key === "Escape") close(presetsOut());
  if (e.key === "Enter") close({ apply: { params, seed }, ...presetsOut() });
});
new ResizeObserver(schedule).observe(canvas);

renderMode();
renderTabs();
renderParams();
renderPresetName();
renderSeed();
schedule();
