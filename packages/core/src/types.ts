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
};
