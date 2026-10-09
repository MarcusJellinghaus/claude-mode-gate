# claude-mode-gate: plan and overview

## Goal

Build claude-mode-gate v1: a Claude Code mod that limits what Claude may do, through a fixed baseline plus profiles the user switches on and off. This issue is the tracking list. Each child issue repeats the context it needs, so it can be read alone.

Draft ids (Draft 01 and so on) become GitHub issue numbers when the issues are created. Until then, issues refer to each other by draft id.

## Problem and idea

Claude Code either asks too often or allows too much, and Bash is the weak spot: a prefix rule such as `Bash(gh issue edit *)` can be fooled by `gh issue edit 1 && rm -rf .`.

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod. A mod is a plugin of TypeScript function hooks that hot-reload in a session. It gates Claude's tool calls only. It is not a sandbox, and it runs with the user's permissions. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, and the user switches them on and off. Everything else still asks.

Subagents get the baseline plus the profiles their parent assigns. Headless runs (`claude -p`) read starting profiles from an environment variable. There, an ask that comes from the mod's own policy becomes a deny.

## Glossary and decisions

- **Baseline.** Always-on rules. Reads: the mcp-workspace read tools (files, directories, search, reference projects, read-only `git`, GitHub reads, `check_*`). Writes: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`, with protected paths still denied. Checks: the exact scripts `npm run check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:*` and `audit`. `npm ci` and `npm install` ask, because they run install scripts. Other tools: Skill, Agent, web fetch and web search. Ask: edits to `package.json`, `scripts/` and tool configs, because the allowed scripts execute them. Deny: protected paths. Git writes (`add`, `commit`, `push`, `checkout -b`) are not in the baseline.
- **Profile.** A named bundle with a description and three lists, `allow`, `ask`, `deny`, in the shape of the `permissions` block of `settings.json`. A profile with only `deny` entries is a restriction. A profile may be marked non-delegable.
- **Active set.** Baseline plus the profiles switched on.
- **Rule syntax.** Claude Code's: `mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`. Version 1 matches MCP tools by whole-tool name and Bash by prefix rules. Matching MCP tools by argument comes later, with parameterised profiles.
- **Bash matching.** Allow rules match strictly: exact or prefix, and never when the command contains any of `& ; | $ ( ) \` < >` or a newline, so anything unusual asks. Deny and ask rules use a boundary-checked substring match, so they fire even when metacharacters are present (`deny Bash(git push *)`fires on`x; git push`).
- **Config.** The user file is `$XDG_CONFIG_HOME/mode-gate/config.json` (fallback `~/.config/mode-gate/config.json`; `MODE_GATE_CONFIG` overrides the path). Keys: `$schema`, `logDir`, `profiles`. A project `.mode-gate.json` holds proposals only; its profiles are never active.
- **Decision order.** The first match wins: (1) a subagent calls Bash and no active allow rule matches this call: deny with the redirect message; (2) Edit or Write on a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) a call matching nothing keeps Claude Code's own verdict. A deny from Claude Code is never overridden. An allow from Claude Code is downgraded to ask for Bash unless an active rule allows the call.
- **Commands.** `/gate-on <profile>...`, `/gate-off <profile>...` (`all` switches every profile off), `/gate-status`, `/gate-why [n]` (last n verdicts with rule and profile), `/gate-check` (validate config), `/gate-explain <tool> …` (dry run). `/gate-status` shows the baseline summary, active profiles and the config path. Draft 04 registers all but `/gate-why` (Draft 07) and `/gate-explain` (Draft 08). Replay is an offline command-line tool over a session transcript (`npm run replay`, Draft 08). Only the user switches profiles; the mod registers no tool Claude could call to switch.
- **Lifetimes.** A profile the user switches on lasts the session. A profile a skill declares lasts until the next prompt (later feature). Profiles are cleared on `/clear` and never restored on resume (profiles from an earlier session do not come back). The band shows profile names.
- **Subagents.** A subagent gets the baseline plus the profiles its parent assigns at spawn, named on the first line of the Agent call prompt: `mode-gate-profiles: a, b`. The parent can assign only profiles it holds. The main session's deny and ask lists are inherited by every subagent; allow lists are not, so assigned profiles add allows. A denial names the profile needed; the subagent stops and reports; non-delegable profiles go to the user. Revoking a profile removes copies delegated from it.
- **Headless.** Starting profiles come from `MODE_GATE_PROFILES` (for example `issues,git-write`), read once per process (every new process, including `claude --resume`). A repo cannot set it. Profiles cannot change during a run. When the session is detectably headless, an ask that comes from the mod's own policy (source rule, guard, bash-downgrade or malformed) becomes a deny, with a message naming the available profiles that would allow the call (or a generic message). A passed-through Claude Code ask and the default ask (Claude Code's verdict unavailable) stay `ask`, and Claude Code resolves them. If headless is not detectable, the mod returns `ask`.
- **Permission modes.** Auto and bypass mode are out of scope. The README says the mod is built for the default modes. If the API shows the mode, profiles do not loosen anything in auto or bypass.
- **Protected paths.** The guards cover the six mcp-workspace write tools (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`) and the native Edit and Write. Deny on the mod's config, the log folder, `settings*.json` (which also hold hook definitions), the installed copy of the mod under `~/.claude/plugins/` and shell profiles. The working tree's own `hooks/` is not protected, so the mod can be developed while active. Ask for the rest of `.claude/` and for `package.json`, `scripts/`, the tool configs, `.mcp.json`, `.git/hooks/**`, `.git/config` and `~/.claude.json`. Other write routes (PowerShell, NotebookEdit, other MCP file tools, symlinks) are a known gap.
- **Decision log.** A JSON Lines file in a configurable folder (default `logs`): time, verdict, source, rule, profile, agent, tool, and tool-call and session ids when available. No arguments.
- **Failure.** Every gating hook has a `.catch` that fails closed (ask or deny, never allow).
- **State.** `$.state` (per session, never `$.store`) holds everything under one key, `gate`.
- **Unverified assumptions.** Fifteen API facts in `docs/design.md` are unverified. Draft 01 verifies them. Later drafts say which ones they depend on.

## Architecture and file map

Production modules, with the draft that owns each. Only `policy.ts` and a `register.ts` stub exist today.

| Module                                           | Draft   | Role                                                                                                                                                        |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/policy.ts`                                | 03      | Pure. `decide`. The `Profile` and `Rule` types are defined here by Draft 03 or Draft 02, whichever starts first. Imports nothing, no `$`, no state, no I/O. |
| `hooks/config.ts`                                | 02      | Config loader and validator.                                                                                                                                |
| `hooks/baseline.ts`, `hooks/builtin-profiles.ts` | 02 / 09 | Baseline and built-in profiles as raw rule strings, no runtime imports. Draft 09 fills the profiles.                                                        |
| `hooks/gate.ts`                                  | 04      | Shared decide path used by `register.ts` and replay. Dependencies are injected. No `$`, no I/O.                                                             |
| `hooks/guards.ts`                                | 05      | Pure path guards and `redirectHint`.                                                                                                                        |
| `hooks/assignment.ts`                            | 06      | Pure `checkAssignment`, `parseAssignmentMarker` and `effectiveSet`. Draft 06 also supplies `profileHint` (injected into gate.ts).                           |
| `hooks/explain.ts`                               | 08      | Pure notes and text formatting of a decision.                                                                                                               |
| `hooks/register.ts`                              | 04      | Thin wiring. The only importer of host APIs; nothing imports it. Wires everything and writes pending assignment records.                                    |
| `mode-gate.schema.json`                          | 02      | JSON Schema of the user config.                                                                                                                             |
| `scripts/replay.ts`                              | 08      | Offline transcript replay.                                                                                                                                  |
| `.claude/README.md`                              | 10      | The mcp-coder dependency of the copied skills and agents.                                                                                                   |
| `docs/design.md`, `docs/repo-settings.md`        | 11      | The agreed design (exists); the reproducible repo settings (Draft 11).                                                                                      |

Events handled in `register.ts`: `session.start`, `command.run` (commands registered `immediate: true`), `tool.call`, `tool.check`, `ui.render`.

- `hooks/hooks.json`: hook manifest, `{}` today. `types/index.d.ts`: mod type declarations, a stub until Draft 01.
- `tests/`: vitest. Today `repo-structure.test.ts`, `audit-gate.test.ts`, `check-action-pins.test.ts`.
- `scripts/`: `check-manifests`, `check-gating-catch`, `check-docs`, `check-action-pins`, `audit-gate`.
- `.dependency-cruiser.cjs` (architecture rules), `vitest.config.ts` (95% coverage on `policy.ts`), `stryker.config.json` (mutation break at 75), `.github/workflows/ci.yml`.
- `CLAUDE.md`: commands, testing strategy, architecture rules, principles. `docs/design.md`: the agreed design.

## Principles

TDD, KISS, clean code, concise writing, and the mcp-workspace MCP tools first (see `CLAUDE.md`). `npm run check` stays green before every commit.

## In v1, and later

In v1: baseline, profiles, the commands, guards, subagent profiles, band, log, explain and replay, and two profiles (`git-write`, `issues`). Later: parameterised profiles (`issues 123`), skill and agent declared profiles, a typed commit and push tool, enforce mode, a log with arguments, an official plugin directory listing.

## Children

| Draft | Title                                         | Purpose                                                                                                       |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 01    | Spike: verify the Claude Code API             | Check the 15 assumptions, write type declarations, fix manifest and hook shape, refactor `check-gating-catch` |
| 02    | Config schema, loader and validator           | Profile data, `MODE_GATE_PROFILES`, validator for `/gate-check`                                               |
| 03    | Policy: pure decide() function                | The decision logic and its strict tests                                                                       |
| 04    | Wiring and /gate-on, /gate-off, /gate-status  | Hooks, session state, fail-closed, `/gate-check`, headless                                                    |
| 05    | Guards: protected paths and the Bash redirect | Deny the mod's own files, steer Bash to MCP tools                                                             |
| 06    | Subagent profiles                             | Delegation by agent id                                                                                        |
| 07    | Band, /gate-why and decision log              | Visibility                                                                                                    |
| 08    | /gate-explain and offline replay              | Dry run and transcript replay                                                                                 |
| 09    | First profiles and README                     | `git-write`, `issues`, README and SECURITY.md                                                                 |
| 10    | Housekeeping: skills, agents and plugin CI    | Adapt copied files, add `claude plugin` checks                                                                |
| 11    | Post-merge repo setup: rulesets and CodeQL    | Protect `main`, code scanning                                                                                 |

## Acceptance criteria

- [ ] Draft 01 Spike: verify the Claude Code API
- [ ] Draft 02 Config schema, loader and validator
- [ ] Draft 03 Policy: pure decide() function
- [ ] Draft 04 Wiring and /gate-on, /gate-off, /gate-status
- [ ] Draft 05 Guards: protected paths and the Bash redirect
- [ ] Draft 06 Subagent profiles
- [ ] Draft 07 Band, /gate-why and decision log
- [ ] Draft 08 /gate-explain and offline replay
- [ ] Draft 09 First profiles and README
- [ ] Draft 10 Housekeeping: skills, agents and plugin CI
- [ ] Draft 11 Post-merge repo setup: rulesets and CodeQL

## Order of work

All issue work starts after PR #1 is merged to `main`.

1. Draft 01 first.
2. Drafts 02 and 03 in parallel.
3. Draft 04 needs 02 and 03.
4. Draft 05 needs 03 and 04.
5. Draft 06 needs 03, 04 and 05.
6. Draft 07 needs 04 and 05. It is independent of 06 and 08.
7. Draft 08 needs 03, 04, 05 and 06 (and 02).
8. Draft 09 needs 01 to 08 (it owns the README and `SECURITY.md` text).
9. Draft 10 needs 01. Replacing the three agents also needs 06 and 09. If assumption 11 fails, it stops and asks at once.
10. Draft 11 needs PR #1 and Draft 10 merged, so the plugin check names are final. It sits outside the chain.

## Scope

Tracking only. No code changes here.

## Depends on

none

## References

- [Summary](../design.md#summary)
- [Concepts](../design.md#concepts)
- [Work plan](../design.md#work-plan)
- [Later](../design.md#later)
- [Open items](../design.md#open-items)
