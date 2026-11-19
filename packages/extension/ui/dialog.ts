// SPDX-License-Identifier: MIT

import {
  analyze,
  BUILTIN_PRESETS,
  chordKey,
  noteKey,
  resolveMotion,
  strumDirection,
  DEFAULT_PARAMS,
  defaultGrooveVelocity,
  process,
  voicedBase,
  type Mode,
  type Params,
  type Preset,
  type ChordOverride,
  type Direction,
  type Note,
  type Overrides,
  type Stage,
  nameChord,
  chordLabel,
  degree,
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
/** True right after Init, until something is edited. */
let isInit = false;
/** Stroke directions fixed by Strum Down / Up; Clear empties it. */
let overrides: Required<Overrides> = { chords: {}, notes: {}, ...clone(input.overrides) };
/** Notes the preview processes: the clip's, or their guitar shapes when voicing is on. */
let base: readonly Note[] = input.notes;
let baseKey = "";
/** Dialog-side selection, one flag per note of `base` (starts from the clip's selection). */
let selected = input.notes.map((n) => !!n.selected);
const allPresets = () => [...BUILTIN_PRESETS, ...userPresets];
const triplet = analyze(input.notes).triplet;

function close(out: DialogOutput) {
  const message = { method: "close_and_send", params: [JSON.stringify(out)] };
  if (window.webkit?.messageHandlers?.live) window.webkit.messageHandlers.live.postMessage(message);
  else window.chrome?.webview?.postMessage(message);
}
const presetsOut = () => (presetsChanged ? { presets: userPresets } : {});

// ---------------------------------------------------------------- parameter definitions

type Section = "groove" | "humanize" | "strum" | "connect" | "voicing";
type NumDef = {
  kind: "num";
  /** "pedal" means a top-level field of Params. */
  section: Section | "pedal";
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
  options: [value: string | number | boolean, label: string][];
  tip: [string, string];
  advanced?: boolean;
  mode?: Mode;
};
type Def = NumDef | ChoiceDef;

const HUMANIZE: Def[] = [
  { kind: "num", section: "humanize", key: "drift", label: "drift", min: 0, max: 40, step: 0.5, unit: "ms", tip: ["Slow timing wander that comes and goes", "ゆっくり走って戻るタイミングの揺れ"] },
  { kind: "num", section: "humanize", key: "jitter", label: "jitter", min: 0, max: 20, step: 0.5, unit: "ms", tip: ["Small per-note timing error", "ノートごとの細かいずれ"] },
  { kind: "num", section: "humanize", key: "spread", label: "spread", min: 0, max: 20, step: 0.5, unit: "ms", mode: "piano", tip: ["Offsets each note of a chord on its own; 0 moves the chord as one (piano)", "和音の音を1つずつずらす。0 で和音ごとそろって動く（ピアノ）"] },
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

const VOICING: Def[] = [
  { kind: "choice", section: "voicing", key: "on", label: "voicing", options: [[false, "off"], [true, "on"]], mode: "guitar", tip: ["Rewrites each chord as a shape a guitar can play, one note per string", "和音をギターで押さえられる形（1 弦に 1 音）に置き換える"] },
  { kind: "choice", section: "voicing", key: "tuning", label: "tuning", options: [["standard", "standard"], ["dropd", "drop D"]], mode: "guitar", tip: ["Open strings the shapes are built on", "形を作るときの開放弦"] },
  { kind: "num", section: "voicing", key: "capo", label: "capo", min: 0, max: 7, step: 1, mode: "guitar", tip: ["Capo fret; open strings move up with it", "カポの位置。開放弦がその分上がる"] },
];

const onOff: [boolean, string][] = [
  [false, "off"],
  [true, "on"],
];
/** Whether the tab's stage does anything, for dimming its tab. */
const stageOn = (t: Tab) =>
  t === "connect"
    ? params.connect.chromaticOn || params.connect.passingOn || params.connect.graceOn
    : t === "strum"
      ? params.mode === "guitar" ? params.strum.on : params.pedal !== "off"
      : params[t].on;

const CONNECT: Def[] = [
  { kind: "choice", section: "connect", key: "chromaticOn", label: "run", options: onOff, tip: ["Steps into the next bass note", "次のベースへ 1 音ずつ近づく音を足す"] },
  { kind: "num", section: "connect", key: "chromatic", label: "chance", min: 0, max: 100, step: 1, unit: "%", tip: ["Chance per chord change", "和音が変わるごとに入れる確率"] },
  { kind: "num", section: "connect", key: "steps", label: "steps", min: 1, max: 6, step: 1, tip: ["Run notes, 16ths each; fewer when there is no room", "半音で近づく音の数（1 音 16 分）。間が足りなければ減らす"] },
  { kind: "choice", section: "connect", key: "runDirection", label: "from", options: [["auto", "auto"], ["up", "below"], ["down", "above"]], tip: ["Side the run comes from; auto follows the previous bass note", "どちらから近づくか。auto は前のベースの側から"] },
  { kind: "choice", section: "connect", key: "runScale", label: "notes", options: [["in", "in scale"], ["out", "chromatic"]], tip: ["Step through the scale, or by semitones outside it (semitones when Scale Mode is off)", "スケール音で近づくか、スケール外の半音も使うか（Scale Mode がオフなら半音）"] },
  { kind: "num", section: "connect", key: "chromaticVelocity", label: "velocity", min: 0, max: 100, step: 1, unit: "%", tip: ["Velocity as a % of the bass note the run leaves", "前のベースに対するベロシティの %"] },
  { kind: "choice", section: "connect", key: "passingOn", label: "passing tone", options: onOff, tip: ["A scale tone between two bass notes (needs Scale Mode)", "2 つのベースのあいだにスケール音を足す（Scale Mode が必要）"] },
  { kind: "num", section: "connect", key: "passing", label: "chance", min: 0, max: 100, step: 1, unit: "%", tip: ["Chance per chord change, when no run was added", "和音が変わるごとに入れる確率（Chromatic Run が入らなかったとき）"] },
  { kind: "num", section: "connect", key: "passingVelocity", label: "velocity", min: 0, max: 100, step: 1, unit: "%", tip: ["Velocity as a % of the bass note it leaves", "前のベースに対するベロシティの %"] },
  { kind: "choice", section: "connect", key: "graceOn", label: "grace notes", options: onOff, tip: ["Short notes climbing into the top note", "最高音の直前に短い音を足す"] },
  { kind: "num", section: "connect", key: "grace", label: "chance", min: 0, max: 100, step: 1, unit: "%", tip: ["Chance per chord change", "和音が変わるごとに入れる確率"] },
  { kind: "num", section: "connect", key: "graceSteps", label: "steps", min: 1, max: 6, step: 1, tip: ["Grace notes climbing into the top note; fewer when there is no room", "最高音へ上がっていく前打音の数。間が足りなければ減らす"] },
  { kind: "choice", section: "connect", key: "graceLength", label: "length", options: [[1 / 64, "1/64"], [1 / 32, "1/32"], [1 / 16, "1/16"]], tip: ["Length of each grace note in beats", "前打音 1 音の長さ（拍）"] },
  { kind: "choice", section: "connect", key: "graceScale", label: "notes", options: [["in", "in scale"], ["out", "chromatic"]], tip: ["Step through the scale, or by semitones outside it", "スケール音で上げるか、スケール外の半音も使うか"] },
  { kind: "num", section: "connect", key: "graceVelocity", label: "velocity", min: 0, max: 100, step: 1, unit: "%", tip: ["Velocity as a % of the top note they lead into", "次の最高音に対するベロシティの %"] },
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
  isInit = false;
  renderPresetName();
  renderTabs();
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

function segmented<V extends string | number | boolean>(options: [V, string][], get: () => unknown, onPick: (v: V) => void, disabled = false) {
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

function group(all: Def[]) {
  // controls for the other mode are hidden, not greyed: switching mode re-renders
  const defs = all.filter(enabled);
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
  const side = h("div", {}, ...group(GROOVE), extractedRow());
  return h("div", { className: "groove" }, legend, steps, side);
}

/** Load the groove taken from another clip with "humino: Extract Groove". */
function extractedRow() {
  const x = input.groove;
  if (!x)
    return h("p", { className: "hint" }, ja
      ? "別のクリップを右クリック →「humino: Extract Groove」で、そのクリップのノリをここに読み込めます"
      : "Right-click another clip → \"humino: Extract Groove\" to load its feel here");
  const load = h("button", {
    onclick: () => {
      params.groove = { ...params.groove, timing: [...x.timing], velocity: [...x.velocity] };
      renderParams();
      edited();
    },
  }, ja ? `「${x.clip}」の Groove を読み込む` : `Load groove from "${x.clip}"`);
  load.title = ja
    ? "抜き出したタイミングとベロシティでステップ表を置き換える。Swing はそのまま"
    : "Replaces the step table with the extracted timing and velocity. Swing stays as it is";
  const note = x.triplet !== triplet ? h("p", { className: "hint" }, ja ? "抜き出したクリップと 3 連かどうかが違います" : "That clip and this one differ in triplet feel") : null;
  return h("div", { className: "extracted" }, load, ...(note ? [note] : []));
}

// ---------------------------------------------------------------- layout

const TABS: [Tab, string, Stage | null][] = [
  ["groove", "groove", "groove"],
  ["humanize", "humanize", "humanize"],
  ["strum", "strum", "strum"],
  ["connect", "connect", "connect"],
];
const STAGE_COLOR: Record<Tab, string> = {
  groove: "--stage-groove",
  humanize: "--stage-humanize",
  strum: "--stage-strum",
  connect: "--stage-connect",
};

/** Stages with their own on / off; Strum only in guitar mode (piano has the pedal's off). */
const switchable = (t: Tab): t is "groove" | "humanize" | "strum" => t === "groove" || t === "humanize" || (t === "strum" && params.mode === "guitar");

function renderTabs() {
  const nav = $("tabs");
  nav.replaceChildren(
    ...TABS.map(([id, label]) => {
      const name = id === "strum" && params.mode === "piano" ? "pedal" : label;
      const btn = h("button", { className: "name", onclick: () => ((tab = id), renderTabs(), renderParams(), schedule()) }, name);
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(id === tab));
      const wrap = h("div", { className: `tab${stageOn(id) ? "" : " off"}` });
      wrap.style.setProperty("--tab-color", `var(${STAGE_COLOR[id]})`);
      if (switchable(id)) {
        const st = params[id];
        const power = h("button", { className: "power", onclick: () => ((st.on = !st.on), renderParams(), renderSelbar(), edited()) });
        power.setAttribute("aria-pressed", String(st.on));
        power.setAttribute("aria-label", `${name} on / off`);
        power.title = ja ? `${name} をオン / オフ` : `Turn ${name} on or off`;
        wrap.append(power);
      }
      wrap.append(btn);
      return wrap;
    }),
  );
}

function renderParams() {
  renderChordWindow();
  renderTabs();
  const main = $("params");
  main.style.setProperty("--section", `var(${STAGE_COLOR[tab]})`);
  // a switched-off stage keeps its controls editable, just quieter
  main.classList.toggle("off", switchable(tab) && !params[tab].on);
  if (tab === "groove") main.replaceChildren(grooveTable());
  else if (tab === "humanize") main.replaceChildren(...group(HUMANIZE));
  else if (tab === "connect") main.replaceChildren(...connectLanes());
  else if (params.mode === "piano") main.replaceChildren(...group(STRUM), fixedRow()); // only the pedal is left
  else {
    const [row, ...adv] = group(STRUM);
    main.replaceChildren(row!, h("div", { className: "lane" }, ...VOICING.map(control)), fixedRow(), ...adv);
  }
}

/** Connect in three lanes, one per kind: chromatic run, passing tone, grace notes. */
function connectLanes() {
  const pick = (...keys: string[]) => keys.map((k) => control(CONNECT.find((c) => c.key === k)!));
  // the first control of each lane is its on / off, labelled with the kind
  const lane = (...items: HTMLElement[]) => h("div", { className: "lane grid" }, ...items);
  const gap = () => h("div", {});
  const s = input.scale;
  const scale = h(
    "div",
    { className: "param", title: ja ? "Live の Scale Mode のスケール。経過音と in scale の前打音が使う" : "Live's Scale Mode scale, used by passing tones and in-scale grace notes" },
    h("span", { className: "label" }, ja ? "スケール" : "scale"),
    h("span", { className: "scale-name" }, s ? `${NAMES[s.root % 12]} ${s.name ?? ""}`.trim() : ja ? "Scale Mode オフ" : "Scale Mode off"),
  );
  return [
    lane(...pick("chromaticOn", "chromatic", "steps", "runDirection", "runScale", "chromaticVelocity")),
    lane(...pick("passingOn", "passing"), gap(), scale, gap(), ...pick("passingVelocity")),
    lane(...pick("graceOn", "grace", "graceSteps", "graceLength", "graceScale", "graceVelocity")),
  ];
}

/** Count of hand edits (chord and note overrides) with a way to drop them all. */
function fixedRow() {
  const n = Object.keys(overrides.chords).length + Object.keys(overrides.notes).length;
  const text = ja ? `手で直した箇所：${n}` : `hand edits: ${n}`;
  const clear = h("button", { disabled: n === 0, onclick: () => ((overrides = { chords: {}, notes: {} }), renderSelbar(), renderParams(), edited()) }, "Clear");
  clear.title = ja ? "向き、ロック、手での調整をすべて解除する" : "Drop every direction, lock and nudge";
  return h("div", { className: "fixed" }, h("span", { className: "label" }, text), clear);
}

function renderMode() {
  // Keep the whole group: segmented() repaints its own buttons on click.
  $("mode").replaceChildren(
    segmented(
      [
        ["guitar", "Guitar"],
        ["piano", "Piano"],
      ],
      () => params.mode,
      (v) => {
        params.mode = v as Mode;
        renderParams();
        renderSelbar();
        edited();
      },
    ),
  );
}

function renderPresetName() {
  $("preset-name").textContent = presetIndex >= 0 ? allPresets()[presetIndex]!.name : isInit ? "Init" : "custom";
}

function loadPreset(i: number) {
  const list = allPresets();
  presetIndex = (i + list.length) % list.length;
  isInit = false;
  const p = list[presetIndex]!;
  const mode = params.mode;
  params = clone(p.params);
  params.mode = p.mode === "any" ? mode : p.mode;
  renderMode();
  renderParams();
  renderPresetName();
  schedule();
}

/** Header: notes starting this close together are one chord (drag up / down, double-click resets). */
function renderChordWindow() {
  $("chordwin").textContent = `${Math.round(params.chordWindow)} ms`;
}
{
  const el = $("chordwin");
  el.parentElement!.title = ja
    ? "この間隔の中で始まる音を 1 つの和音とみなす。グリッドから少しずれた和音もまとめて扱える。上下ドラッグで変更、ダブルクリックで初期値"
    : "Notes starting this close together count as one chord, so chords played a little off the grid are still chords. Drag up or down; double-click resets";
  const set = (v: number) => {
    params.chordWindow = Math.min(50, Math.max(0, Math.round(v)));
    renderChordWindow();
    edited();
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const v0 = params.chordWindow;
    const move = (m: PointerEvent) => set(v0 + ((y0 - m.clientY) * 50) / (m.shiftKey ? 1000 : 200));
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", () => el.removeEventListener("pointermove", move), { once: true });
  });
  el.addEventListener("dblclick", () => set(DEFAULT_PARAMS.chordWindow));
}

function renderSeed() {
  $("seed").textContent = String(seed).padStart(3, "0");
}

// ---------------------------------------------------------------- preview

const canvas = $<HTMLCanvasElement>("preview");
const tip = $("tip");
const LABEL_W = 34; // note names
const PAD = 12;
const BAR_STRIP = 16; // bar numbers
const CHORD_STRIP = 14; // chord names (and degrees with Scale Mode on)
const ARROW_STRIP = 18; // stroke arrows
const VEL_H = 56; // velocity lane
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (p: number) => `${NAMES[p % 12]}${Math.floor(p / 12) - 2}`; // Live: C3 = 60

/** Visible time window in beats; null = whole clip. */
let view: { t0: number; t1: number } | null = null;
let fullEnd = 1;
let last: ReturnType<typeof process> | null = null;
let geo = { w: 0, h: 0, top: 0, notesBottom: 0, rowH: 0, noteH: 0, rows: new Map<number, number>() };
let chordHits: { x: number; key: string }[] = [];

const span = () => view ?? { t0: 0, t1: fullEnd };
const plotW = () => geo.w - LABEL_W - PAD;
const xOf = (t: number) => {
  const { t0, t1 } = span();
  return LABEL_W + ((t - t0) / (t1 - t0)) * plotW();
};
const tOf = (px: number) => {
  const { t0, t1 } = span();
  return t0 + ((px - LABEL_W) / plotW()) * (t1 - t0);
};
const yOf = (p: number) => geo.top + geo.rows.get(p)! * geo.rowH;

const notesWithSelection = () => base.map((n, i) => ({ ...n, selected: selected[i]! }));
const chordOf = (i: number) => last!.analysis.groups[last!.analysis.groupOf[i]!]!;

/** Re-voices when the settings voicing depends on change; the selection goes back to the clip's. */
function rebase() {
  const key = JSON.stringify([params.mode, params.voicing, params.chordWindow]);
  if (key === baseKey) return false;
  const first = !baseKey;
  baseKey = key;
  base = voicedBase(input.notes, params, input.tempo);
  selected = base.map((n) => !!n.selected);
  return !first;
}

function compute() {
  const rebased = rebase();
  last = process(notesWithSelection(), params, { tempo: input.tempo, seed, clipEnd: input.clipEnd, ...(input.scale && { scale: input.scale }) }, overrides);
  if (rebased) renderSelbar(); // after `last` matches the new notes
  return last;
}

/** Note under the pointer (processed position first, then the original). */
function noteAt(px: number, py: number): number | undefined {
  if (!last) return undefined;
  const hit = (n: Note) =>
    py >= yOf(n.pitch) && py <= yOf(n.pitch) + geo.noteH && px >= xOf(n.startTime) - 2 && px <= Math.max(xOf(n.startTime + n.duration), xOf(n.startTime) + 4);
  for (let i = base.length - 1; i >= 0; i--) if (!last.dropped.has(i) && hit(last.final[i]!)) return i;
  for (let i = base.length - 1; i >= 0; i--) if (hit(base[i]!)) return i;
  return undefined;
}

const local = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top] as const;
};

