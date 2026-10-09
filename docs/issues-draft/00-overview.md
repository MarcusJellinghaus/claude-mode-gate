# claude-mode-gate: plan and overview

## Goal

Build claude-mode-gate v1: a Claude Code mod that limits what Claude may do, through a fixed baseline plus profiles the user switches on and off. This issue is the tracking list. Each child issue repeats the context it needs, so it can be read alone.

Draft ids (Draft 01 and so on) become GitHub issue numbers when the issues are created. Until then, issues refer to each other by draft id.

## Problem and idea

Claude Code either asks too often or allows too much, and Bash is the weak spot: a prefix rule such as `Bash(gh issue edit *)` can be fooled by `gh issue edit 1 && rm -rf .`.

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod. A mod is a plugin of TypeScript function hooks that hot-reload in a session. It gates Claude's tool calls only. It is not a sandbox, and it runs with the user's permissions. It guards against mistakes and prompt injection, not against an adversary who can write code and run it (for example a test file under `tests/` run by the allowed `npm run test`). A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, and the user switches them on and off. Everything else still asks.

Subagents get the baseline plus the profiles their parent assigns. Headless runs (`claude -p`) read starting profiles from an environment variable. There, an ask that comes from the mod's own policy becomes a deny.

The mods API has been checked against Claude Code 2.1.292 and the facts are in `docs/mods-api-notes.md` (the authority for the rows marked verified in the assumptions table of `docs/design.md`).

## Glossary and decisions

