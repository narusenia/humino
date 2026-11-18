// SPDX-License-Identifier: MIT

import type { ExtensionContext } from "@ableton-extensions/sdk";
import type { Note, Overrides, Params, Preset, Scale } from "@humino/core";

declare const __DIALOG_HTML__: string;

/** Data handed to the dialog page as `window.HUMINO`. */
export type DialogInput = {
  notes: Note[];
  overrides: Overrides;
  tempo: number;
  clipEnd: number;
  /** Live's scale, absent when Scale Mode is off. */
  scale?: Scale;
  params: Params;
  seed: number;
  /** User presets only; builtins come from core inside the dialog. */
  presets: Preset[];
  language: string;
};

/** What the dialog sends back with `close_and_send`. */
export type DialogOutput = {
  /** `overrides` and `selected` (per input note) are the dialog's edits. */
  apply?: { params: Params; seed: number; overrides: Overrides; selected: boolean[] };
  /** Present when the user saved or deleted presets. */
  presets?: Preset[];
};

export async function openDialog(context: ExtensionContext<"1.0.0">, input: DialogInput): Promise<DialogOutput> {
  const data = JSON.stringify(input).replaceAll("<", "\\u003c"); // cannot close the script tag
  const html = __DIALOG_HTML__.replace("/*DATA*/", () => `window.HUMINO = ${data};`);
  const result = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 960, 720);
  try {
    return JSON.parse(result) as DialogOutput;
  } catch {
    return {}; // closed without a result: treat as Cancel
  }
}
