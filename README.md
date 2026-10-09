# openspec-status

[![CI](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml/badge.svg)](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://claude.com/claude-code) mod that keeps the [OpenSpec](https://github.com/Fission-AI/OpenSpec) change you are working on, and how many of its tasks are ticked, in the status line under the prompt. It works with a local `openspec/` root and with a shared store declared by `store:` in `openspec/config.yaml`.

In any project, with OpenSpec or not, it also warns when the context window fills up, before auto-compaction summarizes the conversation for you.

![Claude Code with the status line on add-dark-mode at 3/7 tasks; after a task is ticked /openspec shows 4/7, and after a switch to the fix-login-redirect branch it shows that change at 4/4](demo/demo.gif)

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
3. Otherwise none, and there is no status line, unless a health finding is retained, the declared store cannot be used or the context fills up (see below).

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

## When the declared store cannot be used

When `openspec/config.yaml` declares a store with `store:` and the CLI cannot resolve it, every OpenSpec command in the project fails. The status line says so, without the store's name or the CLI's message (`/openspec` gives both):

| Cause | Status line |
|---|---|
| The store is not registered on this machine | `openspec  store not registered` |
| The `store:` line cannot be read | `openspec  store: line invalid` |
| Any other failure, such as a deleted or damaged clone, or mismatched store identity | `openspec  store unusable` |

The line goes away once the store resolves again. `doctor` is not run while the store cannot be used.

Only the project's own `store:` declaration counts. A stale global `defaultStore` (`openspec config set defaultStore`) is ignored: outside an OpenSpec project the mod shows nothing but the context warning.

## Context warning

After every main-conversation turn, Claude Code reports how full the context is, in percent of the model's window. The mod uses the two levels of [abtop](https://github.com/graykode/abtop): a warning from 75%, marked `!`, and a critical level from 90%, marked `⚠`.

Each time the fill reaches a higher level, a toast shows for 10 seconds:

```
Context 78% full. Write down what matters in an artifact, then start a fresh session or /clear.
```

With an active change, it names the way back, since `/clear` forgets the workflow's change:

```
Context 78% full. Capture where you are in add-dark-mode (/opsx:update add-dark-mode), then /clear and resume with /opsx:apply add-dark-mode.
```

While the fill stays at a level, the status line carries it, after the change and before any finding:

```
openspec  add-dark-mode  3/7 tasks · context 91%⚠
```

Outside an OpenSpec project, the line is `context 78%!, write down and /clear`. The segment goes away after `/clear`, or once a compaction brings the fill back below 75%; reaching a level again shows a new toast. The percentage is the model's window, as abtop reads it, so auto-compaction may run before the warning when its own window is smaller.

Both levels are settings of the plugin, in `/config`: `contextWarningPercent` (75) and `contextCriticalPercent` (90). `0` turns a level off. A change applies the next time the plugin is loaded.

## When it refreshes

At session start, right after `/clear`, after a change of working directory, at the end of every main-conversation turn, on `/openspec`, as soon as a workflow names another change, and after every Edit or Write of a `tasks.md` and every Bash command that mentions one, so the count follows `/opsx:apply` as it ticks tasks within a single turn.

Health is read at session start, right after `/clear`, after a change of working directory and on `/openspec`, but never at the end of a turn that stays in the same directory.

When Claude Code does not report a change of working directory, the mod notices it at the end of the turn: it then forgets the workflow's change and reads the health in the new directory.

The context fill comes from Claude Code's own measurement after every main-conversation turn.

## `/openspec`

Reads the changes again, updates the status line, and answers with a one-line summary:

| Context | Answer |
|---|---|
| Local root | `openspec: local, 30 active changes` |
| Declared store | `openspec: store:team-plans, 12 active changes` |
| Store declared but not registered on this machine | `openspec: unknown store, <the fix the CLI suggests>` |
| Store declared but unusable, or `store:` line invalid | `openspec: unusable store`, then `- <the CLI's message>` and `  Fix: <its fix>` |
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

`/openspec` is registered only once an OpenSpec root has been resolved, or the project declares a store that cannot be used. Claude Code cannot unregister a command, so after moving to a directory without OpenSpec in the same session it stays listed.

## What it never does

- In a project without OpenSpec, or without the `openspec` CLI, it shows nothing but the context warning: no OpenSpec line, no command. A stale global `defaultStore` does not change that.
- It never compacts, clears or ends the session: it only advises.
- It never writes to disk and never repairs anything. It runs only `openspec list --json`, `openspec doctor --json` and `git branch --show-current`, in the session's working directory. The context warning runs no command and makes no API call.
- It never calls the model.

## Development

```sh
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin test .
npx -p typescript@5 tsc -p .
```

The tests run against the engine's test kit with recorded `openspec list --json` and `openspec doctor --json` outputs in `hooks/fixtures/`; they need neither the CLI nor git. `tsc` reads the engine's declarations from `.claude-plugin/types/`, which Claude Code writes the first time a session loads the mod from this folder.

The demo is regenerated with [VHS](https://github.com/charmbracelet/vhs), from the repository root:

```sh
vhs demo/demo.tape
```

It records a session against a throwaway project and Claude Code home built by `demo/setup.sh`, with only local commands, so it makes no API call.

## Releasing

`.github/workflows/ci.yml` runs the checks above on every pull request and push to `main`, against the pinned Claude Code version.

To release, bump `version` in `.claude-plugin/plugin.json` and merge to `main`. `.github/workflows/release.yml` runs CI, creates the `openspec-status--v<version>` tag with `claude plugin tag`, and publishes the GitHub release.

## Roadmap

- A detail pane for the active change, with the state of each artifact (`openspec status --change <id> --json`).
- Filtering a shared store's changes by target repository (`affected_areas`).

## License

[MIT](LICENSE)
