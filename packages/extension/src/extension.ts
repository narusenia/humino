// SPDX-License-Identifier: MIT

import { initialize, type ActivationContext } from "@ableton-extensions/sdk";

// Menus, dialog and storage come with the v1 tickets (docs/implementation/v1).
export function activate(activation: ActivationContext) {
  initialize(activation, "1.0.0");
}
