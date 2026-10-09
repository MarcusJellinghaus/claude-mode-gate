# Spike: verify the remaining Claude Code API facts

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A mod is a plugin of function hooks that hot-reload in a session. A fixed **baseline** plus named **profiles** (rule lists `allow`, `ask`, `deny`) decide each call. The user switches profiles with `/gate-on` and `/gate-off`. **Subagents** get the baseline plus the profiles their parent assigns. **Headless runs** (`claude -p`) read starting profiles from `MODE_GATE_PROFILES`.

The design is agreed in `docs/design.md`. Most of the mods API has already been verified against Claude Code 2.1.292 and recorded in `docs/mods-api-notes.md` (the authority for the rows marked verified in the assumptions table). This spike is Draft 01 of 13 (plan: Draft 00) and covers only what is still unknown. It is much smaller than the original spike. Draft ids refer to the files in `docs/issues-draft/` (see `00-overview.md`); they become GitHub issue numbers at creation.

Constraints the findings must respect:

- `hooks/policy.ts` is pure (no `$`, no state, no imports). `hooks/register.ts` is thin wiring. State lives in `$.state` (per session), never `$.store`.
- Every gating hook has a `.catch` that fails closed (ask or deny, never allow).
- Minimum supported Claude Code version: 2.1.292.

## The open assumptions

`docs/design.md` ("Assumptions") is the source of truth for the table, with the Status and Evidence columns. The rows this spike works on, with the method for each:

