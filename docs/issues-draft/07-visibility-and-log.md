# Band, /gate-why and decision log

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why [n]` (the last n verdicts with the rule and profile that fired), `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 07 of 11 (plan: Draft 00). It makes the gate visible so a forgotten profile cannot stay active unnoticed.

## Design decisions this issue relies on

- Lifetimes: a profile switched on lasts the session; profiles are cleared on `/clear` and never restored on resume. "The band shows profile names, so a forgotten profile stays visible."
- `ui.render` draws the active profiles in the band and keeps other mods' content.
- Decision log: the mod writes a log file in a configurable folder (default `logs`). Each entry has a timestamp, the verdict, the rule and profile that fired, the agent and the tool name. It records no arguments, because arguments can hold secrets.
- `/gate-why [n]` reads the log. Replay (Draft 08) uses session transcripts, not the log.
- The log folder is a protected path: Edit and Write are denied there (Draft 05), so Claude cannot erase its own trail.
- Failure: every gating hook fails closed. A logging error must not turn a deny into an allow.
- Unverified: assumption 13 (a mod can draw below the entry box). If it fails, the band stays above the prompt. Assumption 5 (state per session) affects any in-memory log buffer.

## Existing code

- `hooks/register.ts`: wiring stub with the `ui.render` event to add; `hooks/policy.ts`: pure; `decide` (Draft 03) returns the rule and profile needed for log entries.
- `types/index.d.ts`: declarations after Draft 01. `tests/`: vitest; tests must not touch the real `~/.claude`, the network or the clock (inject a clock and a writer).
- `scripts/check-gating-catch.mjs`: the `.catch` guard on gating hooks. `CLAUDE.md` "Testing strategy" item 4 names the band test.

## Goal

Show the active profiles in the band, record every verdict, and let the user read recent verdicts with `/gate-why`.

## Scope

- Band text from the active profile names; none active shows that.
- Log entry formatting as a pure function; the file write stays in `register.ts` (or a small adapter).
- Configurable log folder, default `logs`; add `logs` to `.gitignore` if missing.
- `/gate-why [n]`.

## Out of scope / later

A log with arguments (with credentials masked). Log rotation.

## Open questions

- Default n for `/gate-why`? Recommend 10.
- Log format: JSON lines (recommended, easy to parse) or text?

## Acceptance criteria

- [ ] The band lists the active profile names and updates after `/gate-on` and `/gate-off`.
- [ ] With no profile active, the band says so.
- [ ] Other mods' band content is kept.
- [ ] Each verdict adds one entry with exactly: timestamp, verdict, rule, profile, agent, tool name.
- [ ] No entry contains tool input (test with a Bash command holding a fake secret).
- [ ] `/gate-why` uses the default n, and honours an explicit n.
- [ ] A log write failure does not change the verdict to allow.
- [ ] The log folder is denied for Edit and Write.
- [ ] Tests use an injected clock and a temp folder.
- [ ] `npm run check` passes.

## How to start

First failing test: formatting a deny verdict for tool `Bash`, rule `Bash(git push *)`, profile `git-write` at a fixed time gives the expected line with no command text.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 04, Draft 05. Draft 01 for assumption 13.

## References

- [Decision log](../design.md#decision-log)
- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
