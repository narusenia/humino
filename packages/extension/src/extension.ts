// SPDX-License-Identifier: MIT

import { initialize, MidiClip, type ActivationContext, type Handle } from "@ableton-extensions/sdk";
import { DEFAULT_PARAMS } from "@humino/core";
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
  const state = (clip: MidiClip<"1.0.0">) => readClip(clip, context.application.song.tempo, store);

  const commands: [id: string, title: string, run: (clip: MidiClip<"1.0.0">) => Promise<void> | void][] = [
    [
      "humino.open",
      "humino…",
      async (clip) => {
        const s = state(clip);
        const last = store.last();
        const chosen = await openDialog(context, {
          notes: s.original,
          forced: s.forced,
          tempo: s.tempo,
          clipEnd: s.clipEnd,
          params: last?.params ?? DEFAULT_PARAMS,
          seed: last?.seed ?? newSeed(),
          presets: store.presets(),
          language: context.environment.language ?? "EN",
        });
        if (chosen.presets) store.savePresets(chosen.presets);
        if (chosen.apply) applyToClip(clip, s, chosen.apply.params, chosen.apply.seed, store, transaction);
      },
    ],
    [
      "humino.reapply",
      "humino: Re-apply",
      (clip) => applyToClip(clip, state(clip), store.last()?.params ?? DEFAULT_PARAMS, newSeed(), store, transaction),
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
            applyToClip(clip, { ...s, forced: forceDirection(s, dir) }, params, last?.seed ?? newSeed(), store, transaction);
          },
        ] as [string, string, (clip: MidiClip<"1.0.0">) => void],
    ),
  ];

  for (const [id, title, run] of commands) {
    context.commands.registerCommand(id, withClip(run));
    void context.ui.registerContextMenuAction("MidiClip", title, id);
  }
}