function selectChordOf(i: number, add: boolean) {
  const g = chordOf(i);
  if (!add) selected = selected.map(() => false);
  const on = !(add && g.idx.every((k) => selected[k]));
  for (const k of g.idx) selected[k] = on;
}

function setNoteOverride(i: number, patch: Partial<NonNullable<Overrides["notes"]>[string]>) {
  const key = noteKey(base[i]!);
  const next = { ...overrides.notes[key], ...patch };
  for (const k of Object.keys(next) as (keyof typeof next)[]) if (!next[k]) delete next[k];
  overrides = { ...overrides, notes: { ...overrides.notes } };
  if (Object.keys(next).length) overrides.notes[key] = next;
  else delete overrides.notes[key];
}

type LooseChord = { direction?: Direction | undefined; speed?: number | undefined; upSkip?: number | undefined };
/** Drop unset fields so an override that says nothing disappears. */
const cleanChord = (c: LooseChord): ChordOverride =>
  Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as ChordOverride;

type Drag =
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; add: boolean; base: boolean[] }
  | { kind: "nudge"; x0: number; notes: number[]; dt0: number[] }
  | { kind: "velocity"; y0: number; notes: number[]; dv0: number[] }
  | { kind: "click"; x0: number; y0: number; note: number | undefined; add: boolean };