- **Baseline.** Always-on allow rules; the full text is in `docs/design.md` (Baseline) and is implemented by Draft 02 (`hooks/baseline.ts`). It has no ask or deny rules. The path-based asks and denies are guards (Draft 05). `npm ci` and `npm install` ask through the Bash downgrade (an unmatched Bash call asks); a Claude Code allow for them in `settings.json` does not override that ask while the mod is active. Git writes are not in the baseline.
- **Profile.** A named bundle with a description and three lists, `allow`, `ask`, `deny`, in the shape of the `permissions` block of `settings.json`. A profile with only `deny` entries is a restriction. A profile may be marked non-delegable.
- **Active set.** Baseline plus the profiles switched on.
- **Rule syntax.** A **subset** of Claude Code's syntax: `mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`. Only exact rules and a trailing ` *` (or `:*`, or whole-argument `*`) prefix rule are supported; a mid-string `*`, or one glued to a word (`Bash(git*)`), is a rule error. Version 1 matches MCP tools by whole-tool name and Bash by those rules. Matching MCP tools by argument and globs in deny and ask rules come later.
- **Bash matching.** Two modes. Allow rules match strictly: exact or prefix, and never when the command contains any character of `BASH_METACHARACTERS` (an exported constant of `hooks/policy.ts`, defined by Draft 03, the only place that lists the characters), so anything unusual asks. Deny rules and profile ask rules use a boundary-checked substring match, so they fire even when metacharacters are present (`deny Bash(git push *)` fires on `x; git push`).
- **Claude Code's verdict.** In `tool.check`, `next(e)` returns Claude Code's own verdict `{ decision, reason, rule }`. `decide` returns a Claude Code deny unchanged. `tool.call` and `/gate-explain` use the stand-in verdict `allow`.
- **Config.** The user file is `$XDG_CONFIG_HOME/mode-gate/config.json` (fallback `~/.config/mode-gate/config.json`; `MODE_GATE_CONFIG` overrides the path). Keys: `$schema`, `logDir`, `profiles`. A project `.mode-gate.json` holds proposals only; its profiles are never active. The mod reads the environment with `$.env.get` and literal names only.
- **Decision order.** A deny from Claude Code passes through unchanged. Then the first match wins: (1) a call with an agent id is a subagent call; a subagent calls Bash and no active allow rule matches this call: deny with the redirect message; (2) a covered write tool targets a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) a call matching nothing keeps Claude Code's own verdict, and an allow for Bash is downgraded to ask unless an active rule allows the call.
- **Commands.** `/gate-on <profile>...`, `/gate-off <profile>...` (`all` switches every profile off), `/gate-status`, `/gate-why [n]` (last n verdicts with rule and profile), `/gate-check` (validate config), `/gate-explain <tool> …` (dry run). Draft 04 registers `/gate-on`, `/gate-off`, `/gate-status` and `/gate-check` (and builds the environment object and `$.fs` reader that `loadConfig` needs), Draft 07 `/gate-why`, Draft 08 `/gate-explain`. Commands are registered with `$.command.register` in `session.start` and served by `command.run` hooks. Only the user switches profiles; the mod registers no tool Claude could call to switch.
- **Lifetimes.** A profile the user switches on lasts the session. A profile a skill declares lasts until the next prompt (later feature). `/clear` fires `session.end` and no `session.start`, so the state is reset in `session.end`; profiles are never restored on resume. A hot reload re-fires `session.start`, so state lives in `$.state`, and starting profiles apply only while the state is not yet started. The band shows profile names.
- **Subagents.** A subagent gets the baseline plus the profiles its parent assigns at spawn, named on the first line of the Agent call prompt: `mode-gate-profiles: a, b`. Any call with an agent id is a subagent call, engine forks and teammates included. The parent can assign only profiles it holds. The main session's deny and ask lists are inherited by every subagent; allow lists are not. A denial names the profile needed; the subagent stops and reports; non-delegable profiles go to the user. Revoking a profile removes copies delegated from it.
- **Headless.** Starting profiles come from `MODE_GATE_PROFILES` (for example `issues,git-write`), read at the first `session.start` of a process. A repo cannot set it. Profiles cannot change during a run. Headless means `session.start.isInteractive` is false. There, an ask that comes from the mod's own policy (source rule, guard, bash-downgrade or malformed) becomes a deny, with a message naming the available profiles that would allow the call (or a generic message). A passed-through Claude Code ask stays `ask`.
- **Permission modes.** Auto and bypass mode are out of scope. The README says the mod is built for the default modes.
- **Protected paths.** The guards cover the six mcp-workspace write tools and the native Edit and Write; the full lists (deny, ask, `.npmrc`, `.github/workflows/**`, `.git/**`) are in `docs/design.md` (Protected paths) and implemented by Draft 05. The working tree's own `hooks/`, `tests/` and `types/` are not protected. Symbolic links are resolved by the wiring and passed to the pure guard. PowerShell is a documented gap: v1 gates Bash only.
- **Decision log.** A JSON Lines file in a configurable folder (default `logs`): time, verdict, source, rule, profile, agent, tool, and tool-call and session ids when available. No arguments. There is no append API, so the writer rewrites the file and keeps the newest 1000 lines.
- **Failure.** Every gating hook has a `.catch` that fails closed (ask or deny, never allow). A module that fails to load is assumed to gate nothing (assumption 18; reported only).
- **State.** `$.state` (per session, never `$.store`) holds everything under one key, `gate`.
- **Assumptions.** `docs/design.md` has 23 numbered API assumptions with a Status column. Five are verified (1, 5, 7, 12, 17) and the rest are either documented, not needed in v1, or open. Draft 01 works through the open ones. Later drafts say which ones they depend on.

## Architecture and file map

Production modules, with the draft that owns each. Only `policy.ts` and a `register.ts` stub exist today.

