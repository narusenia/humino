// SPDX-License-Identifier: MIT

// humino as a Live 12 MIDI Transformation, running in Max 9's v8.codebox.
// Patch: live.miditool.in (notes, context) → dict.join → this → live.miditool.out,
// and outlet 1 bangs live.miditool.in when a control changes (Auto-like).
// Live re-sends the notes from the start of the apply cycle on every bang, so
// re-applying never stacks (no original-note store needed, unlike the SDK version).

import { BUILTIN_PRESETS, DEFAULT_PARAMS, process, type Mode, type Note, type Params } from "@humino/core";

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
  seed?: number;
};

const g = globalThis as Record<string, unknown>;
g.inlets = 1;
g.outlets = 3; // 0 notes, 1 bang to live.miditool.in, 2 control values back to the dials

let params: Params = JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as Params;
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
  const r = process(notes.map(toCore), params, {
    tempo: tempo(),
    seed: input.seed ?? 0,
    ...(clipEnd !== undefined && { clipEnd }),
  });
  const out = notes.flatMap((src, i) => {
    if (r.dropped.has(i)) return [];
    const n = r.final[i]!;
    return [{ ...src, start_time: n.startTime, duration: n.duration, velocity: n.velocity ?? src.velocity }];
  });
  outlet_dictionary(0, { notes: out });
};

/** Re-run the transform with the current settings (Auto-like). */
function changed() {
  if (Date.now() - loadedAt < 1000) return;
  outlet(1, "bang");
}

const setter =
  <K extends keyof Params, F extends keyof Params[K]>(section: K, field: F) =>
  (v: number) => {
    (params[section] as Record<F, number>)[field] = v;
    changed();
  };

// Messages from the device's controls ([prepend <name>] → this).
g.mode = (i: number) => {
  params.mode = (["guitar", "piano"] as Mode[])[i] ?? "piano";
  changed();
};
g.preset = (i: number) => {
  const p = BUILTIN_PRESETS[i];
  if (!p) return;
  const mode = params.mode;
  params = JSON.parse(JSON.stringify(p.params)) as Params;
  params.mode = p.mode === "any" ? mode : p.mode;
  // show the preset's values on the dials without re-triggering them
  outlet(2, "mode", params.mode === "guitar" ? 0 : 1);
  outlet(2, "drift", params.humanize.drift);
  outlet(2, "jitter", params.humanize.jitter);
  outlet(2, "spread", params.humanize.spread);
  outlet(2, "vel", params.humanize.velJitter);
  outlet(2, "legato", params.humanize.legato);
  outlet(2, "swing", params.groove.swing);
  outlet(2, "strum", params.strum.downSpeed);
  outlet(2, "grid", params.groove.swingGrid === 8 ? 0 : 1);
  changed();
};
g.grid = (i: number) => {
  params.groove.swingGrid = i === 0 ? 8 : 16;
  changed();
};
g.drift = setter("humanize", "drift");
g.jitter = setter("humanize", "jitter");
g.spread = setter("humanize", "spread");
g.vel = setter("humanize", "velJitter");
g.legato = setter("humanize", "legato");
g.swing = setter("groove", "swing");
g.strum = (ms: number) => {
  params.strum.downSpeed = ms;
  params.strum.upSpeed = Math.round(ms * (DEFAULT_PARAMS.strum.upSpeed / DEFAULT_PARAMS.strum.downSpeed));
  changed();
};
