// SPDX-License-Identifier: MIT

/**
 * A MIDI note. Mirrors the SDK's `NoteDescription` so core stays SDK-free;
 * times are in beats.
 */
export type Note = {
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
  muted?: boolean;
  probability?: number;
  velocityDeviation?: number;
  releaseVelocity?: number;
  selected?: boolean;
  /** Guitar string, 1 = high E (set by guitar voicing in v2). */
  string?: number;
};

export type Context = {
  /** Song tempo in BPM, used to turn ms into beats. */
  tempo: number;
  seed: number;
  /** Assumed 4 (ADR / design.md: only 4/4 is designed for v1). */
  beatsPerBar?: number;
};

export const DEFAULT_VELOCITY = 100;
export const MIN_DURATION = 1 / 64;
