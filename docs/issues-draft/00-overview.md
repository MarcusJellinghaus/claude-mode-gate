# claude-mode-gate: plan and overview

## Goal

Build claude-mode-gate v1: a Claude Code mod that limits what Claude may do, through a fixed baseline plus profiles the user switches on and off. This issue is the tracking list. Each child issue repeats the context it needs, so it can be read alone.

Draft ids (Draft 01 and so on) become GitHub issue numbers when the issues are created. Until then, issues refer to each other by draft id.

## Problem and idea

Claude Code either asks too often or allows too much, and Bash is the weak spot: a prefix rule such as `Bash(gh issue edit *)` can be fooled by `gh issue edit 1 && rm -rf .`.

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod. A mod is a plugin of TypeScript function hooks that hot-reload in a session. It gates Claude's tool calls only. It is not a sandbox, and it runs with the user's permissions. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, and the user switches them on and off. Everything else still asks.

Subagents get the baseline plus the profiles their parent assigns. Headless runs (`claude -p`) read starting profiles from an environment variable and deny anything that would ask.

## Glossary and decisions

- **Baseline.** Always-on rules. Reads: the mcp-workspace read tools (files, directories, search, reference projects, read-only `git`, GitHub reads, `check_*`). Writes: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`, with protected paths still denied. Checks: the exact scripts `npm run check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:*` and `audit`. `npm ci` and `npm install` ask, because they run install scripts. Other tools: Skill, Agent, web fetch and web search. Ask: edits to `package.json`, `scripts/` and tool configs, because the allowed scripts execute them. Deny: protected paths. Git writes (`add`, `commit`, `push`, `checkout -b`) are not in the baseline.
- **Profile.** A named bundle with a description and three lists, `allow`, `ask`, `deny`, in the shape of the `permissions` block of `settings.json`. A profile with only `deny` entries is a restriction. A profile may be marked non-delegable.
- **Active set.** Baseline plus the profiles switched on.
- **Rule syntax.** Claude Code's: `mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`. Version 1 matches MCP tools by whole-tool name and Bash by prefix rules. Matching MCP tools by argument comes later, with parameterised profiles.
- **Bash metacharacter rule.** A Bash rule matches only if the command contains none of `& ; | $ ( ) \` < >` and no newline. Anything unusual asks.
- **Decision order.** The first match wins: (1) a subagent calls Bash and no active allow rule matches this call: deny with the redirect message; (2) Edit or Write on a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) a call matching nothing keeps Claude Code's own verdict. A deny from Claude Code is never overridden. An allow from Claude Code is downgraded to ask for Bash unless an active rule allows the call.
- **Commands.** `/gate-on <profile>...`, `/gate-off <profile>...` (`all` switches every profile off), `/gate-status`, `/gate-why [n]` (last n verdicts with rule and profile), `/gate-check` (validate config), `/gate-explain <tool> …` (dry run). `/gate-status` shows the baseline summary, active profiles and the config path. Draft 04 registers all but `/gate-why` (Draft 07) and `/gate-explain` (Draft 08). Replay is an offline command-line tool over a session transcript (`npm run replay`, Draft 08). Only the user switches profiles; the mod registers no tool Claude could call to switch.
- **Lifetimes.** A profile the user switches on lasts the session. A profile a skill declares lasts until the next prompt (later feature). Profiles are cleared on `/clear` and never restored on resume (profiles from an earlier session do not come back). The band shows profile names.
- **Subagents.** A subagent gets the baseline plus the profiles its parent assigns at spawn. The parent can assign only profiles it holds. A denial names the profile needed; the subagent stops and reports; non-delegable profiles go to the user. Revoking a profile removes copies delegated from it.
- **Headless.** Starting profiles come from `MODE_GATE_PROFILES` (for example `issues,git-write`), read once per process (every new process, including `claude --resume`). A repo cannot set it. Profiles cannot change during a run. A call that would ask is denied, with a message naming the available profiles that would allow it (or a generic message), when the session is detectably headless; otherwise the mod returns `ask` and Claude Code resolves it.
- **Permission modes.** Auto and bypass mode are out of scope. The README says the mod is built for the default modes. If the API shows the mode, profiles do not loosen anything in auto or bypass.
- **Protected paths.** Deny Edit and Write on the mod's config, the log folder, `settings*.json` (which also hold hook definitions), the installed copy of the mod under `~/.claude/plugins/` and shell profiles. The working tree's own `hooks/` is not protected, so the mod can be developed while active. Ask for the rest of `.claude/` and for `package.json`, `scripts/`, the tool configs, `.mcp.json`, `.git/hooks/**`, `.git/config` and `~/.claude.json`. Other write routes (PowerShell, NotebookEdit, MCP file tools, symlinks) are a known gap.
- **Decision log.** A JSON Lines file in a configurable folder (default `logs`): time, verdict, source, rule, profile, agent, tool, and tool-call and session ids when available. No arguments.
- **Failure.** Every gating hook has a `.catch` that fails closed (ask or deny, never allow).
- **Unverified assumptions.** Fifteen API facts in `docs/design.md` are unverified. Draft 01 verifies them. Later drafts say which ones they depend on.