let drag: Drag | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (!last || e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const [px, py] = local(e);
  const selectedIdx = () => selected.flatMap((s, i) => (s ? [i] : []));

  if (py < geo.top) {
    // arrow strip: click cycles auto → down → up → auto
    const hit = chordHits.reduce<{ x: number; key: string } | undefined>(
      (best, c) => (Math.abs(c.x - px) <= 8 && (!best || Math.abs(c.x - px) < Math.abs(best.x - px)) ? c : best),
      undefined,
    );
    if (!hit) return;
    const next = { undefined: "down", down: "up", up: undefined } as const;
    const cur = overrides.chords[hit.key];
    const to = next[String(cur?.direction) as keyof typeof next];
    const chords = { ...overrides.chords };
    const merged = cleanChord({ ...cur, direction: to });
    if (Object.keys(merged).length) chords[hit.key] = merged;
    else delete chords[hit.key];
    overrides = { ...overrides, chords };
    renderParams();
    edited();
    return;
  }

  if (py > geo.notesBottom) {
    // velocity lane: drag up / down shifts the selected notes, or the chord under the pointer
    const t = tOf(px);
    let notes = selectedIdx();
    if (!notes.length) {
      const g = last.analysis.groups.reduce((b, g) => (Math.abs(g.start - t) < Math.abs(b.start - t) ? g : b));
      notes = g.idx;
    }
    drag = { kind: "velocity", y0: py, notes, dv0: notes.map((i) => overrides.notes[noteKey(base[i]!)]?.dv ?? 0) };
    return;
  }

  const i = noteAt(px, py);
  if (i !== undefined && e.altKey) {
    if (!selected[i]) selectChordOf(i, false);
    const notes = selected[i] ? selectedIdx() : [i];
    drag = { kind: "nudge", x0: px, notes, dt0: notes.map((k) => overrides.notes[noteKey(base[k]!)]?.dt ?? 0) };
    return;
  }
  drag = { kind: "click", x0: px, y0: py, note: i, add: e.shiftKey };
});

