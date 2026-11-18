// SPDX-License-Identifier: MIT

import { initialize, MidiClip, type ActivationContext, type Handle } from "@ableton-extensions/sdk";
import { chordWindowBeats, DEFAULT_PARAMS, extractGroove } from "@humino/core";
import { applyToClip, forceDirection, newSeed, readClip } from "./apply.js";
import { openDialog } from "./dialog.js";
import { Store } from "./store.js";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  const store = new Store(context.environment.storageDirectory);
  const transaction = (fn: () => void) => context.withinTransaction(fn);

  const withClip = (run: (clip: MidiClip<"1.0.0">) => Promise<void> | void) => (handle: unknown) => {
    void (async () => {
      try {
        await run(context.getObjectFromHandle(handle as Handle, MidiClip));
      } catch (e) {
        console.error("humino:", e);
      }
    })();
  };
  const state = (clip: MidiClip<"1.0.0">) => {
    const song = context.application.song;
    return readClip(clip, song.tempo, song.scaleMode ? { root: song.rootNote, intervals: song.scaleIntervals, name: song.scaleName } : undefined, store);
  };

  const commands: [id: string, title: string, run: (clip: MidiClip<"1.0.0">) => Promise<void> | void][] = [
    [
      "humino.open",
      "humino…",
      async (clip) => {
        const s = state(clip);
        const last = store.last();
        const groove = store.groove();
        const chosen = await openDialog(context, {
          notes: s.original,
          overrides: s.overrides,
          tempo: s.tempo,
          clipEnd: s.clipEnd,
          ...(s.scale && { scale: s.scale }),
          params: last?.params ?? DEFAULT_PARAMS,
          seed: last?.seed ?? newSeed(),
          ...(groove && { groove }),
          presets: store.presets(),
          language: context.environment.language ?? "EN",
        });
        if (chosen.presets) store.savePresets(chosen.presets);
        if (chosen.apply) {
          const { params, seed, overrides, selected } = chosen.apply;
          applyToClip(clip, { ...s, overrides }, params, seed, store, transaction, selected);
        }
      },
    ],
    [
      "humino.reapply",
      "humino: Re-apply",
      (clip) => applyToClip(clip, state(clip), store.last()?.params ?? DEFAULT_PARAMS, newSeed(), store, transaction),
    ],
    [
      "humino.groove.extract",
      "humino: Extract Groove",
      (clip) => {
        // the clip as it is now: a played (or humanized) part is the point
        const params = store.last()?.params ?? DEFAULT_PARAMS;
        const g = extractGroove(clip.notes, chordWindowBeats(params, context.application.song.tempo));
        store.saveGroove({ ...g, clip: clip.name });
      },
    ],
    ...(["down", "up"] as const).map(
      (dir) =>
        [
          `humino.strum.${dir}`,
          `humino: Strum ${dir === "down" ? "Down" : "Up"}`,
          (clip: MidiClip<"1.0.0">) => {
            const s = state(clip);
            const last = store.last();
            const params = { ...(last?.params ?? DEFAULT_PARAMS), mode: "guitar" as const };
            // keep the last seed so only the stroke direction changes
            applyToClip(clip, { ...s, overrides: forceDirection(s, dir, params) }, params, last?.seed ?? newSeed(), store, transaction);
          },
        ] as [string, string, (clip: MidiClip<"1.0.0">) => void],
    ),
  ];

  for (const [id, title, run] of commands) {
    context.commands.registerCommand(id, withClip(run));
    void context.ui.registerContextMenuAction("MidiClip", title, id);
  }
}
