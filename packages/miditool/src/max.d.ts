// SPDX-License-Identifier: MIT

// Globals provided by Max's v8 object (Max 9). Only what humino uses.
declare function outlet(index: number, ...values: unknown[]): void;
declare function outlet_dictionary(index: number, value: unknown): void;
declare function post(...values: unknown[]): void;
declare class LiveAPI {
  constructor(path: string);
  get(property: string): unknown[];
}

// v8ui drawing (jsui's mgraphics) and Live's theme colours.
declare const mgraphics: {
  init(): void;
  relative_coords: number;
  autofill: number;
  readonly size: number[];
  redraw(): void;
  set_source_rgba(r: number, g: number, b: number, a: number): void;
  set_line_width(w: number): void;
  rectangle(x: number, y: number, w: number, h: number): void;
  rectangle_rounded(x: number, y: number, w: number, h: number, ow: number, oh: number): void;
  move_to(x: number, y: number): void;
  line_to(x: number, y: number): void;
  fill(): void;
  fill_preserve(): void;
  stroke(): void;
  select_font_face(name: string): void;
  set_font_size(size: number): void;
  show_text(text: string): void;
  text_measure(text: string): number[];
};
declare const max: { getcolor(name: string): number[] };