canvas.addEventListener("pointermove", (e) => {
  const [px, py] = local(e);
  if (!drag) return hover(px, py, e);
  tip.hidden = true;
  if (drag.kind === "click" && drag.note === undefined && Math.hypot(px - drag.x0, py - drag.y0) > 4) {
    drag = { kind: "marquee", x0: drag.x0, y0: drag.y0, x1: px, y1: py, add: drag.add, base: drag.add ? [...selected] : selected.map(() => false) };
  }
  if (drag.kind === "marquee") {
    drag.x1 = px;
    drag.y1 = py;
    const [ta, tb] = [tOf(Math.min(drag.x0, px)), tOf(Math.max(drag.x0, px))];
    const [ya, yb] = [Math.min(drag.y0, py), Math.max(drag.y0, py)];
    const before = drag.base;
    selected = base.map((n, k) => {
      const inside = n.startTime + n.duration >= ta && n.startTime <= tb && yOf(n.pitch) + geo.noteH >= ya && yOf(n.pitch) <= yb;
      return before[k]! || inside;
    });
    renderSelbar();
    schedule();
  } else if (drag.kind === "nudge") {
    const { t0, t1 } = span();
    const ms = ((px - drag.x0) / plotW()) * (t1 - t0) * (60000 / input.tempo);
    const step = e.shiftKey ? 0.5 : 1;
    drag.notes.forEach((k, j) => setNoteOverride(k, { dt: Math.round((drag as { dt0: number[] }).dt0[j]! + ms / step) * step }));
    renderSelbar();
    edited();
  } else if (drag.kind === "velocity") {
    const dv = Math.round(((drag.y0 - py) / VEL_H) * 127);
    drag.notes.forEach((k, j) => setNoteOverride(k, { dv: Math.max(-126, Math.min(126, (drag as { dv0: number[] }).dv0[j]! + dv)) }));
    renderSelbar();
    edited();
  }
});

canvas.addEventListener("pointerup", () => {
  if (drag?.kind === "click") {
    if (drag.note !== undefined) selectChordOf(drag.note, drag.add);
    else if (!drag.add) selected = selected.map(() => false);
    renderSelbar();
    schedule();
  }
  drag = null;
});

canvas.addEventListener("pointerleave", () => (tip.hidden = true));

// Pinch or ⌘/Ctrl + scroll zooms around the pointer; plain scroll pans; double-click on empty space shows the whole clip.
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const { t0, t1 } = span();
    const len = t1 - t0;
    const perPx = len / plotW();
    if (e.ctrlKey || e.metaKey) {
      const at = tOf(local(e)[0]);
      const nextLen = Math.min(fullEnd, Math.max(0.5, len * Math.exp(e.deltaY * 0.01)));
      setView(at - ((at - t0) / len) * nextLen, nextLen);
    } else {
      setView(t0 + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * perPx, len);
    }
  },
  { passive: false },
);
canvas.addEventListener("dblclick", (e) => {
  const [px, py] = local(e);
  if (py < geo.top || py > geo.notesBottom || noteAt(px, py) !== undefined) return; // arrows, notes and the lane keep their own clicks
  view = null;
  schedule();
});

function setView(t0: number, len: number) {
  const start = Math.min(Math.max(0, t0), Math.max(0, fullEnd - len));
  view = len >= fullEnd ? null : { t0: start, t1: start + len };
  schedule();
}