## Architecture and file map

- `hooks/policy.ts`: pure decision logic. Imports nothing, uses no `$`, no state, no I/O. Today it holds only the `Verdict` type (`allow`, `ask`, `deny`).
- `hooks/gate.ts`: the shared decision path (Draft 04). Imports `policy.ts`, uses no `$` and no I/O, and takes guards, `redirectHint`, `log`, the `headless` flag and Claude Code's verdict source by injection. Used by `register.ts` and by the replay tool (Draft 08). Does not exist yet.
- `hooks/register.ts`: thin event wiring that builds the dependencies and calls `gate.ts`. The only importer of host APIs. A stub today. Nothing may import it. Events: `session.start`, `command.run` (commands registered `immediate: true`), `tool.call`, `tool.check`, `ui.render`.
- `hooks/hooks.json`: hook manifest, `{}` today. `types/index.d.ts`: mod type declarations, a stub until Draft 01.
- `tests/`: vitest. Today `repo-structure.test.ts`, `audit-gate.test.ts`, `check-action-pins.test.ts`.
- `scripts/`: `check-manifests`, `check-gating-catch`, `check-docs`, `check-action-pins`, `audit-gate`.
- `.dependency-cruiser.cjs` (architecture rules), `vitest.config.ts` (95% coverage on `policy.ts`), `stryker.config.json` (mutation break at 75), `.github/workflows/ci.yml`.
- `CLAUDE.md`: commands, testing strategy, architecture rules, principles. `docs/design.md`: the agreed design. State lives in `$.state` (per session), never `$.store`.

## Principles

TDD, KISS, clean code, concise writing, and the mcp-workspace MCP tools first (see `CLAUDE.md`). `npm run check` stays green before every commit.

## In v1, and later

In v1: baseline, profiles, the commands, guards, subagent profiles, band, log, explain and replay, and two profiles (`git-write`, `issues`). Later: parameterised profiles (`issues 123`), skill and agent declared profiles, a typed commit and push tool, enforce mode, a log with arguments, an official plugin directory listing.

## Children

| Draft | Title                                         | Purpose                                                                                                       |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 01    | Spike: verify the Claude Code API             | Check the 15 assumptions, write type declarations, fix manifest and hook shape, refactor `check-gating-catch` |
| 02    | Config schema, loader and validator           | Profile data, `MODE_GATE_PROFILES`, `/gate-check`                                                             |
| 03    | Policy: pure decide() function                | The decision logic and its strict tests                                                                       |
| 04    | Wiring and /gate-on, /gate-off, /gate-status  | Hooks, session state, fail-closed, `/gate-check`, headless                                                    |
| 05    | Guards: protected paths and the Bash redirect | Deny the mod's own files, steer Bash to MCP tools                                                             |
| 06    | Subagent profiles                             | Delegation by agent id                                                                                        |
| 07    | Band, /gate-why and decision log              | Visibility                                                                                                    |
| 08    | /gate-explain and offline replay              | Dry run and transcript replay                                                                                 |
| 09    | First profiles and README                     | `git-write`, `issues`, "what it can reach" docs                                                               |
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

All issue work starts after PR #1 is merged to `main`. Draft 01 first. Drafts 02 and 03 can then run in parallel. Draft 04 needs both. Drafts 05 and 06 need 03 and 04. Draft 08 needs 02, 03, 04, 05 and 06 (the subagent effective set and `checkAssignment`). Draft 07 needs 04 and 05; 07 and 08 are otherwise independent. Draft 09 needs 02 to 05. Draft 10 can start after 01; replacing the agents with profiles waits for 06 and 09. Draft 11 waits for the merge of PR #1.

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
