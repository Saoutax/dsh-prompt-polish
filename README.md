# @saoutax/dsh-prompt-polish · Prompt Polish

English | [简体中文](README.zh.md)

A DeepSeek Harness plugin that polishes the composer prompt with AI.

A compact button sits in the composer toolbar beside the model selector. Click it and the current draft is rewritten in place; the button turns into an undo control for 8 seconds.

## Installation

The package is published on npm; the simplest path is the DSH CLI:

```sh
dsh plugin --profile web add @saoutax/dsh-prompt-polish
```

A released `.tgz` (see Releases below) or a local directory also work as the install target, for offline installs or development.

## Features

- **In-place rewrite** - the draft is replaced with the polished text; nothing is submitted to the Session, so no chat row is produced.
- **One undo** - the pre-polish draft is kept for 8 seconds; clicking the button again restores it.
- **Reference chips survive** - `@file` / `@session` chips are re-anchored into the rewritten text; chips the rewrite no longer mentions are appended instead of dropped.
- **Command drafts polish too** - a draft that opens with a claimed command chip (plan mode's `/plan`, a picked slash command) is polished like any other: only the prose after the token is rewritten, and the claim is carried through untouched. A `/plan` chip with no task text after it has nothing to polish, so the button stays hidden until you type the task.
- **Model choice** - configure `provider` / `model` on the plugin row, or leave them empty to use the Session's own route, including its reasoning effort (falling back to the deployment default model).
- **Shortcut** - `Ctrl+Shift+.` on Windows/Linux, `Cmd+Shift+.` on macOS, runs the focused conversation's button action.

## Configuration

| Field             | Default                     | Meaning                                                    |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| `provider`        | `""`                        | Provider route for the rewrite; empty follows the Session. |
| `model`           | `""`                        | Model id for the rewrite; empty follows the Session.       |
| `instructions`    | empty → `prompts/polish.md` | System instruction defining what "polish" means.           |
| `maxInputChars`   | `8000`                      | Longest draft a single rewrite accepts.                    |
| `maxOutputTokens` | `2000`                      | Output tokens requested from the model.                    |
| `temperature`     | `0.3`                       | Sampling temperature.                                      |

The default instruction lives only in `prompts/polish.md`; the build copies that file into the package, and the Host reads it at activation. There is no compiled-in copy to drift from it, so a package whose instruction file is missing or empty refuses to activate with an explicit error instead of silently running without its rules. Set `instructions` to override the file per plugin row.

## Development

```sh
pnpm install
pnpm run build     # bundle both halves + refresh icon.svg
pnpm run check     # oxfmt + oxlint (type-aware) + tsc + build
pnpm run fmt       # format
pnpm run lint      # syntax lint
```

- `src/host/` builds to `lib/index.js` (ESM; Harness packages stay external and resolve from the dsh installation at runtime through its peer-resolution interception).
- `src/client/` builds to `lib/client.js`, wrapped as a `window.__ModuleLoader__.load({ id, factory })` registration; React comes from the page's module table, never from this package.
- Lint enforces three style rules: exports at the bottom of the file (`import/exports-last`), braced statements (`curly`), and function-expression style (`func-style`).

Install from the harness with the bundle's directory as the install target, or with a released `.tgz` (see below).

## Releases

Every push to `main` is checked by CI and, on `main`, flows through an automated [release-please](https://github.com/googleapis/release-please) pipeline that versions, tags, and publishes the package to npm - no manual release steps.

## Icons

Toolbar and plugin icons are generated from [Lucide](https://lucide.dev) icon data (`sparkles`, `undo-2`, `loader-circle`) at build time. Lucide is licensed under the [ISC License](https://lucide.dev/license); the generated `icon.svg` and the in-app SVGs retain that provenance.

## License

MIT for this plugin's own code; bundled Lucide artwork is ISC (see above).
