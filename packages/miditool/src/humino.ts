// SPDX-License-Identifier: MIT

// humino as a Live 12 MIDI Transformation, running in Max 9's v8.codebox.
// Patch: live.miditool.in (notes, context) → dict.join → this → live.miditool.out,
// and outlet 1 bangs live.miditool.in when a control changes (Auto-like).
// Live re-sends the notes from the start of the apply cycle on every bang, so
// re-applying never stacks (no original-note store needed, unlike the SDK version).

import { DEVICES, layout } from "./controls.js";
import { BUILTIN_PRESETS, process, type Mode, type Note, type Params, type Scale } from "@humino/core";

type ToolNote = {
  note_id?: number;
  pitch: number;
  start_time: number;
  duration: number;
  velocity?: number;
  mute?: number;
  probability?: number;
  velocity_deviation?: number;
  release_velocity?: number;
};
type ToolInput = {
  notes?: ToolNote[];
  clip?: { time_selection_end?: number; last_note_end?: number };
  scale?: { scale_mode?: number; root_note?: number; scale_intervals?: number[]; scale_name?: string };
  seed?: number;
};

const g = globalThis as Record<string, unknown>;
g.inlets = 1;
g.outlets = 4; // 0 notes, 1 bang to live.miditool.in, 2 values back to the controls, 3 thispatcher

// build.ts puts `globalThis.HUMINO_DEVICE = "<id>"` before this bundle.
const device = DEVICES.find((d) => d.id === g.HUMINO_DEVICE) ?? DEVICES[0]!;
const full = device.id === "all";
const CONTROLS = layout(device);
let params: Params = device.params();
// shortcut: controls report their saved values right after load; ignore them for a moment so
// loading the device does not transform the selection. Upgrade if Live adds a load-done hook here.
const loadedAt = Date.now();

const tempo = () => {
  try {
    const t = Number(new LiveAPI("live_set").get("tempo")[0]);
    return t > 0 ? t : 120;
  } catch {
    return 120; // Live API not ready: fall back rather than fail the transform
  }
};

/** Live's scale from the tool's context, else from the Live set; undefined when Scale Mode is off. */
const scale = (input: ToolInput): Scale | undefined => {
  const s = input.scale;
  if (s?.scale_mode !== undefined)
    return s.scale_mode ? { root: s.root_note ?? 0, intervals: s.scale_intervals ?? [], ...(s.scale_name && { name: s.scale_name }) } : undefined;
  try {
    const set = new LiveAPI("live_set");
    if (!Number(set.get("scale_mode")[0])) return undefined;
    return { root: Number(set.get("root_note")[0]), intervals: set.get("scale_intervals").map(Number), name: String(set.get("scale_name")[0] ?? "") };
  } catch {
    return undefined; // no scale: Connect falls back to chromatic runs
  }
};

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const hasConnect = CONTROLS.some((c) => c.key === "runon");
/** Shows the scale in the header's 42 px, so long names shrink ("Harmonic Minor" → "HarM"). */
function showScale(s: Scale | undefined) {
  if (!hasConnect) return;
  let text = s ? `${NAMES[s.root % 12]} ${s.name ?? ""}`.trim() : "No scl";
  if (text.length > 7 && s?.name) text = `${NAMES[s.root % 12]} ${s.name.split(" ").map((w, i) => (i ? w[0] : w.slice(0, 3))).join("")}`;
  outlet(3, "script", "send", "scale", "set", text);
}

const toCore = (n: ToolNote): Note => ({
  pitch: n.pitch,
  startTime: n.start_time,
  duration: n.duration,
  ...(n.velocity !== undefined && { velocity: n.velocity }),
  ...(n.mute !== undefined && { muted: !!n.mute }),
  ...(n.probability !== undefined && { probability: n.probability }),
  ...(n.velocity_deviation !== undefined && { velocityDeviation: n.velocity_deviation }),
  ...(n.release_velocity !== undefined && { releaseVelocity: n.release_velocity }),
});

/** Called by v8 with the joined notes + context dictionary. */
g.msg_dictionary = (input: ToolInput) => {
  const notes = input.notes ?? [];
  const clipEnd = input.clip?.time_selection_end ?? input.clip?.last_note_end;
  const sc = scale(input);
  showScale(sc);
  const r = process(notes.map(toCore), params, {
    tempo: tempo(),
    seed: input.seed ?? 0,
    ...(clipEnd !== undefined && { clipEnd }),
    ...(sc && { scale: sc }),
  });
  const out = notes.flatMap((src, i) => {
    if (r.dropped.has(i)) return [];
    const n = r.final[i]!;
    return [{ ...src, start_time: n.startTime, duration: n.duration, velocity: n.velocity ?? src.velocity }];
  });
  // Connect's notes are new (no note_id); Live re-sends the originals on every apply, so they never pile up.
  const added = r.added.map((n) => ({ pitch: n.pitch, start_time: n.startTime, duration: n.duration, velocity: n.velocity }));
  outlet_dictionary(0, { notes: [...out, ...added] });
};

/** Greys out the controls the current mode does not use. */
function syncActive() {
  for (const c of CONTROLS) if (c.mode) outlet(3, "script", "send", c.key, "active", c.mode === params.mode ? 1 : 0);
}

/** Re-run the transform with the current settings (Auto-like). */
function changed() {
  if (Date.now() - loadedAt < 1000) return;
  outlet(1, "bang");
}

/** Show the controls on the current values without re-triggering them. */
function showAll() {
  if (full) outlet(2, "mode", params.mode === "guitar" ? 0 : 1);
  for (const c of CONTROLS) outlet(2, c.key, c.get(params));
}

// Messages from the device's controls ([prepend ...] → this).
g.mode = (i: number) => {
  params.mode = (["guitar", "piano"] as Mode[])[i] ?? "piano";
  syncActive();
  changed();
};
g.preset = (i: number) => {
  const p = BUILTIN_PRESETS[i];
  if (!p) return;
  const { mode, connect } = params;
  params = JSON.parse(JSON.stringify(p.params)) as Params;
  params.mode = p.mode === "any" ? mode : p.mode;
  params.connect = connect; // presets have no Connect settings of their own
  showAll();
  syncActive();
  changed();
};
/** [prepend param <key>] from every dial and tab in CONTROLS. */
g.param = (key: string, v: number) => {
  const c = CONTROLS.find((x) => x.key === key);
  if (!c) return;
  c.set(params, v);
  changed();
};
/** Page tab: hide the other pages' controls through [thispatcher]. */
g.page = (i: number) => {
  for (const c of CONTROLS) outlet(3, "script", c.page === i ? "show" : "hide", c.key);
  if (full) {
    outlet(3, "script", i === 0 ? "show" : "hide", "preset");
    // Connect does not depend on the mode, so its pages show the scale in the mode's place.
    outlet(3, "script", i >= 3 ? "hide" : "show", "mode");
    outlet(3, "script", i >= 3 ? "show" : "hide", "scale");
  }
  if (i >= 3 || !full) showScale(scale({}));
  syncActive();
};