function hover(px: number, py: number, e: MouseEvent) {
  const i = py >= geo.top && py <= geo.notesBottom ? noteAt(px, py) : undefined;
  if (i === undefined || !last) {
    tip.hidden = true;
    return;
  }
  const orig = base[i]!;
  const ms = (b: number) => (b * 60000) / input.tempo;
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
  const steps: [string, Note, Note][] = [
    ["groove", orig, last.snapshots.groove[i]!],
    ["humanize", last.snapshots.groove[i]!, last.snapshots.humanize[i]!],
    ["strum", last.snapshots.humanize[i]!, last.snapshots.strum[i]!],
  ];
  const o = overrides.notes[noteKey(orig)];
  const fin = last.final[i]!;
  const lines = [
    `${noteName(orig.pitch)} · ${last.dropped.has(i) ? (ja ? "アップで省略" : "skipped on upstroke") : `vel ${orig.velocity ?? 100} → ${fin.velocity}`}`,
    ...steps.filter(([, a, b]) => Math.abs(b.startTime - a.startTime) > 1e-6).map(([n, a, b]) => `${n} ${fmt(ms(b.startTime - a.startTime))} ms`),
    ...(o?.lock ? [ja ? "ロック中" : "locked"] : []),
    ...(o?.dt ? [`nudge ${fmt(o.dt)} ms`] : []),
    ...(o?.dv ? [`vel ${o.dv > 0 ? "+" : ""}${o.dv}`] : []),
  ];
  tip.replaceChildren(...lines.map((l) => h("div", {}, l)));
  tip.hidden = false;
  const r = canvas.getBoundingClientRect();
  tip.style.left = `${Math.min(e.clientX + 12, r.right - 170)}px`;
  tip.style.top = `${e.clientY + 14}px`;
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
  const font = color("--font");
  c.clearRect(0, 0, w, hgt);

  if (!input.notes.length) {
    c.fillStyle = color("--text-dim");
    c.font = `13px ${font}`;
    c.fillText(ja ? "ノートがありません" : "no notes", 16, 24);
    return;
  }

  const r = compute();
  const notes = base; // after compute(): it may re-voice
  fullEnd = Math.max(input.clipEnd, ...r.final.map((n) => n.startTime + n.duration), 1);
  const { t0, t1 } = span();
  const top = BAR_STRIP + CHORD_STRIP + ARROW_STRIP;
  const notesBottom = hgt - VEL_H - 8;
  // Fold: one row per pitch that is used, like Live's Fold.
  const pitches = [...new Set([...notes, ...r.added].map((n) => n.pitch))].sort((a, b) => b - a);
  const rowH = Math.min(22, (notesBottom - top) / pitches.length);
  geo = { w, h: hgt, top, notesBottom, rowH, noteH: Math.max(2, rowH - 2), rows: new Map(pitches.map((p, k) => [p, k])) };
  const x = xOf;
  const y = yOf;
  const noteH = geo.noteH;
  const pxPerBeat = plotW() / (t1 - t0);
  const targeted = (i: number) => r.target[r.analysis.groupOf[i]!];
  const anySelected = selected.some(Boolean);

  // keyboard: one key per folded row, white / black like Live's piano roll; names where they fit (always on C)
  c.globalAlpha = 1;
  c.font = `${Math.min(10, Math.max(8, rowH - 3))}px ${font}`;
  c.textBaseline = "middle";
  for (const p of pitches) {
    const black = [1, 3, 6, 8, 10].includes(p % 12);
    const ky = y(p);
    c.fillStyle = black ? color("--bg") : color("--text");
    c.globalAlpha = black ? 1 : 0.8;
    roundRect(c, 2, ky, LABEL_W - 6, Math.max(1, rowH - 1));
    c.fill();
    if (black) {
      c.globalAlpha = 1;
      c.strokeStyle = color("--muted");
      c.lineWidth = 1;
      c.stroke();
    }
    if (rowH >= 9 || (p % 12 === 0 && rowH >= 6)) {
      c.globalAlpha = 1;
      c.fillStyle = black ? color("--text-dim") : color("--bg");
      c.fillText(noteName(p), 5, ky + rowH / 2);
    }
  }
  c.globalAlpha = 1;
  c.font = `10px ${font}`;
  c.fillStyle = color("--text-dim");
  c.fillText("vel", 4, notesBottom + 8 + VEL_H / 2);
  c.textBaseline = "alphabetic";

  c.save();
  c.beginPath();
  c.rect(LABEL_W - 2, 0, w - LABEL_W - PAD + 4, hgt);
  c.clip();

  // grid: bars always (numbered), beats once there is room
  c.lineWidth = 1;
  const beatStep = pxPerBeat >= 24 ? 1 : 4;
  for (let b = Math.floor(t0 / beatStep) * beatStep; b <= t1; b += beatStep) {
    const gx = Math.round(x(b)) + 0.5;
    c.strokeStyle = color("--line");
    c.globalAlpha = b % 4 === 0 ? 1 : 0.5;
    c.beginPath();
    c.moveTo(gx, BAR_STRIP - 2);
    c.lineTo(gx, hgt);
    c.stroke();
    if (b % 4 === 0) {
      c.globalAlpha = 1;
      c.fillStyle = color("--text-dim");
      c.font = `10px ${font}`;
      c.fillText(String(b / 4 + 1), gx + 3, 11);
    }
  }
  // velocity lane separator
  c.globalAlpha = 1;
  c.strokeStyle = color("--line");
  c.beginPath();
  c.moveTo(LABEL_W, notesBottom + 4.5);
  c.lineTo(w - PAD, notesBottom + 4.5);
  c.stroke();

  // chord names over each chord, the degree after it when Live's scale is known; skipped where they would collide
  {
    let freeX = -Infinity;
    const ny = BAR_STRIP + 10;
    for (const g of r.analysis.groups) {
      if (g.idx.length < 2) continue;
      const ch = nameChord(g.idx.map((i) => notes[i]!.pitch));
      if (!ch) continue;
      const gx = x(g.start) + 2;
      if (gx < freeX || gx < LABEL_W - 2 || gx > w - PAD) continue;
      const name = chordLabel(ch);
      const deg = input.scale ? degree(ch, input.scale) : "";
      c.globalAlpha = 1;
      c.font = `11px ${font}`;
      c.fillStyle = color("--text");
      c.fillText(name, gx, ny);
      let end = gx + c.measureText(name).width;
      if (deg) {
        c.font = `10px ${font}`;
        c.fillStyle = color("--text-dim");
        c.fillText(deg, end + 4, ny);
        end += 4 + c.measureText(deg).width;
      }
      freeX = end + 8;
    }
  }

  // originals: faint outline
  c.globalAlpha = 0.6;
  c.strokeStyle = color("--muted");
  for (const n of notes) {
    roundRect(c, x(n.startTime) + 0.5, y(n.pitch) + 0.5, Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), noteH);
    c.stroke();
  }

  // results: notes the open tab's stage changed (start, length or velocity) take its colour
  const before: Record<Stage, readonly Note[]> = { groove: notes, humanize: r.snapshots.groove, strum: r.snapshots.humanize, pedal: r.snapshots.strum, connect: r.snapshots.pedal };
  const changedBy = (stage: Stage, i: number) => {
    const a = before[stage][i]!;
    const b = r.snapshots[stage][i]!;
    return Math.abs(a.startTime - b.startTime) > 1e-6 || Math.abs(a.duration - b.duration) > 1e-6 || a.velocity !== b.velocity;
  };
  const tabStages: Record<Tab, Stage[]> = { groove: ["groove"], humanize: ["humanize"], strum: ["strum", "pedal"], connect: ["connect"] };
  const fillOf = (i: number) => {
    const o = overrides.notes[noteKey(notes[i]!)];
    if (o?.lock) return { fill: color("--text-dim"), alpha: 0.7 };
    const hit = targeted(i) && tabStages[tab].some((st) => changedBy(st, i));
    return { fill: hit ? color(STAGE_COLOR[tab]) : color("--text"), alpha: !targeted(i) ? 0.25 : hit ? 0.95 : 0.55 };
  };
  /** Live-style: louder notes are drawn more opaque. */
  const velAlpha = (n: Note) => 0.35 + 0.65 * ((n.velocity ?? 100) / 127);
  r.final.forEach((n, i) => {
    if (r.dropped.has(i)) return;
    const { fill, alpha: base } = fillOf(i);
    const alpha = base * velAlpha(n);
    const nx = x(n.startTime) + 0.5;
    const nw = Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1);
    c.globalAlpha = alpha;
    c.fillStyle = fill;
    roundRect(c, nx, y(n.pitch) + 0.5, nw, noteH);
    c.fill();
    const o = overrides.notes[noteKey(notes[i]!)];
    if (selected[i] || o?.dt || o?.dv) {
      c.globalAlpha = 1;
      c.lineWidth = selected[i] ? 1.5 : 1;
      c.strokeStyle = selected[i] ? color("--text") : color(STAGE_COLOR[tab]);
      c.setLineDash(selected[i] ? [] : [2, 2]);
      roundRect(c, nx - 1, y(n.pitch) - 0.5, nw + 2, noteH + 2);
      c.stroke();
      c.setLineDash([]);
    }
  });

  // notes Connect added, in its colour on every tab
  for (const n of r.added) {
    c.globalAlpha = 0.95 * velAlpha(n);
    c.fillStyle = color("--stage-connect");
    roundRect(c, x(n.startTime) + 0.5, y(n.pitch) + 0.5, Math.max(2, x(n.startTime + n.duration) - x(n.startTime) - 1), noteH);
    c.fill();
  }

  // how far the open tab's stage moved each note: a line from the previous start
  const activeStage = TABS.find(([id]) => id === tab)![2];
  if (activeStage) {
    c.globalAlpha = 0.9;
    c.strokeStyle = color(STAGE_COLOR[tab]);
    c.lineWidth = 2;
    notes.forEach((n, i) => {
      if (!targeted(i) || r.dropped.has(i) || overrides.notes[noteKey(n)]?.lock) return;
      const from = x(before[activeStage][i]!.startTime);
      const to = x(r.snapshots[activeStage][i]!.startTime);
      if (Math.abs(to - from) < 1.5) return;
      const py = y(n.pitch) + noteH / 2 + 0.5;
      c.beginPath();
      c.moveTo(from, py);
      c.lineTo(to, py);
      c.stroke();
    });
  }

  // velocity lane: final velocity bars, original as a tick
  const laneTop = notesBottom + 8;
  r.final.forEach((n, i) => {
    if (r.dropped.has(i)) return;
    const bx = Math.round(x(n.startTime)) + 0.5;
    const vh = ((n.velocity ?? 100) / 127) * (VEL_H - 4);
    const alpha = (targeted(i) ? 1 : 0.4) * velAlpha(n);
    c.globalAlpha = anySelected && !selected[i] ? alpha * 0.5 : alpha;
    c.strokeStyle = color("--velocity");
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(bx, laneTop + VEL_H - 2);
    c.lineTo(bx, laneTop + VEL_H - 2 - vh);
    c.stroke();
    c.globalAlpha = 0.6;
    c.fillStyle = color("--text-dim");
    c.fillRect(bx - 2, laneTop + VEL_H - 2 - ((notes[i]!.velocity ?? 100) / 127) * (VEL_H - 4), 4, 1);
  });

  // stroke arrows on the strum tab
  chordHits = [];
  if (tab === "strum" && params.mode === "guitar" && params.strum.on) {
    const p = { ...params.strum, chords: overrides.chords };
    const motion = resolveMotion(r.analysis, p);
    let lastX = -Infinity;
    for (const g of r.analysis.groups) {
      if (g.idx.length < 2) continue;
      const px = Math.round(x(g.start)) + 4.5;
      if (px - lastX < 14 || px < LABEL_W - 4 || px > w - PAD + 4) continue; // too crowded or off screen: zoom in
      lastX = px;
      const key = chordKey(g.start);
      const fixed = !!overrides.chords[key]?.direction;
      const down = strumDirection(g, motion, p) === "down";
      c.globalAlpha = 1;
      c.strokeStyle = fixed ? color("--stage-strum") : color("--text-dim");
      c.lineWidth = fixed ? 1.75 : 1.25;
      const a0 = BAR_STRIP + CHORD_STRIP + 2;
      const [tipY, tailY] = down ? [a0 + 13, a0 + 2] : [a0 + 2, a0 + 13];
      const dir = down ? -1 : 1;
      c.beginPath();
      c.moveTo(px, tailY);
      c.lineTo(px, tipY);
      c.moveTo(px - 3.5, tipY + 3.5 * dir);
      c.lineTo(px, tipY);
      c.lineTo(px + 3.5, tipY + 3.5 * dir);
      c.stroke();
      chordHits.push({ x: px, key });
    }
  }

  // drift curve on the humanize tab, on a fixed ±50 ms axis so it grows with the amount
  if (tab === "humanize" && r.drift.length > 1) {
    const RANGE_MS = 50;
    const mid = top + (notesBottom - top) / 2;
    const scale = ((notesBottom - top) / 2 - 6) / RANGE_MS;
    c.globalAlpha = 0.5;
    c.strokeStyle = color("--line");
    c.fillStyle = color("--text-dim");
    c.font = `10px ${font}`;
    for (const ms of [-RANGE_MS, 0, RANGE_MS]) {
      const py = mid - ms * scale;
      c.setLineDash(ms === 0 ? [3, 3] : [1, 4]);
      c.beginPath();
      c.moveTo(LABEL_W, py);
      c.lineTo(w - PAD, py);
      c.stroke();
      if (ms) c.fillText(`${ms > 0 ? "+" : ""}${ms} ms`, LABEL_W + 2, py - 3);
    }
    c.setLineDash([]);
    c.globalAlpha = 0.9;
    c.strokeStyle = color("--stage-humanize");
    c.lineWidth = 1.5;
    c.beginPath();
    r.analysis.groups.forEach((g, gi) => {
      const py = mid - Math.max(-RANGE_MS, Math.min(RANGE_MS, r.drift[gi]!)) * scale;
      gi ? c.lineTo(x(g.start), py) : c.moveTo(x(g.start), py);
    });
    c.stroke();
  }

  // marquee
  if (drag?.kind === "marquee") {
    c.globalAlpha = 0.12;
    c.fillStyle = color("--text");
    c.fillRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
    c.globalAlpha = 0.6;
    c.strokeStyle = color("--text");
    c.lineWidth = 1;
    c.strokeRect(Math.min(drag.x0, drag.x1) + 0.5, Math.min(drag.y0, drag.y1) + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
  }
  c.restore();

  if (view) {
    c.globalAlpha = 1;
    c.fillStyle = color("--text-dim");
    c.font = `10px ${font}`;
    c.textAlign = "right";
    c.fillText(`${(t1 - t0).toFixed(1)} beats · ${ja ? "空いた所をダブルクリックで全体" : "double-click empty space: whole clip"}`, w - PAD, 11);
    c.textAlign = "start";
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------- selection bar

/** Edits for the selected chords: lock, stroke speed, up skip, reset. */
function renderSelbar() {
  const bar = $("selbar");
  const idx = selected.flatMap((s, i) => (s ? [i] : []));
  const count = $("count");
  count.textContent = idx.length
    ? ja ? `${idx.length} ノートを選択中` : `${idx.length} notes selected`
    : ja ? `${base.length} ノート（クリップ全体）` : `${base.length} notes (whole clip)`;
  if (!idx.length || !last) {
    bar.replaceChildren(
      h("span", { className: "hint" }, ja
        ? "ドラッグで選択 · クリックで和音を選択 · ⌥ドラッグでずらす · 下の vel をドラッグで強さ · ⌘スクロール/ピンチで拡大"
        : "drag to select · click a chord · ⌥-drag to nudge · drag in vel for velocity · ⌘-scroll / pinch to zoom"),
    );
    return;
  }
  const groups = [...new Set(idx.map((i) => last!.analysis.groupOf[i]!))].map((gi) => last!.analysis.groups[gi]!);
  const keys = groups.filter((g) => g.idx.length >= 2).map((g) => chordKey(g.start));
  const locked = idx.every((i) => overrides.notes[noteKey(base[i]!)]?.lock);
  const guitar = params.mode === "guitar";
  // per-chord strum edits do nothing with Strum off or without a chord
  const strummable = guitar && params.strum.on && keys.length > 0;

  const setChords = (patch: (cur: LooseChord) => LooseChord) => {
    const chords = { ...overrides.chords };
    for (const k of keys) {
      const next = cleanChord(patch({ ...chords[k] }));
      if (Object.keys(next).length) chords[k] = next;
      else delete chords[k];
    }
    overrides = { ...overrides, chords };
    renderSelbar();
    renderParams();
    edited();
  };

  /** Draggable number bound to a chord override; double-click goes back to the global value. */
  const chordNumber = (label: string, field: "speed" | "upSkip", fallback: number, max: number, unit: string) => {
    const first = keys.map((k) => overrides.chords[k]?.[field]).find((v) => v !== undefined);
    const value = h("span", { className: `num${first === undefined ? " inherited" : ""}` }, `${first ?? fallback}${unit}`);
    value.title = ja ? "上下ドラッグで変更、ダブルクリックで全体の設定に戻す" : "drag up / down; double-click: back to the global value";
    value.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      value.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const v0 = first ?? fallback;
      const move = (m: PointerEvent) => {
        const v = Math.max(0, Math.min(max, Math.round(v0 + ((y0 - m.clientY) * max) / 150)));
        value.textContent = `${v}${unit}`;
        value.classList.remove("inherited");
        const chords = { ...overrides.chords };
        for (const k of keys) chords[k] = { ...chords[k], [field]: v };
        overrides = { ...overrides, chords };
        edited();
      };
      value.addEventListener("pointermove", move);
      value.addEventListener("pointerup", () => (value.removeEventListener("pointermove", move), renderSelbar(), renderParams()), { once: true });
    });
    value.addEventListener("dblclick", () => setChords((c) => ({ ...c, [field]: undefined })));
    return h("span", { className: `field${strummable ? "" : " disabled"}` }, h("span", { className: "label" }, label), value);
  };

  bar.replaceChildren(
    h("span", { className: "label" }, ja ? `${groups.length} 和音` : `${groups.length} chord${groups.length > 1 ? "s" : ""}`),
    h("button", {
      onclick: () => {
        for (const i of groups.flatMap((g) => g.idx)) setNoteOverride(i, { lock: !locked });
        renderSelbar();
        renderParams();
        edited();
      },
    }, locked ? "Unlock" : "Lock"),
    // the strum fields only exist in guitar mode
    ...(guitar ? [h("span", { className: "sep" }),
    h("span", { className: `field${strummable ? "" : " disabled"}` },
      h("span", { className: "label" }, "stroke"),
      segmented(
        [["auto", "auto"], ["down", "↓"], ["up", "↑"]],
        () => {
          const dirs = keys.map((k) => overrides.chords[k]?.direction ?? "auto");
          return dirs.every((d) => d === dirs[0]) ? dirs[0] : "mixed";
        },
        (v) => setChords((c) => ({ ...c, direction: v === "auto" ? undefined : (v as "down" | "up") })),
        !strummable,
      ),
    ),
    chordNumber("speed", "speed", params.strum.downSpeed, 120, "ms"),
    chordNumber("up skip", "upSkip", params.strum.upSkip, 3, "")] : []),
    h("span", { className: "spacer" }),
    h("button", {
      onclick: () => {
        const noteKeys = new Set(groups.flatMap((g) => g.idx).map((i) => noteKey(base[i]!)));
        overrides = {
          chords: Object.fromEntries(Object.entries(overrides.chords).filter(([k]) => !keys.includes(k))),
          notes: Object.fromEntries(Object.entries(overrides.notes).filter(([k]) => !noteKeys.has(k))),
        };
        renderSelbar();
        renderParams();
        edited();
      },
      title: ja ? "選んだ和音の手での変更をすべて解除" : "Drop hand edits on the selected chords",
    }, "Reset"),
    h("button", { onclick: () => ((selected = selected.map(() => false)), renderSelbar(), schedule()) }, "Deselect"),
  );
}

