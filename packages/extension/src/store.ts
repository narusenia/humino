// SPDX-License-Identifier: MIT

import * as fs from "node:fs";
import * as path from "node:path";
import { completeParams, type Direction, type ExtractedGroove, type Note, type Overrides, type Params, type Preset } from "@humino/core";

/** Original notes keyed by the hash of the notes humino wrote (ADR-0002). */
export type OriginalEntry = {
  original: Note[];
  savedAt: number;
  /** Hand edits for this clip (chord and note overrides). */
  overrides?: Overrides;
  /** Older entries: Strum Down / Up directions only. Read into `overrides`. */
  forced?: Record<string, Direction>;
};
export type Last = { params: Params; seed: number };
/** The groove last taken with Extract Groove, and the clip it came from. */
export type SavedGroove = ExtractedGroove & { clip: string };

const MAX_ORIGINALS = 500;

export class Store {
  constructor(private readonly dir: string | undefined) {}

  private read<T>(name: string, fallback: T): T {
    if (!this.dir) return fallback;
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8")) as T;
    } catch {
      return fallback; // missing or corrupt: start fresh rather than block the user
    }
  }

  private write(name: string, value: unknown) {
    if (!this.dir) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, name);
    // write then rename so a crash never leaves half a file
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(value));
    fs.renameSync(`${file}.tmp`, file);
  }

  original(hash: string): OriginalEntry | undefined {
    return this.read<Record<string, OriginalEntry>>("originals.json", {})[hash];
  }

  saveOriginal(hash: string, entry: OriginalEntry) {
    const all = this.read<Record<string, OriginalEntry>>("originals.json", {});
    all[hash] = entry;
    const keys = Object.keys(all).sort((a, b) => all[b]!.savedAt - all[a]!.savedAt);
    for (const k of keys.slice(MAX_ORIGINALS)) delete all[k];
    this.write("originals.json", all);
  }

  last(): Last | undefined {
    const last = this.read<Last | undefined>("last.json", undefined);
    return last && { ...last, params: completeParams(last.params) };
  }

  saveLast(last: Last) {
    this.write("last.json", last);
  }

  groove(): SavedGroove | undefined {
    return this.read<SavedGroove | undefined>("groove.json", undefined);
  }

  saveGroove(groove: SavedGroove) {
    this.write("groove.json", groove);
  }

  presets(): Preset[] {
    return this.read<Preset[]>("presets.json", []).map((p) => ({ ...p, params: completeParams(p.params) }));
  }

  savePresets(presets: Preset[]) {
    this.write("presets.json", presets);
  }
}
