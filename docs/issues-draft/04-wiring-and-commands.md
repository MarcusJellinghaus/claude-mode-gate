# Wiring and /gate-on, /gate-off, /gate-status

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`, and inspects with `/gate-status`, `/gate-why [n]`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES`.

This is Draft 04 of 11 (plan: Draft 00). It connects the pure logic of Drafts 02 and 03 to Claude Code.

## Design decisions this issue relies on

- Events and what each hook does: `session.start` reads `MODE_GATE_PROFILES`, sets starting profiles and registers commands. `command.run` switches profiles and redraws the band, registered with `immediate: true`. `tool.call` denies subagent Bash and protected-path writes (Draft 05). `tool.check` returns the verdict from `decide`. `ui.render` draws the band (Draft 07).
- Commands: `/gate-on <profile>...` switches profiles on and prints a short summary of what they allow. `/gate-off <profile>...` switches them off; `all` switches every profile off. `/gate-status` shows the baseline, active profiles and the files they came from.
- Only the user switches profiles. The mod registers no tool Claude could call to switch.
- Lifetimes: a profile switched on lasts the session. Profiles are cleared on `/clear` and never restored on resume. The band shows names so a forgotten profile stays visible.
- Headless: `MODE_GATE_PROFILES` is read once at session start (for example `issues,git-write`). A repo cannot set it. Profiles cannot change during a run. A call that would ask is denied, with a message naming the profile that would be needed.
- State lives in `$.state` (per session), never `$.store`, and not in module variables (assumption 5, unverified).
- Failure: every gating hook has a `.catch` that fails closed (ask or deny, never allow).
- Unverified assumptions (Draft 01 verifies them): 3 (slash command text reaches `prompt.submit`), 4 (the test kit can raise `tool.check`), 5 (state is per session), 12 (hooks run under `claude -p`), 14 (argument completion). If 4 fails, test `decide` only and keep `register.ts` trivially thin. If 12 fails, headless is unsupported. If 14 fails, `/gate-status` lists profile names instead.

## Existing code

- `hooks/register.ts`: stub (`export {}`). Nothing may import it (`.dependency-cruiser.cjs` rule `no-import-of-register`).
- `hooks/hooks.json`: `{}` today; `scripts/check-manifests.mjs` requires it to be a JSON object and the plugin manifests (`.claude-plugin/plugin.json`, `marketplace.json`) to agree.
- `scripts/check-gating-catch.mjs`: requires `.catch(` in every `$.on("tool.call" | "tool.check" | "prompt.submit" | "command.run", ...)` registration in `register.ts`. Draft 01 may change the syntax it expects.
- `types/index.d.ts`: real declarations after Draft 01.
- `tests/`: vitest. `CLAUDE.md` "Testing strategy" item 4: wiring tests cover fail-closed (a guard that throws produces a deny), the reset test (after `/clear` no profile stays active) and the band test.

## Goal

Make the mod work end to end: load config, hold per-session profile state, answer `tool.check` through `decide`, and let the user switch profiles. The wiring stays thin.

## Scope

- `session.start`, `tool.check`, `command.run` with the three commands, all registered `immediate`.
- Session state in `$.state`: the active profiles.
- Reset on `/clear`; no restore on resume.
- A fail-closed `.catch` on every gating hook.

## Out of scope / later

Guards (Draft 05), subagent assignment (Draft 06), band and log (Draft 07), `/gate-check` and `/gate-explain` registration if Drafts 02 or 08 are not done yet.

## Acceptance criteria

- [ ] A guard that throws produces ask or deny, never allow (wiring test).
- [ ] After `/clear` no profile is active (reset test).
- [ ] A resumed session has no profile beyond `MODE_GATE_PROFILES`.
- [ ] `/gate-on` with a known name activates it and prints a summary of what it allows.
- [ ] `/gate-on` with an unknown name changes nothing and says so.
- [ ] `/gate-off all` clears every profile.
- [ ] No tool callable by Claude switches profiles.
- [ ] `npm run check:catch` and `npm run arch` pass.
- [ ] `npm run check` passes.

## How to start

First failing test: with the test kit (or a fake `$` if assumption 4 failed), a `tool.check` for `Bash` `git commit -m x` returns ask with no profile, and allow after `/gate-on git-write` once that profile exists as a fixture. Second: a `decide` that throws yields deny.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 01, Draft 02, Draft 03

## References

- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
- [Headless runs](../design.md#headless-runs)
- [Failure](../design.md#failure)
- [Code structure](../design.md#code-structure)
