# @saoutax/dsh-prompt-polish · Prompt Polish

English | [简体中文](README.zh.md)

A DeepSeek Harness plugin that uses AI to polish the prompt in the composer.

A compact button sits in the composer toolbar next to the model selector. Clicking it rewrites the current draft in place. For 8 seconds after the rewrite, the button becomes an undo control.

## Installation

The package is published on npm. The easiest way to install it is the DSH CLI:

```sh
dsh plugin --profile web add @saoutax/dsh-prompt-polish
```

You can also install from a released `.tgz` (see Releases below) or a local directory. These options are useful for offline installs and development.

## Features

- **In-place rewrite**: The draft is replaced with the polished text. Nothing is submitted to the Session, so no chat message is added.
- **Undo**: The draft from before polishing is kept for 8 seconds. Clicking the button again restores it.
- **Reference chips are preserved**: `@file` and `@session` chips are re-anchored in the rewritten text. Chips that the rewrite no longer mentions are appended to the end rather than dropped.
- **Command drafts can be polished too**: A draft that starts with a claimed command chip (plan mode's `/plan`, a selected slash command) is polished like any other draft. Only the prose after the token is rewritten, and the claim is kept unchanged. A `/plan` chip with no task text after it has nothing to polish, so the button stays hidden until you type the task.
- **Model selection**: Set `provider` and `model` on the plugin row, or leave them empty to use the Session's own route, including its reasoning effort. If the Session provides no route, the plugin falls back to the deployment's default model.
- **Keyboard shortcut**: Use `Ctrl+Shift+.` on Windows or Linux, and `Cmd+Shift+.` on macOS, to run the focused conversation's button action.
- **Sessions from history**: A Session opened from history can be polished directly. The plugin resumes that Session first, so you do not need to send a message before the first polish.
- **Temporary error messages**: Failures appear in a temporary notification from the plugin. The notification closes automatically and does not appear again after you switch sessions.

## Configuration

| Field             | Default                     | Meaning                                                    |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| `provider`        | `""`                        | Provider route for the rewrite. Empty follows the Session. |
| `model`           | `""`                        | Model ID for the rewrite. Empty follows the Session.       |
| `instructions`    | empty → `prompts/polish.md` | System instruction that defines what "polish" means.       |
| `maxInputChars`   | `8000`                      | Longest draft a single rewrite accepts.                    |
| `maxOutputTokens` | `2000`                      | Maximum output tokens requested from the model.            |
| `temperature`     | `0.3`                       | Sampling temperature.                                      |

The default instruction exists only in `prompts/polish.md`. The build copies that file into the package, and the Host reads it when the plugin activates. The plugin does not include a compiled copy, so this file is the only definition of the default instruction. If the file is missing or empty, the plugin refuses to activate and reports an explicit error instead of running without its rules. Set `instructions` to override the default instruction for a plugin row.

## Development

```sh
pnpm install
pnpm run build     # build both halves and refresh icon.svg
pnpm run check     # oxfmt + type-aware oxlint + tsc + build
pnpm run fmt       # format
pnpm run lint      # syntax lint
```

- `src/host/` builds to `lib/index.js` (ESM). Harness packages are not bundled. At runtime, they are resolved from the dsh installation.
- `src/client/` builds to `lib/client.js` and is wrapped as a `window.__ModuleLoader__.load({ id, factory })` registration. React and ReactDOM come from the page's module table and are not bundled into this package.

To install from the Harness, use the bundle's directory as the install target, or use a released `.tgz` (see below).

## Releases

Every push to `main` runs the CI checks. On `main`, the automated [release-please](https://github.com/googleapis/release-please) pipeline versions, tags, and publishes the package to npm. No manual release steps are needed.

## Icons

Toolbar and plugin icons are generated at build time from [Lucide](https://lucide.dev) icon data (`sparkles`, `undo-2`, `loader-circle`). Lucide is licensed under the [ISC License](https://lucide.dev/license). The generated `icon.svg` and the in-app SVGs retain that attribution.

## License

The plugin's own code is MIT. The bundled Lucide artwork is ISC (see above).
