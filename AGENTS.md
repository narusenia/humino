# humino — agent guide

humino is an Ableton Live Extension (Extensions SDK, Live 12 Suite) that humanizes programmed guitar and piano MIDI: groove, timing drift and jitter, velocity, note length, guitar strum, pseudo sustain pedal, and (v2) connecting notes and guitar voicing.

## Where things are

- Specification: `docs/specifications/design.md`
- Plans: `docs/implementation/roadmap.md`, then `docs/implementation/v{n}/README.md`
- Decisions: `docs/adr/`
- Session handoffs: `docs/handoff/` (never at the repository root)

## Layout

- `packages/core`: pure TypeScript, no SDK imports. All note processing lives here. Tested in CI.
- `packages/miditool`: the MIDI Tools device. `build.ts` bundles core into a `v8.codebox` and writes `dist/humino.amxd` (ADR-0015). Verify with `mise run miditool:build`.
- `packages/extension`: SDK glue (context menus, dialog, storage, transactions) and the dialog UI. Built locally only.
- `sdk/`: the Ableton Extensions SDK tarballs. Git-ignored; never commit, copy or quote SDK files or docs into the repository (ADR-0012).

## Rules

- `packages/core` must not import `@ableton-extensions/*`. The dialog imports core too, so the preview and the applied result come from the same code.
- **License header**: every `.ts` file starts with `// SPDX-License-Identifier: MIT` followed by a blank line.
- **Verification**: `mise run check` (core). For extension changes also run `mise run ext:check`.
- **Commits**: one line, `<feat|fix|refactor|docs|test|chore|perf|ci>: <lowercase description>`, concrete names only (no "phase1", "step2").
- **Plan status** lives only in the table of each `docs/implementation/v{n}/README.md`.
- **Language**: specifications, plans and ADRs in Japanese; code, comments, commit messages and README in English (README_ja.md / CONTRIBUTING_ja.md are the Japanese versions).
- **Docs consistency**: when finishing a piece of work, check whether it affects `docs/`, and if it does, ask the user whether to update them.
