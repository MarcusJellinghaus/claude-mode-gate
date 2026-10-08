# Config schema, loader and validator

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules. A profile has a name, a description and three lists, `allow`, `ask` and `deny`, in Claude Code rule syntax: `mcp__server__tool` for a whole MCP tool, `Bash(npm run check)` for an exact command, `Bash(git commit *)` for a prefix. The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`, and uses `/gate-status`, `/gate-why [n]`, `/gate-check` (validate config), `/gate-explain <tool> …` (dry run). **Subagents** get the baseline plus profiles their parent assigns. **Headless runs** (`claude -p`) take starting profiles from `MODE_GATE_PROFILES`.

This is Draft 02 of 11 (plan: Draft 00). It defines and validates the data that Draft 03 (`decide`) consumes and Draft 04 (wiring) loads.

## Design decisions this issue relies on

- A profile is the same shape as the `permissions` block in `settings.json`: `allow`, `ask`, `deny`. A profile with only `deny` entries is a restriction (for example a read-only profile). A profile can be marked non-delegable: a parent cannot hand it to a subagent, and the request goes to the user.
- Version 1 matches MCP tools by whole-tool name and Bash by prefix rules. Matching by argument is later (parameterised profiles such as `issues 123`).
- Bash rules match only if the command contains none of `& ; | $ ( ) \` < >` and no newline.
- Baseline: reads (mcp-workspace read tools), writes (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`), the exact check scripts, Skill, Agent, web fetch and web search. Ask for edits to `package.json`, `scripts/` and tool configs. Deny protected paths.
- `MODE_GATE_PROFILES` (for example `issues,git-write`) is read once at session start. A repo cannot set it. Profiles cannot change during a headless run.
- `/gate-status` shows the baseline, the active profiles and the files they came from.
- Over-broad rules and conflicts are reported by `/gate-check`: conflicts, unknown tools, over-broad rules such as `Bash(*)`.
- Open item in the design: where profiles are defined, and how a project may propose profiles the user then approves.

## Existing code

- `hooks/policy.ts`: pure logic, no imports allowed (`.dependency-cruiser.cjs` rule `policy-is-pure`, and `tests/repo-structure.test.ts`). Only the `Verdict` type exists. Put shared pure types (profile, rule) here or in a new pure file under `hooks/`; check what `npm run arch` and `knip` allow.
- `hooks/register.ts`: wiring stub, will call the loader (Draft 04). Nothing may import it.
- `tests/`: vitest (`vitest.config.ts` includes `tests/**/*.test.ts`). Coverage is enforced only on `hooks/policy.ts` (95%).
- `CLAUDE.md`: commands, testing strategy, architecture rules. `docs/design.md`: the design.

## Goal

Define the config schema for the baseline and profiles, load it, derive starting profiles from `MODE_GATE_PROFILES`, and validate it for `/gate-check`. Keep the logic pure and table-tested.

## Scope

- Schema and parser for profiles, with clear errors naming the field.
- Loader for the user-level config file. Decide the location and the format.
- Parse `MODE_GATE_PROFILES` (comma separated).
- Validator: conflicts, unknown tools, over-broad rules such as `Bash(*)`.
- Decide where profiles live, and that a project may only propose profiles which the user then approves.

## Out of scope / later

The `/gate-check` command registration (Draft 04). Parameterised profiles. Skill-declared profiles.

## Open questions

- File location and format of the user-level config (JSON next to the mod, or under `~/.claude`)? Protected paths (Draft 05) must cover it.
- How does the user approve a project-proposed profile? Recommended for v1: project proposals are only listed by `/gate-check` and never loaded until the user copies them into the user-level config.

## Acceptance criteria

- [ ] Table tests exist before the code, one row per valid and invalid config.
- [ ] A malformed config is rejected with a message naming the field.
- [ ] `Bash(*)` and similar over-broad rules are reported.
- [ ] An unknown tool name is reported.
- [ ] A rule in both `allow` and `deny` of one profile is reported as a conflict.
- [ ] An unknown name in `MODE_GATE_PROFILES` is reported and activates nothing.
- [ ] A project file cannot activate or approve a profile (negative test).
- [ ] The location decision and the approval flow are written into `docs/design.md`.
- [ ] `npm run check` passes (arch, knip, lint and strict types included).

## How to start

Write the first failing test in `tests/config.test.ts`: parsing `{ name: "git-write", description: "...", allow: ["Bash(git add *)"] }` yields a profile with empty `ask` and `deny`; then `{ allow: "x" }` is rejected.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push to a feature branch after each major change.

## Depends on

Draft 01 (assumption 8 on settings env vars, and the declarations).

## References

- [Concepts](../design.md#concepts)
- [Baseline](../design.md#baseline)
- [Matching](../design.md#matching)
- [Commands](../design.md#commands)
- [Headless runs](../design.md#headless-runs)
- [Open items](../design.md#open-items)