// ---------------------------------------------------------------- wiring

$("prev").onclick = () => loadPreset(presetIndex < 0 ? allPresets().length - 1 : presetIndex - 1);
$("next").onclick = () => loadPreset(presetIndex + 1);
/** Every setting back to its default; the mode and the hand edits stay. */
function initParams() {
  const mode = params.mode;
  params = clone(DEFAULT_PARAMS);
  params.mode = mode;
  presetIndex = -1;
  isInit = true;
  renderMode();
  renderParams();
  renderPresetName();
  schedule();
}

function renderPresetList() {
  const item = (label: string, active: boolean, pick: () => void, remove?: () => void) => {
    const row = h("div", { className: `preset-item${active ? " active" : ""}` }, h("button", { className: "pick", onclick: () => (pick(), togglePresets(false)) }, label));
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(active));
    if (remove) row.append(h("button", { className: "remove", title: ja ? "削除" : "Delete", onclick: remove }, "×"));
    return row;
  };
  const heading = (t: string) => h("div", { className: "preset-heading" }, t);
  const tag = (m: Preset["mode"]) => (m === "any" ? "" : ` · ${m}`);
  $("preset-list").replaceChildren(
    item("Init", isInit, initParams),
    heading(ja ? "組み込み" : "Factory"),
    ...BUILTIN_PRESETS.map((p, i) => item(`${p.name}${tag(p.mode)}`, presetIndex === i, () => loadPreset(i))),
    heading(ja ? "ユーザー" : "User"),
    ...(userPresets.length
      ? userPresets.map((p, i) =>
          item(`${p.name}${tag(p.mode)}`, presetIndex === BUILTIN_PRESETS.length + i, () => loadPreset(BUILTIN_PRESETS.length + i), () => {
            userPresets.splice(i, 1);
            presetsChanged = true;
            if (presetIndex === BUILTIN_PRESETS.length + i) presetIndex = -1;
            else if (presetIndex > BUILTIN_PRESETS.length + i) presetIndex--;
            renderPresetName();
            renderPresetList();
          }),
        )
      : [h("div", { className: "preset-empty" }, ja ? "まだありません" : "none yet")]),
  );
}

