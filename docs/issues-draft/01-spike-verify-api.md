# Spike: verify the Claude Code API

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A mod is a plugin of function hooks that hot-reload in a session. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules: each has a description and three lists, `allow`, `ask`, `deny`, in Claude Code rule syntax (`mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`). The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`, and inspects with `/gate-status`, `/gate-why [n]`, `/gate-check` and `/gate-explain <tool> …`. **Subagents** get the baseline plus profiles their parent assigns. **Headless runs** (`claude -p`) read starting profiles from the environment variable `MODE_GATE_PROFILES`.

The design is agreed in `docs/design.md`, but nothing is built, and 15 facts about the mods API are unverified. This spike is the first step (Draft 01 of 11). Every later draft depends on its result. See Draft 00 for the plan.

## Design decisions this issue relies on

- Code structure: `hooks/policy.ts` is pure (no `$`, no state, no imports). `hooks/register.ts` is thin wiring. State lives in `$.state` (per session), never `$.store`.
- Events: `session.start` (reads `MODE_GATE_PROFILES`, registers commands), `command.run` (commands registered `immediate: true`), `tool.call` (denies subagent Bash and protected-path writes), `tool.check` (returns the verdict from `decide`), `ui.render` (draws the band, keeps other mods' content).
- Decision order, first match wins: (1) a subagent calls Bash and holds no profile with a Bash rule for it: deny with a redirect message; (2) Edit or Write on a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) a call matching nothing keeps Claude Code's own verdict. A deny from Claude Code is never overridden.
- Every gating hook has a `.catch` that fails closed (ask or deny, never allow).
- Permission modes: auto and bypass are out of scope for v1. If the API shows the mode, profiles do not loosen anything there.

## The 15 unverified assumptions

| #   | Assumption                                                    | Why it matters                                              |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `tool.check` exposes the tool input, such as the Bash command | Rules cannot look at the command without it                 |
| 2   | `tool.call` and `tool.check` carry an agent id                | Subagent rules and per-agent profiles depend on it          |
| 3   | A slash command's text reaches `prompt.submit`                | Tells when a skill-declared profile ends                    |
| 4   | The test kit can raise `tool.check` directly                  | Otherwise the verdict hook is tested only through `decide`  |
| 5   | Each terminal session has its own copy of module state        | `$.state` is per session; module variables must not be used |
| 6   | A mod can read the current permission mode                    | Avoids loosening in auto and bypass mode                    |
| 7   | A mod can ask Claude Code how it would decide a call          | Needed for "never override a stricter verdict"              |
| 8   | Settings files can define environment variables               | Decides which files protected paths must cover              |
| 9   | Plugins are stored under `~/.claude/plugins/`                 | Decides the protected paths                                 |
| 10  | A mod sees a subagent launch and its parameters               | Needed to record the profiles the parent assigns            |
| 11  | Hooks run for `bypassPermissions` agents                      | Otherwise those agents skip the mod entirely                |
| 12  | Hooks run under `claude -p`                                   | Needed for headless runs                                    |
| 13  | A mod can draw below the entry box                            | Otherwise the band stays above the prompt                   |
| 14  | A command can offer argument completion                       | Decides how profile names are suggested                     |
| 15  | A mod can tell when a skill starts and ends                   | Needed for skill-declared profiles (later)                  |

## Existing code

- `types/index.d.ts`: a stub (`export {}`) for `$.state` and mod declarations. This spike fills it.
- `hooks/register.ts`: wiring stub. `hooks/policy.ts`: only `export type Verdict = "allow" | "ask" | "deny"`. `hooks/hooks.json`: `{}`.
- `scripts/check-gating-catch.mjs`: scans `hooks/register.ts` for `$.on("event", ...)` registrations and requires `.catch(` on `tool.call`, `tool.check`, `prompt.submit` and `command.run`. Both the `$.on` syntax and the event list are assumptions; update the script if the real API differs.
- `scripts/check-manifests.mjs` and `.claude-plugin/plugin.json`: manifest checks. `CLAUDE.md`: commands, testing strategy, principles. `docs/design.md`: the design and the assumptions table.

## Goal

Replace guesses with facts. Verify each of the 15 assumptions against a real Claude Code, generate real type declarations, and record every design change.

## Scope

- Check the Claude Code version and note the minimum supported one.
- Load a minimal probe mod and read the generated declarations.
- Test at runtime: agent id on `tool.call` and `tool.check` (2); subagent launch visibility (10); hooks under `bypassPermissions` agents (11) and under `claude -p` (12); skill start and end (15); a slot below the entry box (13); command argument completion (14); tool input in `tool.check` (1); permission mode readable (6).
- Decide the rest (3, 4, 5, 7, 8, 9) from declarations and docs, or by a small probe.
- Read the built-in sec-default source and note its fail-closed patterns.
- Update the `docs/design.md` assumptions table and any section that changes.

## Out of scope / later

Building any production feature. The probe mod is throw-away.

## If an assumption fails

Write the fallback into `docs/design.md` before any dependent draft starts. Examples: no agent id (2) means subagent profiles (Draft 06) cannot be enforced per agent, so say what is dropped. No hooks under `bypassPermissions` agents (11) means those agents bypass the mod, so Draft 10 must stop using them. No hooks under `claude -p` (12) means headless runs are unsupported.

## Acceptance criteria

- [ ] The assumptions table in `docs/design.md` marks each of the 15 as verified or failed, with the Claude Code version used.
- [ ] Every failed assumption has a documented design change or fallback.
- [ ] `types/index.d.ts` holds the real declarations and `npm run typecheck` passes.
- [ ] `scripts/check-gating-catch.mjs` matches the real registration syntax and gating event names.
- [ ] The minimum Claude Code version is recorded in `docs/design.md`.
- [ ] The sec-default fail-closed patterns are summarised in `docs/design.md`.
- [ ] No probe code remains in `hooks/`.
- [ ] `npm run check` passes.

## How to start

1. Run `claude --version`. 2. Read the mods reference in the Claude Code docs. 3. Create a probe in the scratchpad (not in `hooks/`), load it, and log the payload of each event to a file. 4. Fill in one table row per probe.

## Working rules

TDD where code exists, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Commit and push to a feature branch after each major change, and run `npm run check` first.

## Depends on

none

## References

- [Unverified assumptions](../design.md#unverified-assumptions)
- [Events](../design.md#events)
- [Work plan](../design.md#work-plan)
- [Prior art](../design.md#prior-art)
- [Failure](../design.md#failure)