| #   | Open question                                                                                                                                                            | Method                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 2   | Does `tool.check` still fire for a call that `tool.call` denied?                                                                                                         | `claude -p` probe                                          |
| 4   | Can the test kit raise `tool.check` by hand, and mock `$` and `next`?                                                                                                    | a `*.test.ts` run with `claude plugin test`                |
| 6   | Can a mod read the permission mode? (not needed in v1)                                                                                                                   | declarations                                               |
| 8   | Can settings files define environment variables?                                                                                                                         | docs                                                       |
| 9   | Where is an installed plugin stored? Is it under `~/.claude/plugins/`?                                                                                                   | docs; read-only `ls` or native Read of `~/.claude/plugins` |
| 10  | Which event gives a new subagent's agent id, does it carry the Agent call's `tool_use_id` or another link, and does it fire before the subagent's first gated call?      | `claude -p` probe (`agent.spawn`, `agent.offer`)           |
| 11  | Do hooks run for `bypassPermissions` agents?                                                                                                                             | `claude -p` probe with an agent file                       |
| 13  | Can a mod draw below the entry box?                                                                                                                                      | docs and declarations                                      |
| 16  | Do sibling imports work in the packaged plugin (as opposed to the documented one)?                                                                                       | a clean copy of the tracked files, `--plugin-dir`          |
| 18  | What is gated when a module fails to load?                                                                                                                               | `claude -p` probe with a broken module                     |
| 19  | Do `$.fs` and other `$` calls made inside a hook raise `tool.call` or `tool.check` again (re-entry)?                                                                     | `claude -p` probe                                          |
| 20  | Does `$.session.id()` return the new id after `/clear`? Does `session.start` fire after an in-process resume?                                                            | docs and declarations; interactive rows stay open          |
| 21  | Which engine forks and teammates carry an `agentId` and call tools?                                                                                                      | declarations; ids seen in the probe log                    |
| 22  | Does `$.env.get` return the real `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `MODE_GATE_*` on this platform?                                                               | `claude -p` probe on the owner's platform                  |
| 23  | Do `claude plugin validate` and `claude plugin test` run, and what do they need to authenticate (CI)?                                                                    | the commands themselves; `--help`                          |
| 24  | Does `$.state` offer a finer-grained or atomic update than replacing the whole `gate` value?                                                                             | declarations (`PluginState`, `$.state`)                    |
| 25  | Do the Read, Edit and Write tools expand `~` in `file_path`? (Permission rules do; the tool input is undocumented.)                                                      | docs; `claude -p` probe with a throwaway `~/` file         |
| 26  | Do the mcp-workspace tools resolve relative paths against `MCP_CODER_PROJECT_DIR`? Is there a session-root API (`$.session.root()`) that differs from `$.session.cwd()`? | declarations; `claude -p` probe from a subfolder           |
| 27  | Does `$.fs.stat(path, { resolve: true }).realPath` return the long name for a Windows 8.3 short-name path?                                                               | `claude -p` probe on Windows (`CLAUDE~1`-style path)       |

Rows 3 and 15 are not needed in v1. Row 14 stays `partly verified` (only `argumentHint` exists); its fallback is already in the design. Rows 1, 5, 7, 12 and 17 are verified in `docs/mods-api-notes.md`; this spike does not repeat them.

A **Bash-only session** is a session whose only way to run Claude Code is `claude -p` from Bash. It has no interactive terminal (TTY). Rows that need an interactive terminal (row 20 after `/clear`, row 13 drawing) cannot be observed there: read them from the docs and declarations, end them `documented` or `open` with the fallback, and let the owner check them interactively later. Do not block on them.

## Authentication and safety (decided up front)

The spike uses the **owner's existing Claude Code login** and a **throwaway project directory** (the session scratchpad directory if the session's instructions list one, otherwise an OS temp directory), outside the repo. It does not set up an isolated `CLAUDE_CONFIG_DIR`. The probe mod is loaded for one process with `claude --plugin-dir <probe folder>` (or `CLAUDE_CODE_PLUGIN_DIRS`) and is never installed with `/plugin install`, so the owner's config stays untouched. Run bare `claude`, not `claude.bat`. Choose the permission flags for `claude -p` probes from `claude --help`, so the probe's tool calls do not stall on prompts. **The probes for rows 2, 4, 10, 18, 19, 22, 25 and 26 must not use a bypass permission mode**: bypass could record "no event" as an API fact. Pre-allow the probe's tools with `--allowedTools` or a settings.json in the throwaway project, or accept the ask and stop. Only the row 11 probe uses bypass, through the agent file's `permissionMode`. If the main session itself ran in bypass mode, record the evidence with that caveat. Stop and ask only if the CLI needs more than this (for example an API key, or a login prompt that `-p` cannot answer). Do not set an API key on your own.

## Existing code

- `types/index.d.ts`: only a comment and `export {}`. `hooks/register.ts`: wiring stub. `hooks/policy.ts`: only `export type Verdict = "allow" | "ask" | "deny"`. `hooks/hooks.json`: `{}`.
- `scripts/check-manifests.mjs`, `.claude-plugin/plugin.json` and `tests/repo-structure.test.ts`: manifest checks and the structure test that must keep passing.
- `scripts/check-gating-catch.mjs` is **not** part of this spike. Draft 12 owns its fix (its pattern `$.on(` matches zero registrations of the real `on(event, matcher, hook)` shape).
- `CLAUDE.md`: commands, testing strategy, principles. `docs/design.md`: the design and the assumptions table. `docs/mods-api-notes.md`: the verified API facts.

## Goal

Close the open rows of the assumptions table with evidence, settle the manifest shape and how `typecheck` gets the engine's types, and record every design change the findings force.

## Scope

- Probe the rows in the table above, one probe per row where a method says `claude -p`. Each probe is throw-away and logs its event payloads to a file outside git. Details to observe:
  - Row 2: run a main-session call, a subagent call, and a call that a `tool.call` deny should block; note whether `tool.check` fires for the denied call.
  - Row 10: launch a subagent with the Agent tool; record which events fire, which carries the new agent id, whether any of them carries the Agent call's `tool_use_id`, and whether that event fires before the subagent's first `tool.call` or `tool.check` (log a timestamp or sequence number per event). Record the event name, matcher and result shape, which Draft 06's binding hook uses.
  - Row 11: define an agent file with `permissionMode: bypassPermissions` in the throwaway project and see whether `tool.call` and `tool.check` fire for its calls.
  - Row 18: break the module (a syntax error, then an `import()`), start a session, run a Bash call, and note what is gated and where the failure is reported (transcript line, `claude --debug`, stderr under `-p`).
  - Row 19: from inside a `tool.check` hook, call `$.fs.stat`, `$.fs.read` and `$.fs.write` (a new file, and a 5 MiB text to see the 4 MiB cap reject); note whether `tool.call` or `tool.check` fire beneath the hook, what `next.error.kind` shows in a `.catch`, and whether calling `next(e)` again inside a `.catch` returns the memoised verdict.
  - Row 22: read the five environment names (`MODE_GATE_PROFILES`, `MODE_GATE_CONFIG`, `XDG_CONFIG_HOME`, `HOME`, `USERPROFILE`) through `$.env.get` with literal names, and see what `claude plugin validate` lists.
  - Row 4: write a small `*.test.ts` with `claude-code/testing` that raises `tool.check` and run `claude plugin test`; note whether the kit mocks `$.state`, `$.fs` and `next`, and whether it can show which hooks the module registered.
  - Row 16: copy only the git-tracked files of a two-file probe into a clean folder (the layout a marketplace install would give) and load it with `--plugin-dir`; a real `/plugin install` stays an interactive check for the owner after the first push.
  - Row 23: run `claude plugin validate` and `claude plugin test` on the probe and note output, exit codes and any login need; read `--help`.
  - Row 24: read the `$.state` declarations for an update that touches one field or compares and sets atomically (a callback or a version check). If none exists, Draft 04's re-read-then-set rule stays.
  - Row 25: have `Read` (or `Write` to a harmless throwaway file) take `~/<probe file>` in `file_path` and see whether it resolves to the home folder or fails; same for `Edit`.
  - Row 26: start a `claude -p` run in a subfolder of a throwaway project with an mcp-workspace-like server (or the owner's) rooted at the project, pass a relative path to a file tool and note which folder it resolves against; read the declarations for `$.session.root()` and note whether it differs from `$.session.cwd()` there.
  - Row 27: on Windows, `$.fs.stat` a path with an 8.3 segment (find one with `dir /x` in the throwaway directory, or create `longdirectoryname` and use its short name) with `{ resolve: true }` and note whether `realPath` shows the long name.
- Settle the manifest shape: `hooks/hooks.json` is `{ "modules": ["./register.ts"] }` (one path, relative to that file), `.claude-plugin/plugin.json` and `scripts/check-manifests.mjs` match it, and `tests/repo-structure.test.ts` still passes. A stub `register` typed `Register` replaces the empty stub.
- Settle how `npm run typecheck` gets the engine's API types (`claude-code`). The engine lays them in `<mod>/.claude-plugin/types/claude-code/` with a `tsconfig.json` the mod extends, once it has loaded the mod. Find a way that works without an interactive session, locally and in CI (for example `claude plugin validate`, or a `-p` run), decide whether those generated files are gitignored (the default; they are large and Claude Code's own), and note the `tsconfig.json`, `.gitignore` and CI change needed. Claude Code's declaration file is never copied into the repo. The mod's own `types/index.d.ts` (`PluginState`) is Draft 04.
- Record the Claude Code version tested and the minimum supported version, 2.1.292, in `docs/design.md`.
- Read the built-in sec-default source if it is readable and note its fail-closed patterns. Its location is unknown. If the source is not readable, record that and rely on the docs.
- Update `docs/design.md`: set each worked row's Status and Evidence (a declaration line, a doc section, or for a runtime-verified row a short quoted excerpt with the date and Claude Code version, secrets redacted), add the "Updated" date, change any section the findings affect, and run `npm run format` after editing tables there.

## Out of scope / later

Building any production feature. The probe mod is throw-away. Fixing `scripts/check-gating-catch.mjs` (Draft 12). Rows 3, 14 and 15. A real `/plugin install` check.

## If an assumption fails

Any `failed` or `partly verified` row gets a fallback written into `docs/design.md`, with an impact note for each affected draft. Known impacts to start from:

- Row 2: if `tool.check` does not fire for a call `tool.call` denied, nothing changes except the log dedupe (Draft 07), which then never sees a double entry.
- Row 4: the test kit cannot raise `tool.check`, or cannot mock `$.state`, `$.fs` or `next`. Wiring tests need the kit because `no-import-of-register` forbids importing `register.ts`, tests included. Fallback: Draft 12 adds a named test-only exception to `no-import-of-register`, limited to `tests/wiring/**`, together with the config change; write it into `docs/design.md` (Testing). If the kit works but cannot list registrations, Draft 07's single-`session.start` test reads `claude plugin validate` output instead.
- Row 10: no event gives the new agent's id together with a link to the Agent call, or the event does not reliably fire before the subagent's first gated call: no assignment can be tied to an agent (matching by arrival order is not allowed), so subagents get the baseline only (Draft 06). Write that fallback into `docs/design.md` and say what is dropped.
- Row 24: no finer-grained `$.state` update: nothing changes, Draft 04's re-read-then-set rule stays.
- Row 25: the file tools do not expand `~`, or it is unknown: nothing changes; the path guard keeps treating `~` as expanded (safe over-matching).
- Row 26: no session-root API, or it equals `$.session.cwd()`: the path guard checks relative paths against `$.session.cwd()` only; record the known gap for Drafts 05 and 13.
- Row 27: `realPath` keeps 8.3 names: the path guard's `~digit` segment ask stays, and the residual risk stays in the known gaps (Drafts 05 and 13).
- Row 11: `bypassPermissions` agents skip the mod and cannot be gated, so **stop and ask**. Draft 10 stops and asks at once too and must not leave the three agents running ungated.
- Row 16: sibling imports fail in the packaged plugin. The hooks cannot be split into modules, so the build must bundle `hooks/*.ts` into the single entry file (a build step, which changes the repo layout and CI). **Stop and ask** the owner before Draft 02 starts.
- Row 18: if a module that fails to load leaves the session ungated (expected), the design already says so (Security model, Failure). Propose a launcher check as an open item; do not build it here.
- Row 19: the API notes (claim 8) advise denying on re-entry; this design passes it through, because the nested event is the mod's own `$` call and denying would block the mod's own reads and writes (design.md, Failure). If `$` calls re-enter the hooks, Draft 12's `.catch` passes re-entry through with `next(e)` (in the `tool.call` handler also when `next.called` is true, the notes' sample), and Draft 05's `$.fs.stat` and Draft 07's `$.fs.write` need no special case. If they do not re-enter, the re-entry branch is a no-op kept for safety. If re-entry makes the mod's own `$.fs.write` to the protected log folder get denied by its own guard, write the fix into `docs/design.md` and stop and ask.
- Row 22: if `HOME` and `USERPROFILE` are both unavailable on the owner's platform, stop and ask (Draft 02 fails closed without a home folder).
- Row 23: if the plugin commands need a login or key in CI, Draft 10 stops and asks (no secret is added to pull-request runs).

## Acceptance criteria

- [ ] Every row of the table above has its Status and Evidence cells updated in `docs/design.md`. Status is one of `verified` (observed at runtime, or stated explicitly in the declarations), `documented` (only the docs say so), `partly verified`, `failed` or `open`. `open` is allowed only for a row that needs an interactive terminal, that no source states, or (row 9) whose read was declined; its Evidence cell gives the reason and the row states its fallback or why none is needed.
- [ ] Every Evidence cell cites its source: a declaration line, a doc section, or for a runtime-verified row a short quoted excerpt with the date and Claude Code version, secrets redacted. Probe logs are never committed, so the excerpt in `docs/design.md` is the evidence.
- [ ] Every `failed` or `partly verified` row has a fallback and an impact note for the affected drafts in `docs/design.md`. If a row on the "stop and ask" list failed, the owner was told first and no fallback was drafted before that.
- [ ] `docs/design.md` records the Claude Code version tested and the minimum supported version, 2.1.292, and refreshes the "Updated" date line; `npm run format` and `npm run check:docs` still pass.
- [ ] `docs/design.md` records how a mod is loaded for a probe (`--plugin-dir`), how to run `claude -p` with it, and how a subagent and a `bypassPermissions` agent were launched.
- [ ] `hooks/hooks.json` is `{ "modules": ["./register.ts"] }`, `.claude-plugin/plugin.json` and `scripts/check-manifests.mjs` match the real shape, and `tests/repo-structure.test.ts` passes.
- [ ] `docs/design.md` (or the PR) states how `npm run typecheck` gets the engine's types locally and in CI, and `npm run check` passes with the change, without new lint, knip or tsconfig exceptions unless one is recorded next to it with the reason.
- [ ] `docs/design.md` summarises the sec-default fail-closed patterns, or states that its source is not readable.
- [ ] No probe code, probe file or log is committed. Nothing probe-related remains in `hooks/`.
- [ ] The spike branches from `main`, so it starts after PR #1 (the initial repo setup) is merged. The work ends with a PR to `main`, and `npm run check` passes.

## How to start

1. Run `claude --version`. It must be 2.1.292 or newer. If mods are unavailable, stop and ask.
2. Read `docs/mods-api-notes.md` and the `plugin-authoring` skill (it points to the current types file and examples).
3. Check that PR #1 is merged. Run `git fetch` and `git pull --ff-only` on `main`, then create the branch `spike/verify-api` from it (not from `feature/initial-repo-setup`).
4. Create the probe in the throwaway directory, not in `hooks/`. The mcp-workspace write tools reach only the project directory, so use the native Write tool for probe files and Bash to run them, in that directory only (the exception in Working rules). Load the probe as described under Authentication and safety.
5. Work through the table, row by row, one probe each. Keep the logs outside git.
6. Fill in the rows in `docs/design.md`, citing the evidence. Redact secrets from every excerpt.

## Working rules

TDD where code exists, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work. Bash is allowed only for:

- `npm run ...`;
- `git add`, `git commit`, `git push` and `git checkout -b`;
- `git fetch` and `git pull --ff-only` on `main`, to start from an up-to-date `main`;
- running Claude Code itself (`claude --version`, `claude`, `claude -p`, `claude plugin validate`, `claude plugin test`, launching subagents) and the probe;
- for row 9 only, a read-only `ls` or native Read of `~/.claude/plugins` (no write, no other folder under `~/.claude`). If the permission prompt for it is declined, end row 9 as `open` with that reason.

Exception, because no MCP tool exists for it: the native Write tool and Bash may create and run probe files in the throwaway directory outside the repo, and only there.

**Stop and ask** (used throughout this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked. If the branch exists, leave the work uncommitted on it; if no branch exists yet, just report.

Commit and push to the `spike/verify-api` branch after each major change, and run `npm run check` first. Keep probe files and logs out of git.

## Depends on

None (starts after PR #1 is merged to `main`). It runs in parallel with Draft 03.

## Open questions

- The location of the sec-default source is unknown.

## References

- [Assumptions](../design.md#assumptions)
- [Events](../design.md#events)
- [Failure](../design.md#failure)
- [Work plan](../design.md#work-plan)
- [Prior art](../design.md#prior-art)
- [API notes](../mods-api-notes.md)
