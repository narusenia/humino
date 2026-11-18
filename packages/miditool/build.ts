// SPDX-License-Identifier: MIT

// Builds dist/humino.amxd: a Live 12 MIDI Transformation whose v8.codebox holds
// @humino/core bundled into one script, so the device is a single file.

import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { BUILTIN_PRESETS } from "@humino/core";
import { DEVICES, layout, TAB_Y, type Device } from "./src/controls.js";

const bundle = async (entry: string) =>
  (await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: "iife", platform: "neutral", target: "es2020", logLevel: "info" })).outputFiles[0]!.text;
const js = await bundle("src/humino.ts");
const viewJs = await bundle("src/view.ts");

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

type Box = Record<string, unknown> & { id: string };

function build(dev: Device) {
  const CONTROLS = layout(dev);
  const full = dev.id === "all";
  const hasConnect = CONTROLS.some((c) => c.key === "runon");
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
    code: `globalThis.HUMINO_DEVICE = ${JSON.stringify(dev.id)};\n${js}`,
    fontface: 0,
    fontname: "<Monospaced>",
    fontsize: 10,
    numinlets: 1,
    numoutlets: 5,
    outlettype: ["", "", "", "", ""],
    patching_rect: [200, 40, 400, 300],
  });
  obj("out", "live.miditool.out", 1, 0);
  wire("in", 0, "join", 0);
  wire("in", 1, "join", 1);
  wire("join", 0, "code", 0);
  wire("code", 0, "out", 0);
  wire("code", 1, "in", 0);

  // --- controls (presentation: 152 × 147, the MIDI Tools panel)
  // Header: page tab (when there are pages) + mode (full device); each page shows its controls (src/controls.ts).
  // The full device's preset menu sits in the Hum tab row.
  const d = dev.params();
  const valueof = (v: Record<string, unknown>) => ({ saved_attribute_attributes: { valueof: v } });
  const enumParam = (longname: string, short: string, names: string[], initial: number) =>
    valueof({ parameter_enum: names, parameter_longname: longname, parameter_shortname: short, parameter_type: 2, parameter_mmax: names.length - 1, parameter_initial: [initial], parameter_initial_enable: 1 });
  /** Live's Info View text for a control. */
  const info = (c: { label: string; tip: string }) => ({ annotation: c.tip, annotation_name: c.label });
  const tabBox = (id: string, rect: number[], px: number, py: number, hidden: boolean, param: object, menu = false) =>
    boxes.push({
      id, maxclass: menu ? "live.menu" : "live.tab", varname: id, numinlets: 1, numoutlets: 3, outlettype: ["", "", "float"], parameter_enable: 1,
      num_lines_patching: 1, num_lines_presentation: 1, patching_rect: [px, py, rect[2], rect[3]], presentation: 1, presentation_rect: rect,
      ...(hidden && { hidden: 1 }), ...param,
    });

  obj("route", `route mode ${CONTROLS.map((c) => c.key).join(" ")}`, 1, CONTROLS.length + 2, { patching_rect: [200, 360, 400, 22] });
  wire("code", 2, "route", 0);
  obj("thispatcher", "thispatcher", 1, 2, { patching_rect: [200, 400, 80, 22] });
  wire("code", 3, "thispatcher", 0);

  if (full) {
  tabBox("mode", [106, 2, 42, 15], 640, 10, false, { ...enumParam("Mode", "Mode", ["Gtr", "Pno"], d.mode === "guitar" ? 0 : 1), ...info({ label: "Mode", tip: "Guitar turns on Strum, Piano turns on Pedal." }) });
  obj("p-mode", "prepend mode", 1, 1, { patching_rect: [640, 34, 90, 22] });
  wire("mode", 0, "p-mode", 0);
  wire("p-mode", 0, "code", 0);
  obj("s-mode", "prepend set", 1, 1, { patching_rect: [720, 10, 70, 22] });
  wire("route", 0, "s-mode", 0);
  wire("s-mode", 0, "mode", 0);

  boxes.push({
    id: "preset", maxclass: "live.menu", varname: "preset", numinlets: 1, numoutlets: 3, outlettype: ["", "", "float"], parameter_enable: 1,
    patching_rect: [800, 10, 100, 15], presentation: 1, presentation_rect: [4, TAB_Y, 144, 15],
    ...enumParam("Preset", "Preset", BUILTIN_PRESETS.map((p) => p.name), 0),
    ...info({ label: "Preset", tip: "Loads a built-in preset. Connect settings are kept." }),
  });
  obj("p-preset", "prepend preset", 1, 1, { patching_rect: [800, 34, 100, 22] });
  wire("preset", 0, "p-preset", 0);
  wire("p-preset", 0, "code", 0);
  }

  if (dev.pages.length > 1) {
    const tip = full ? "Hum: humanize. Feel: swing and pedal. Str: strum. Run: chromatic runs and passing tones. Grc: grace notes." : `Pages: ${dev.pageNames.join(", ")}.`;
    tabBox("page", [4, 2, full || hasConnect ? 100 : 144, 15], 920, 10, false, { ...enumParam("Page", "Page", dev.pageNames, 0), ...info({ label: "Page", tip }) });
    obj("p-page", "prepend page", 1, 1, { patching_rect: [920, 34, 90, 22] });
    wire("page", 0, "p-page", 0);
    wire("p-page", 0, "code", 0);
  }

  // Live's scale, filled in by humino.ts (Run / Grc pages of the full device, always on Connect)
  if (hasConnect)
    boxes.push({
      id: "scale", maxclass: "live.comment", varname: "scale", text: "Scale", numinlets: 1, numoutlets: 0, textjustification: 2,
      patching_rect: [1000, 10, 100, 18], presentation: 1, presentation_rect: [106, 2, 42, 15], ...(full && { hidden: 1 }),
      ...info({ label: "Scale", tip: "Live's current scale (Scale Mode). Passing tones and In grace notes use it." }),
    });

  // The picture: a v8ui with src/view.ts embedded. humino.ts sends it values; its drags go to the dials.
  if (dev.view) {
    const text = `globalThis.HUMINO_DEVICE = ${JSON.stringify(dev.id)};\n${viewJs}`;
    boxes.push({
      // embed is a box attribute too; without it Max looks for humino-view.js on disk
      id: "view", maxclass: "v8ui", embed: 1, numinlets: 1, numoutlets: 1, outlettype: [""], parameter_enable: 0,
      patching_rect: [1000, 200, 144, 120], presentation: 1, presentation_rect: dev.view,
      textfile: { filename: "humino-view.js", flags: 0, embed: 1, autowatch: 0, text },
    });
    wire("code", 4, "view", 0);
    obj("view-route", `route ${CONTROLS.map((c) => c.key).join(" ")}`, 1, CONTROLS.length + 1, { patching_rect: [1000, 330, 200, 22] });
    wire("view", 0, "view-route", 0);
    CONTROLS.forEach((c, k) => wire("view-route", k, c.key, 0));
  }

  CONTROLS.forEach((c, k) => {
    const px = 640 + (k % 8) * 70;
    const py = 80 + Math.floor(k / 8) * 120;
    const hidden = c.page !== 0;
    const shown = !dev.hide?.includes(c.key);
    if (c.kind === "tab") tabBox(c.key, [c.x, c.y, c.w, 15], px, py, hidden, { ...enumParam(c.label, c.label, c.options, c.get(d)), ...info(c) }, c.menu);
    else if (c.kind === "toggle")
      boxes.push({
        id: c.key, maxclass: "live.text", varname: c.key, text: c.label, texton: c.label, mode: 1, numinlets: 1, numoutlets: 2, outlettype: ["", ""], parameter_enable: 1,
        patching_rect: [px, py, c.w, 15], presentation: 1, presentation_rect: [c.x, c.y, c.w, 15], ...(hidden && { hidden: 1 }), ...info(c),
        ...enumParam(c.label, c.label, ["off", "on"], c.get(d)),
      });
    else
      boxes.push({
        id: c.key, maxclass: "live.dial", varname: c.key, numinlets: 1, numoutlets: 2, outlettype: ["", "float"], parameter_enable: 1,
        patching_rect: [px, py, 44, 48], presentation: shown ? 1 : 0, presentation_rect: [c.x, c.y, 44, 48], ...(hidden && { hidden: 1 }), ...info(c),
        ...valueof({ parameter_longname: c.label, parameter_shortname: c.label, parameter_type: 0, parameter_mmin: 0, parameter_mmax: c.max, parameter_unitstyle: c.unit, parameter_initial: [c.get(d)], parameter_initial_enable: 1 }),
      });
    obj(`p-${c.key}`, `prepend param ${c.key}`, 1, 1, { patching_rect: [px, py + 56, 66, 22] });
    obj(`s-${c.key}`, "prepend set", 1, 1, { patching_rect: [px, py - 26, 66, 22] });
    wire(c.key, 0, `p-${c.key}`, 0);
    wire(`p-${c.key}`, 0, "code", 0);
    wire("route", k + 1, `s-${c.key}`, 0);
    wire(`s-${c.key}`, 0, c.key, 0);
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
      description: full ? "humino: humanize, groove, strum and connect for programmed guitar and piano" : `humino: ${dev.pageNames[0]!.toLowerCase()} only`,
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

  const out = `dist/${dev.file}.amxd`;
  fs.writeFileSync(out, Buffer.concat([Buffer.from("ampf"), u32(4), Buffer.from("natt"), Buffer.from("meta"), u32(4), u32(0), Buffer.from("ptch"), u32(body.length), body]));
  console.log(`${out} ${(body.length / 1024).toFixed(1)} KB`);
}

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist");
for (const dev of DEVICES) build(dev);