| Module                                           | Draft   | Role                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/policy.ts`                                | 03      | Pure. `decide({ call, sets, guards, claude, withChain? })`, the `Rule`, `Profile`, `RuleSet`, `Call`, `GuardResult`, `ClaudeVerdict` and `Decision` types and `BASH_METACHARACTERS`. Imports nothing, no `$`, no state, no I/O. Draft 02 imports the types. |
| `hooks/config.ts`                                | 02      | Config loader and validator. Imports only `baseline.ts`, `builtin-profiles.ts` and types from `policy.ts`.                                                                                                                                                  |
| `hooks/baseline.ts`, `hooks/builtin-profiles.ts` | 02 / 09 | Baseline (allow rules only) and built-in profiles as raw rule strings, no runtime imports. Draft 09 fills the profiles.                                                                                                                                     |
| `hooks/commands.ts`                              | 04      | Pure session-state transitions (start, reset) and `/gate-on`, `/gate-off`, `/gate-status` logic: all-or-nothing validation, reserved names, usage text. Imports only types from `policy.ts` and `config.ts`.                                                |
| `hooks/gate.ts`                                  | 12      | Shared decide path used by `tool.call`, `tool.check` and `/gate-explain`, plus the event normalisers, `profileHint` and the headless conversion. Dependencies injected. No `$`, no I/O.                                                                     |
| `hooks/guards.ts`                                | 05      | Pure path guards (with resolved symlink paths as an input) and `redirectHint`.                                                                                                                                                                              |
| `hooks/assignment.ts`                            | 06      | Pure `checkAssignment`, `parseAssignmentMarker` and `effectiveSet` (returns `RuleSet[]`), nothing else. `profileHint` lives in `gate.ts`; Draft 06 supplies the `availableProfiles(call)` closure for subagent calls.                                       |
| `hooks/log-format.ts`                            | 07      | Pure log-entry formatting, bounded append, `/gate-why` parsing and filtering, band text. The `$.fs` calls stay in `register.ts`.                                                                                                                            |
| `hooks/explain.ts`                               | 08      | Pure notes and text formatting of a decision.                                                                                                                                                                                                               |
| `hooks/register.ts`                              | 04 / 12 | Thin wiring: `register(on, options)` with `on(event, matcher, hook)`. The only importer of host APIs; nothing imports it. Draft 04 adds state and commands, Draft 12 the tool hooks, Drafts 05 to 08 their parts.                                           |
| `mode-gate.schema.json`                          | 02      | JSON Schema of the user config.                                                                                                                                                                                                                             |
| `.claude/README.md`                              | 10      | The mcp-coder dependency of the copied skills and agents.                                                                                                                                                                                                   |
| `docs/design.md`, `docs/mods-api-notes.md`       | exist   | The agreed design and the verified API facts. `docs/repo-settings.md` is Draft 11.                                                                                                                                                                          |
| `README.md`, `SECURITY.md`                       | 13      | User documentation.                                                                                                                                                                                                                                         |

Events handled in `register.ts`: `session.start` and `session.end` (Draft 04; Draft 12 extends `session.start`), `command.run` (commands registered `immediate: true`), `tool.call` and `tool.check` (Draft 12), `ui.render` (Draft 07).

- `hooks/hooks.json`: `{ "modules": ["./register.ts"] }` after Draft 01. `types/index.d.ts`: the mod's own `PluginState` contract (Draft 04); the engine supplies the API types.
- `tests/`: vitest. Today `repo-structure.test.ts`, `audit-gate.test.ts`, `check-action-pins.test.ts`.
- `scripts/`: `check-manifests`, `check-gating-catch` (fixed by Draft 12), `check-docs`, `check-action-pins`, `audit-gate`.
- `.dependency-cruiser.cjs` (architecture rules), `vitest.config.ts` (95% coverage on `policy.ts`), `stryker.config.json` (mutation break at 75), `.github/workflows/ci.yml`. Each pure module joins the coverage include list, the Stryker `mutate` list and a purity rule as its draft lands: `config.ts` (02), `commands.ts` (04), `gate.ts` (12), `guards.ts` (05), `assignment.ts` (06), `log-format.ts` (07), `explain.ts` (08). `gate.ts` may import only `policy.ts`; `commands.ts` only types from `policy.ts` and `config.ts`; `log-format.ts` and `explain.ts` only types from `policy.ts`; `config.ts` only `baseline.ts`, `builtin-profiles.ts` and types from `policy.ts`; `guards.ts` and `assignment.ts` nothing at runtime.
- `CLAUDE.md`: commands, testing strategy, architecture rules, principles. `docs/design.md`: the agreed design.

## Principles

TDD, KISS, clean code, concise writing, and the mcp-workspace MCP tools first (see `CLAUDE.md`). `npm run check` stays green before every commit.

## In v1, and later

In v1: baseline, profiles, the commands, guards, subagent profiles, headless behaviour, band, log, `/gate-explain`, and two profiles (`git-write`, `issues`). Later: replay of session transcripts (`npm run replay`), globs in deny and ask rules, PowerShell gating, parameterised profiles (`issues 123`), skill and agent declared profiles, a typed commit and push tool, enforce mode, a log with arguments, a launcher check that the module loaded, an official plugin directory listing.

## Children

| Draft | Title                                                            | Purpose                                                                                                |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 01    | Spike: verify the remaining Claude Code API facts                | Close the open assumptions, fix the manifest shape and how `typecheck` gets the engine's types         |
| 02    | Config schema, loader and validator                              | Profile data, baseline, `MODE_GATE_PROFILES`, validator for `/gate-check`                              |
| 03    | Policy: pure decide() function                                   | The decision logic, the `Rule` and `Profile` types, `BASH_METACHARACTERS` and the strict tests         |
| 04    | Session state and /gate-on, /gate-off, /gate-status, /gate-check | `$.state` shape, reset on `session.end`, the four commands and `hooks/commands.ts`                     |
| 05    | Guards: protected paths and the Bash redirect                    | Deny the mod's own files, ask for risky files, resolve symlinks, steer Bash to MCP tools               |
| 06    | Subagent profiles                                                | Delegation by agent id                                                                                 |
| 07    | Band, /gate-why and decision log                                 | Visibility                                                                                             |
| 08    | /gate-explain                                                    | Dry run of one call                                                                                    |
| 09    | First profiles: git-write and issues                             | The two built-in profiles and their tests                                                              |
| 10    | Housekeeping: skills, agents and plugin CI                       | Adapt copied files, add `claude plugin` checks                                                         |
| 11    | Post-merge repo setup: rulesets and CodeQL                       | Protect `main`, code scanning                                                                          |
| 12    | Shared decision path, tool hooks and headless behaviour          | `gate.ts`, `tool.call` and `tool.check` wiring, fail-closed `.catch`, `check:catch` fix, headless runs |
| 13    | README and SECURITY.md                                           | User documentation: reach, limits, threat model                                                        |

## Acceptance criteria

- [ ] Draft 01 Spike: verify the remaining Claude Code API facts
- [ ] Draft 02 Config schema, loader and validator
- [ ] Draft 03 Policy: pure decide() function
- [ ] Draft 04 Session state and /gate-on, /gate-off, /gate-status, /gate-check
- [ ] Draft 05 Guards: protected paths and the Bash redirect
- [ ] Draft 06 Subagent profiles
- [ ] Draft 07 Band, /gate-why and decision log
- [ ] Draft 08 /gate-explain
- [ ] Draft 09 First profiles: git-write and issues
- [ ] Draft 10 Housekeeping: skills, agents and plugin CI
- [ ] Draft 11 Post-merge repo setup: rulesets and CodeQL
- [ ] Draft 12 Shared decision path, tool hooks and headless behaviour
- [ ] Draft 13 README and SECURITY.md

## Order of work

All issue work starts after PR #1 is merged to `main`. Draft numbers are ids, not the order.

1. Draft 01 and Draft 03 first, in parallel. Draft 03 needs nothing from 01 (the input shapes are verified in `docs/mods-api-notes.md`); it defines the `Rule` and `Profile` types.
2. Draft 02 needs 03 (the types) and 01 (assumptions 16 and 22).
3. Draft 04 needs 02 and 03.
4. Draft 12 needs 02, 03 and 04.
5. Draft 05 needs 03 and 12.
6. Draft 06 needs 03, 04, 05 and 12.
7. Draft 07 needs 04, 05 and 12. It is independent of 06 and 08.
8. Draft 08 needs 02, 03, 04, 05, 06 and 12.
9. Draft 09 needs 02 and 03 (its rows go through `decide`).
10. Draft 13 needs 01 to 09 and 12 (it owns the README and `SECURITY.md` text).
11. Draft 10 needs 01. Replacing the three agents also needs 06, 09 and 12. If assumption 11 fails, it stops and asks at once.
12. Draft 11 needs PR #1 and Draft 10 merged, so the plugin check names are final. It sits outside the chain.

## Scope

Tracking only. No code changes here.

## Depends on

none

## References

- [Summary](../design.md#summary)
- [Concepts](../design.md#concepts)
- [Threat model](../design.md#threat-model)
- [Work plan](../design.md#work-plan)
- [Later](../design.md#later)
- [Open items](../design.md#open-items)
- [API notes](../mods-api-notes.md)