function togglePresets(open = $("menu-panel").hidden) {
  $("menu-panel").hidden = !open;
  for (const id of ["menu", "preset-name"]) $(id).setAttribute("aria-expanded", String(open));
  if (open) renderPresetList();
}
$("menu").onclick = () => togglePresets();
$("preset-name").onclick = () => togglePresets();
document.addEventListener("pointerdown", (e) => {
  if (!$("menu-panel").hidden && !(e.target as HTMLElement).closest(".preset")) togglePresets(false);
});
$("save").onclick = () => {
  const name = $<HTMLInputElement>("preset-input").value.trim();
  if (!name || BUILTIN_PRESETS.some((p) => p.name === name) || name === "Init") return;
  userPresets = [...userPresets.filter((p) => p.name !== name), { name, mode: params.mode, params: clone(params) }];
  presetsChanged = true;
  presetIndex = BUILTIN_PRESETS.length + userPresets.findIndex((p) => p.name === name);
  isInit = false;
  $<HTMLInputElement>("preset-input").value = "";
  renderPresetName();
  togglePresets(false);
};
$("reseed").onclick = () => {
  seed = Math.floor(Math.random() * 1000);
  renderSeed();
  schedule();
};
const applyOut = (): DialogOutput => ({ apply: { params, seed, overrides, selected }, ...presetsOut() });
$("cancel").onclick = () => close(presetsOut());
$("apply").onclick = () => close(applyOut());
// ---------------------------------------------------------------- undo / redo (dialog edits only)

