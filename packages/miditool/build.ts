// SPDX-License-Identifier: MIT

// Builds dist/humino.amxd: a Live 12 MIDI Transformation whose v8.codebox holds
// @humino/core bundled into one script, so the device is a single file.

import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { BUILTIN_PRESETS, DEFAULT_PARAMS } from "@humino/core";

const js = (
  await esbuild.build({
    entryPoints: ["src/humino.ts"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "neutral",
    target: "es2020",
    logLevel: "info",
  })
).outputFiles[0]!.text;

type Box = Record<string, unknown> & { id: string };
const boxes: Box[] = [];
const lines: [string, number, string, number][] = [];
let y = 10;
const obj = (id: string, text: string, numinlets: number, numoutlets: number, extra: Record<string, unknown> = {}) => {
  boxes.push({ id, maxclass: "newobj", text, numinlets, numoutlets, outlettype: new Array(numoutlets).fill(""), patching_rect: [10, (y += 30), 160, 22], ...extra });
  return id;
};
const wire = (from: string, outlet: number, to: string, inlet: number) => lines.push([from, outlet, to, inlet]);

// --- core path: live.miditool.in → dict.join → v8.codebox → live.miditool.out
obj("in", "live.miditool.in", 1, 2);
obj("join", "dict.join", 2, 1, { outlettype: ["dictionary"] });
boxes.push({
  id: "code",
  maxclass: "v8.codebox",
  code: js,
  fontface: 0,
  fontname: "<Monospaced>",
  fontsize: 10,
  numinlets: 1,
  numoutlets: 3,
  outlettype: ["", "", ""],
  patching_rect: [200, 40, 400, 300],
});
obj("out", "live.miditool.out", 1, 0);
wire("in", 0, "join", 0);
wire("in", 1, "join", 1);
wire("join", 0, "code", 0);
wire("code", 0, "out", 0);
wire("code", 1, "in", 0);

// --- controls (presentation: 152 × 147, the MIDI Tools panel)
type Dial = { name: string; label: string; max: number; unit: number; init: number; x: number; y: number };
const UNIT = { int: 0, ms: 2, pct: 5 };
const d = DEFAULT_PARAMS;
const dials: Dial[] = [
  { name: "drift", label: "Drift", max: 40, unit: UNIT.ms, init: d.humanize.drift, x: 0, y: 24 },
  { name: "jitter", label: "Jitter", max: 20, unit: UNIT.ms, init: d.humanize.jitter, x: 38, y: 24 },
  { name: "spread", label: "Spread", max: 20, unit: UNIT.ms, init: d.humanize.spread, x: 76, y: 24 },
  { name: "vel", label: "Vel ±", max: 30, unit: UNIT.int, init: d.humanize.velJitter, x: 114, y: 24 },
  { name: "swing", label: "Swing", max: 75, unit: UNIT.pct, init: d.groove.swing, x: 0, y: 86 },
  { name: "strum", label: "Strum", max: 120, unit: UNIT.ms, init: d.strum.downSpeed, x: 38, y: 86 },
  { name: "legato", label: "Legato", max: 100, unit: UNIT.pct, init: d.humanize.legato, x: 76, y: 86 },
];
const valueof = (v: Record<string, unknown>) => ({ saved_attribute_attributes: { valueof: v } });

obj("route", `route ${[...dials.map((x) => x.name), "mode"].join(" ")}`, 1, dials.length + 2);
wire("code", 2, "route", 0);

boxes.push({
  id: "mode",
  maxclass: "live.tab",
  varname: "Mode",
  numinlets: 1,
  numoutlets: 3,
  outlettype: ["", "", "float"],
  parameter_enable: 1,
  num_lines_patching: 1,
  num_lines_presentation: 1,
  patching_rect: [640, 40, 70, 20],
  presentation: 1,
  presentation_rect: [4, 2, 64, 17],
  ...valueof({ parameter_enum: ["Gtr", "Pno"], parameter_longname: "Mode", parameter_shortname: "Mode", parameter_type: 2, parameter_mmax: 1, parameter_initial: [d.mode === "guitar" ? 0 : 1], parameter_initial_enable: 1 }),
});
obj("p-mode", "prepend mode", 1, 1, { patching_rect: [640, 70, 90, 22] });
wire("mode", 0, "p-mode", 0);
wire("p-mode", 0, "code", 0);
obj("s-mode", "prepend set", 1, 1, { patching_rect: [640, 10, 80, 22] });
wire("route", dials.length, "s-mode", 0);
wire("s-mode", 0, "mode", 0);

boxes.push({
  id: "preset",
  maxclass: "live.menu",
  varname: "Preset",
  numinlets: 1,
  numoutlets: 3,
  outlettype: ["", "", "float"],
  parameter_enable: 1,
  patching_rect: [740, 40, 100, 20],
  presentation: 1,
  presentation_rect: [72, 2, 76, 17],
  ...valueof({ parameter_enum: BUILTIN_PRESETS.map((p) => p.name), parameter_longname: "Preset", parameter_shortname: "Preset", parameter_type: 2, parameter_mmax: BUILTIN_PRESETS.length - 1, parameter_initial: [0], parameter_initial_enable: 1 }),
});
obj("p-preset", "prepend preset", 1, 1, { patching_rect: [740, 70, 100, 22] });
wire("preset", 0, "p-preset", 0);
wire("p-preset", 0, "code", 0);

dials.forEach((dial, k) => {
  const id = `dial-${dial.name}`;
  const px = 640 + k * 70;
  boxes.push({
    id,
    maxclass: "live.dial",
    varname: dial.label,
    numinlets: 1,
    numoutlets: 2,
    outlettype: ["", "float"],
    parameter_enable: 1,
    patching_rect: [px, 140, 44, 48],
    presentation: 1,
    presentation_rect: [dial.x, dial.y, 38, 48],
    ...valueof({ parameter_longname: dial.label, parameter_shortname: dial.label, parameter_type: 0, parameter_mmin: 0, parameter_mmax: dial.max, parameter_unitstyle: dial.unit, parameter_initial: [dial.init], parameter_initial_enable: 1 }),
  });
  obj(`p-${dial.name}`, `prepend ${dial.name}`, 1, 1, { patching_rect: [px, 200, 66, 22] });
  obj(`s-${dial.name}`, "prepend set", 1, 1, { patching_rect: [px, 110, 66, 22] });
  wire(id, 0, `p-${dial.name}`, 0);
  wire(`p-${dial.name}`, 0, "code", 0);
  wire("route", k, `s-${dial.name}`, 0);
  wire(`s-${dial.name}`, 0, id, 0);
});

const patcher = {
  patcher: {
    fileversion: 1,
    appversion: { major: 9, minor: 0, revision: 0, architecture: "x64", modernui: 1 },
    classnamespace: "box",
    rect: [100, 100, 1200, 600],
    openrect: [0, 0, 152, 147],
    openinpresentation: 1,
    default_fontsize: 10,
    default_fontface: 0,
    default_fontname: "Arial Bold",
    gridonopen: 1,
    gridsize: [8, 8],
    gridsnaponopen: 1,
    objectsnaponopen: 1,
    statusbarvisible: 2,
    toolbarvisible: 1,
    bglocked: 0,
    lefttoolbarpinned: 0,
    toptoolbarpinned: 0,
    righttoolbarpinned: 0,
    bottomtoolbarpinned: 0,
    toolbars_unpinned_last_save: 0,
    tallnewobj: 0,
    boxanimatetime: 500,
    enablehscroll: 1,
    enablevscroll: 1,
    devicewidth: 152,
    description: "humino: humanize, groove and strum for programmed guitar and piano",
    digest: "",
    tags: "",
    style: "",
    subpatcher_template: "",
    assistshowspatchername: 0,
    boxes: boxes.map(({ id, ...rest }) => ({ box: { id, ...rest } })),
    lines: lines.map(([s, so, t, ti]) => ({ patchline: { source: [s, so], destination: [t, ti] } })),
    dependency_cache: [],
    latency: 0,
    is_mpe: 0,
    minimum_live_version: "",
    minimum_max_version: "",
    platform_compatibility: 0,
    autosave: 0,
    saved_attribute_attributes: { default_plcolor: { expression: "" } },
    // Max dereferences every project field on load (a missing searchpath crashes Live), so keep the full set.
    // amxdtype "natt" = MIDI Transformation, the value Live's own template uses.
    project: {
      version: 1,
      creationdate: 3590052493,
      modificationdate: 3590052493,
      viewrect: [25, 124, 300, 500],
      autoorganize: 1,
      hideprojectwindow: 1,
      showdependencies: 1,
      autolocalize: 0,
      contents: { patchers: {} },
      layout: {},
      searchpath: {},
      detailsvisible: 0,
      amxdtype: 1851880564,
      readonly: 0,
      devpathtype: 0,
      devpath: ".",
      sortmode: 0,
      viewmode: 0,
      includepackages: 0,
    },
  },
};

// .amxd = "ampf" header, device type, empty meta chunk, then the patcher JSON (NUL-terminated).
const body = Buffer.concat([Buffer.from(JSON.stringify(patcher, null, "\t")), Buffer.from([0])]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync(
  "dist/humino.amxd",
  Buffer.concat([Buffer.from("ampf"), u32(4), Buffer.from("natt"), Buffer.from("meta"), u32(4), u32(0), Buffer.from("ptch"), u32(body.length), body]),
);
console.log(`dist/humino.amxd ${(body.length / 1024).toFixed(1)} KB`);
