// SPDX-License-Identifier: MIT

// Globals provided by Max's v8 object (Max 9). Only what humino uses.
declare function outlet(index: number, ...values: unknown[]): void;
declare function outlet_dictionary(index: number, value: unknown): void;
declare function post(...values: unknown[]): void;
declare class LiveAPI {
  constructor(path: string);
  get(property: string): unknown[];
}
