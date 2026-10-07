# openspec-status

[![CI](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml/badge.svg)](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://claude.com/claude-code) mod that keeps the [OpenSpec](https://github.com/Fission-AI/OpenSpec) change you are working on, and how many of its tasks are ticked, in the status line under the prompt, and opens a pane with every change, the specs and the active change's artifacts and tasks on `/openspec view`. It works with a local `openspec/` root and with a shared store declared by `store:` in `openspec/config.yaml`.

![Claude Code with the status line on add-dark-mode at 3/7 tasks; after a task is ticked /openspec shows 4/7. /openspec view then opens the OpenSpec pane: Overview lists 2 specs, 5 requirements and both changes with their progress bars, and the Change tab shows add-dark-mode's artifacts and its seven tasks, four of them ticked](demo/demo.gif)

In the OpenSpec repository, after `/opsx:apply add-global-install-scope`:

```
openspec  add-global-install-scope  0/38 tasks
```

In a store whose checkout is three commits behind its upstream:

```
openspec  add-global-install-scope  0/38 tasks · store 3 commits behind
```

Claude Code draws the `⚠ openspec-status:` prefix in front of every plugin's status line; it does not mean something is wrong.

## Install

The repository is its own plugin marketplace:

```sh
claude plugin marketplace add pierreboissinot/openspec-status
claude plugin install openspec-status@openspec-status
```

`claude plugin marketplace update openspec-status` picks up new releases.

To run it from a clone instead:

```sh
git clone https://github.com/pierreboissinot/openspec-status.git ~/src/openspec-status
claude --plugin-dir ~/src/openspec-status
```

Where no flag can be given (the desktop app, an SDK host), set `CLAUDE_CODE_PLUGIN_DIRS` to the same path, in the environment or in the `env` block of `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/src/openspec-status" } }
```

### Requirements

- OpenSpec CLI 1.14 or newer on the `PATH`.
- `git`, for the current branch.
- Claude Code with function-hook mods. Verified on Claude Code 2.1.287. The mods API is in early access and may change between releases; run `claude plugin validate .claude-plugin/plugin.json` from the plugin folder after an update.

## Which change is active

1. The last change an OpenSpec workflow named in this session:
   - in a command Claude runs through the `openspec` CLI, as every `/opsx` workflow does: `--change <name>`, `new change <name>`, or an argument that is the name of a change (`openspec validate <name>`). Launchers such as `npx`, `pnpm` or `env` in front, and a versioned package (`npx @fission-ai/openspec@latest`), are recognized; `openspec` quoted inside another command's argument is not;
   - the first argument of an `/opsx:*` command, when it is the name of a change.
2. Otherwise, the change named like the current git branch.
3. Otherwise none, and there is no status line, unless a health finding is retained (see below).

Changing directory or `/clear` forgets the workflow's change. A change created during the turn (`openspec new change`) shows up once it is listed. A Bash call you refuse at the permission prompt names nothing.

## Health

The mod reads `openspec doctor --json` and keeps its errors and warnings, plus a store checkout behind its upstream tracking branch. It ignores the other notes, such as a store remote that differs from the checkout's origin or a referenced store whose spec index was truncated. The most important finding goes at the end of the status line, in a few words, followed by `+N` when there are others:

```
openspec  add-dark-mode  3/7 tasks · team-plans not registered +1
```

Without an active change, a finding still shows, on its own:

```
openspec  store 3 commits behind
```

How far behind the store is comes from its local upstream tracking branch, as of its last `git fetch`. The finding appears a moment after the change: the session does not wait for `doctor`. If `doctor` fails, the status line stays as it would be without it, and the reason goes to the debug log only.

## When it refreshes

At session start, after `/clear`, after a change of working directory, at the end of every main-conversation turn, on `/openspec`, and as soon as a workflow names another change.

Health is read at session start, after `/clear`, after a change of working directory and on `/openspec`, but never at the end of a turn.

## `/openspec`

Reads the changes again, updates the status line, and answers with a one-line summary:

| Context | Answer |
|---|---|
| Local root | `openspec: local, 30 active changes` |
| Declared store | `openspec: store:team-plans, 12 active changes` |
| Store declared but not registered on this machine | `openspec: unknown store, <the fix the CLI suggests>` |
| No root (after leaving an OpenSpec project) | `openspec: no OpenSpec root resolved from <cwd>` |

When the CLI call fails, the answer keeps the last known summary and ends with `(refresh failed: <error>)`.

`/openspec` also reads the health again. Under the summary it lists every finding, most important first, with the full message from `openspec doctor` and, when it suggests one, its fix:

```
openspec: store:demo-plans, 30 active changes
- Referenced store 'team-plans' is not registered on this machine.
  Fix: git clone -- git@github.com:dev/team-plans.git '/home/dev/openspec/team-plans' && openspec store register '/home/dev/openspec/team-plans' --id team-plans
- This store checkout is 3 commits behind its upstream tracking branch; teammates on newer commits may resolve different specs.
```

When `openspec doctor --json` fails, the summary ends with `(doctor failed: <reason>)` and no finding is listed.

`/openspec` is registered only once an OpenSpec root has been resolved. Claude Code cannot unregister a command, so after moving to a directory without OpenSpec in the same session it stays listed.

## `/openspec view`

Reads everything `/openspec` reads, then opens the `OpenSpec` pane instead of answering in the transcript. In a wide fullscreen terminal the pane sits beside the transcript; otherwise it sits above the prompt. It does not take the keyboard when it opens: Ctrl+X then Tab gives it the keyboard, and Esc closes it.

- **1: Overview**: the root (`local` or `store:<id>`), how many specs and requirements it holds, then one row per active change with its ticked tasks and, when the pane is wide enough, a progress bar. `●` marks the active change. The health findings follow, with their full message and fix.
- **2: Change**: the active change, or the one picked in Overview, with its schema, the state of each artifact, and its tasks, ticked or not, one line each. Nothing can be ticked from the pane.

Picking a change in Overview shows it in the Change tab; the active change and the status line stay as they are. The pick is forgotten when the pane closes or the working directory changes.

With a declared store that is not registered, the pane shows the fix the CLI suggests. After leaving for a directory without OpenSpec, it says no root is resolved, and `/openspec view` answers like `/openspec` without opening the pane. A read that fails shows `unavailable: <reason>` in its section, and the reason goes to the debug log.

While the pane is open, it is read again whenever the status line is, and the Change tab as soon as the change it shows is another one. Health keeps its own rule. While the pane is closed, the mod runs nothing more than without it.

## What it never does

- In a project without OpenSpec, or without the `openspec` CLI, it shows nothing at all: no status line, no command.
- It never writes to disk and never repairs anything. It runs only `openspec list --json`, `openspec doctor --json` and `git branch --show-current`, in the session's working directory; and, while the `/openspec view` pane is open, `openspec list --specs --json`, `openspec status --change <name> --json` and `openspec instructions apply --change <name> --json`, for the one change the pane shows.
- It never opens the pane on its own.
- It never calls the model.

## Development

```sh
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin test .
npx -p typescript@5 tsc -p .
```

The tests run against the engine's test kit with recorded `openspec list --json`, `openspec doctor --json`, `openspec list --specs --json`, `openspec status --json` and `openspec instructions apply --json` outputs in `hooks/fixtures/`; they need neither the CLI nor git. `tsc` reads the engine's declarations from `.claude-plugin/types/`, which Claude Code writes the first time a session loads the mod from this folder.

The demo is regenerated with [VHS](https://github.com/charmbracelet/vhs), from the repository root:

```sh
vhs demo/demo.tape
```

It records a session against a throwaway project and Claude Code home built by `demo/setup.sh`, with only local commands, so it makes no API call.

## Releasing

`.github/workflows/ci.yml` runs the checks above on every pull request and push to `main`, against the pinned Claude Code version.

To release, bump `version` in `.claude-plugin/plugin.json` and merge to `main`. `.github/workflows/release.yml` runs CI, creates the `openspec-status--v<version>` tag with `claude plugin tag`, and publishes the GitHub release.

## Roadmap

- Filtering a shared store's changes by target repository (`affected_areas`).

## License

[MIT](LICENSE)
