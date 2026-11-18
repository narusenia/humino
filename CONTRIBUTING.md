# Contributing

## Setup

1. Install [mise](https://mise.jdx.dev/), then run `mise install` (Node 24, lefthook) and `mise run hooks:install`.
2. `mise run install`, then `mise run check`. This covers `packages/core` and needs nothing from Ableton.

### Extension (optional, needs Live 12 Suite)

The Ableton Extensions SDK is not on npm and its license forbids redistribution, so it is not in this repository.

1. Join the Ableton Beta Program and install Live 12.4.5 beta or later.
2. Download "Extensions SDK and Documentation" from the beta program and put the `*.tgz` files in `sdk/` at the repository root (git-ignored).
3. `mise run ext:install`, then `mise run ext:check`.
4. In Live: Settings → Extensions → enable Developer Mode. Then `mise run ext:start`.

## Where to put code

- Note processing goes in `packages/core` (pure functions, no SDK imports) with a test in `packages/core/test`.
- Live integration and the dialog UI go in `packages/extension`.

## Commits

One line: `<feat|fix|refactor|docs|test|chore|perf|ci>: <lowercase description>`. The commit-msg hook checks it.

## Design docs

The specification, plans and design decisions are in `docs/` (in Japanese).