type Snapshot = string;
const snapshot = (): Snapshot => JSON.stringify({ params, overrides, seed, presetIndex, isInit });
let committed = snapshot();
const history: Snapshot[] = [];
let future: Snapshot[] = [];

/** One pointer gesture (a drag, a click) = one undo step. */
function commit() {
  const now = snapshot();
  if (now === committed) return;
  history.push(committed);
  if (history.length > 200) history.shift();
  future = [];
  committed = now;
}
// after click handlers have run
document.addEventListener("pointerup", () => setTimeout(commit, 0), true);

function restore(state: Snapshot) {
  const s = JSON.parse(state) as { params: Params; overrides: Required<Overrides>; seed: number; presetIndex: number; isInit: boolean };
  ({ params, overrides, seed, presetIndex, isInit } = s);
  committed = state;
  renderMode();
  renderParams();
  renderPresetName();
  renderSeed();
  renderSelbar();
  schedule();
}

function undo() {
  commit();
  const prev = history.pop();
  if (prev === undefined) return;
  future.push(committed);
  restore(prev);
}

function redo() {
  commit();
  const next = future.pop();
  if (next === undefined) return;
  history.push(committed);
  restore(next);
}

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if (mod && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === "Escape") close(presetsOut());
  if (e.key === "Enter") close(applyOut());
});
new ResizeObserver(schedule).observe(canvas);

renderMode();
renderTabs();
renderParams();
renderPresetName();
renderSeed();
compute();
renderSelbar();
schedule();
