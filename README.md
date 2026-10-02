# openspec-status

[![CI](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml/badge.svg)](https://github.com/pierreboissinot/openspec-status/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://claude.com/claude-code) mod that keeps the [OpenSpec](https://github.com/Fission-AI/OpenSpec) change you are working on, and how many of its tasks are ticked, in the status line under the prompt. It works with a local `openspec/` root and with a shared store declared by `store:` in `openspec/config.yaml`.

![Claude Code with the status line on add-dark-mode at 3/7 tasks; after a task is ticked /openspec shows 4/7, and after a switch to the fix-login-redirect branch it shows that change at 4/4](demo/demo.gif)

In the OpenSpec repository, after `/opsx:apply add-global-install-scope`:

```
openspec  add-global-install-scope  0/38 tasks
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
3. Otherwise none, and there is no status line.

Changing directory or `/clear` forgets the workflow's change. A change created during the turn (`openspec new change`) shows up once it is listed. A Bash call you refuse at the permission prompt names nothing.

## When it refreshes

At session start, after `/clear`, after a change of working directory, at the end of every main-conversation turn, on `/openspec`, and as soon as a workflow names another change.

## `/openspec`

Reads the changes again, updates the status line, and answers with a one-line summary:

| Context | Answer |
|---|---|
| Local root | `openspec: local, 30 active changes` |
| Declared store | `openspec: store:team-plans, 12 active changes` |
| Store declared but not registered on this machine | `openspec: unknown store, <the fix the CLI suggests>` |
| No root (after leaving an OpenSpec project) | `openspec: no OpenSpec root resolved from <cwd>` |

When the CLI call fails, the answer keeps the last known summary and ends with `(refresh failed: <error>)`.

`/openspec` is registered only once an OpenSpec root has been resolved. Claude Code cannot unregister a command, so after moving to a directory without OpenSpec in the same session it stays listed.

## What it never does

- In a project without OpenSpec, or without the `openspec` CLI, it shows nothing at all: no status line, no command.
- It never writes to disk. It runs only `openspec list --json` and `git branch --show-current`, in the session's working directory.
- It never calls the model.

## Development

```sh
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin test .
npx -p typescript@5 tsc -p .
```

The tests run against the engine's test kit with recorded `openspec list --json` outputs in `hooks/fixtures/`; they need neither the CLI nor git. `tsc` reads the engine's declarations from `.claude-plugin/types/`, which Claude Code writes the first time a session loads the mod from this folder.

The demo is regenerated with [VHS](https://github.com/charmbracelet/vhs), from the repository root:

```sh
vhs demo/demo.tape
```

It records a session against a throwaway project and Claude Code home built by `demo/setup.sh`, with only local commands, so it makes no API call.

## Releasing

`.github/workflows/ci.yml` runs the checks above on every pull request and push to `main`, against the pinned Claude Code version.

To release, bump `version` in `.claude-plugin/plugin.json` and merge to `main`. `.github/workflows/release.yml` runs CI, creates the `openspec-status--v<version>` tag with `claude plugin tag`, and publishes the GitHub release.

## Roadmap

- Store health from `openspec doctor --json` in the status line: a store checkout behind its upstream, an unregistered reference (change `add-doctor-warning`).
- A detail pane for the active change, with the state of each artifact (`openspec status --change <id> --json`).
- Filtering a shared store's changes by target repository (`affected_areas`).

## License

[MIT](LICENSE)
