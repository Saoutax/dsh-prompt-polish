# @saoutax/dsh-prompt-polish · Prompt Polish

English | [简体中文](README.zh.md)

A DeepSeek Harness plugin that polishes the composer prompt with AI.

A compact button sits in the composer toolbar beside the model selector. Click it
and the current draft is rewritten in place; the button turns into an undo
control for 8 seconds.

## Installation

The package is published on npm; the simplest path is the DSH CLI:

```sh
dsh plugin --profile web add @saoutax/dsh-prompt-polish
```

A released `.tgz` (see Releases below) or a local directory also work as the
install target, for offline installs or development.

## Features

- **In-place rewrite** - the draft is replaced with the polished text; nothing is
  submitted to the Session, so no chat row is produced.
- **One undo** - the pre-polish draft is kept for 8 seconds; clicking the button
  again restores it.
- **Reference chips survive** - `@file` / `@session` chips are re-anchored into
  the rewritten text; chips the rewrite no longer mentions are appended instead
  of dropped.
- **Command drafts polish too** - a draft that opens with a claimed command chip
  (plan mode's `/plan`, a picked slash command) is polished like any other: only
  the prose after the token is rewritten, and the claim is carried through
  untouched. A `/plan` chip with no task text after it has nothing to polish, so
  the button stays hidden until you type the task.
- **Model choice** - configure `provider` / `model` on the plugin row, or leave
  them empty to use the Session's own route, including its reasoning effort
  (falling back to the deployment default model).
- **Shortcut** - `Ctrl+Shift+.` on Windows/Linux, `Cmd+Shift+.` on macOS, runs
  the focused conversation's button action.

## Configuration

| Field             | Default                     | Meaning                                                    |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| `provider`        | `""`                        | Provider route for the rewrite; empty follows the Session. |
| `model`           | `""`                        | Model id for the rewrite; empty follows the Session.       |
| `instructions`    | empty → `prompts/polish.md` | System instruction defining what "polish" means.           |
| `maxInputChars`   | `8000`                      | Longest draft a single rewrite accepts.                    |
| `maxOutputTokens` | `2000`                      | Output tokens requested from the model.                    |
| `temperature`     | `0.3`                       | Sampling temperature.                                      |

The default instruction lives only in `prompts/polish.md`; the build copies that
file into the package, and the Host reads it at activation. There is no
compiled-in copy to drift from it, so a package whose instruction file is missing
or empty refuses to activate with an explicit error instead of silently running
without its rules. Set `instructions` to override the file per plugin row.

## Development

```sh
pnpm install
pnpm run build     # bundle both halves + refresh icon.svg
pnpm run check     # oxfmt + oxlint (type-aware) + tsc + build
pnpm run fmt       # format
pnpm run lint      # syntax lint
```

- `src/host/` builds to `lib/index.js` (ESM; Harness packages stay external and
  resolve from the dsh installation at runtime through its peer-resolution
  interception).
- `src/client/` builds to `lib/client.js`, wrapped as a
  `window.__ModuleLoader__.load({ id, factory })` registration; React comes from
  the page's module table, never from this package.

Install from the harness with the bundle's directory as the install target, or
with a released `.tgz` (see below).

## Releases

Two GitHub Actions workflows live in `.github/workflows/`.

`ci.yml` verifies every pull request and every push to `main`: it installs from
the committed lockfile with `--frozen-lockfile` and runs `pnpm run check`
(oxfmt, oxlint type-aware, both `tsc` projects, esbuild bundle). It never
publishes or writes anything.

`release.yml` runs on pushes to `main` and has two jobs:

1. **version and tag** - [release-please](https://github.com/googleapis/release-please)
   keeps one open release PR that accumulates the conventional commits merged
   since the last tag and proposes the next version plus a `CHANGELOG.md` entry.
   Merging that PR creates the `vX.Y.Z` tag and the GitHub Release.
2. **build and attach the plugin package** - only when a release was just
   created. It checks out the released tag, rebuilds the bundle (`lib/` is
   generated and git-ignored, so the checkout has none), runs `pnpm pack`, and
   uploads the resulting `.tgz` to the Release. That tarball is the portable
   install target for a DSH bundle; point the harness's plugin manager at it.

Versioning starts at `0.1.0`: `initial-version` in `release-please-config.json`
pins the first cut, because with no earlier tag release-please would otherwise
bootstrap at `1.0.0`. `.release-please-manifest.json` stays at `0.0.0` until that
first release; release-please treats the sentinel as "nothing released yet" and
uses `initial-version` instead. Afterwards, `feat` bumps the minor and `fix` the
patch while the major is still `0` (`bump-minor-pre-major`).

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
for release-please to see them; `ci`, `chore`, and `test` are hidden from the
changelog.

The workflows use the default `GITHUB_TOKEN`, so no secret is required. A pull
request opened with that token does not trigger other workflows, though, so the
release PR shows no CI run. Add a `RELEASE_PLEASE_TOKEN` repository secret (a
personal access token) to have the workflow use it instead and get CI on the
release PR as well.

## Icons

Toolbar and plugin icons are generated from [Lucide](https://lucide.dev) icon
data (`sparkles`, `undo-2`, `loader-circle`) at build time. Lucide is licensed
under the [ISC License](https://lucide.dev/license); the generated `icon.svg` and
the in-app SVGs retain that provenance.

## License

MIT for this plugin's own code; bundled Lucide artwork is ISC (see above).
