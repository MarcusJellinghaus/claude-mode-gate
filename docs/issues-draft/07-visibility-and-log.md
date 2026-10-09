# Band, /gate-why and decision log

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why [n]` (the last n verdicts with the rule and profile that fired), `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 07 of 13 (plan: Draft 00). It makes the gate visible so a forgotten profile cannot stay active unnoticed.

## Design decisions this issue relies on

- Data source: the shared decide path of Draft 12 returns the full decision (`verdict`, `source`, `rule?`, `profile?`) as well as the hook result. The log entries and `/gate-why` use the full decision. The band reads `gate.active` (profile names in switch-on order) from `$.state`. The `gate` state shape is defined in Draft 04; this draft uses `gate.active`, `gate.config`, `gate.logFailing` and `gate.seenIds`.
- Lifetimes: a profile switched on lasts the session; profiles are cleared when a session ends (Draft 04's reset, which is how `/clear` shows up) and never restored on resume. "The band shows profile names, so a forgotten profile stays visible."
- `ui.render` draws the active profiles in the band and keeps other mods' content.
- Decision log: the mod keeps the single file `<logDir>/mode-gate.log.jsonl`, where `logDir` comes from the `loadConfig` result (Draft 02: config key `logDir`, default `logs`, already resolved against the project directory, absolute allowed; the result carries it also when the config failed). Format: JSON Lines, one object per entry, with exactly these fields:
  - `time`: ISO 8601.
  - `verdict`, `source`: from the decision.
  - `rule`: the matched rule's raw string, or null.
  - `profile`: the profile name, `baseline` for baseline rules, or null.
  - `agent`: `call.agentId ?? "main"`. Draft 12 copies any agent id on the event into `call.agentId`; the main loop carries none. If assumption 2 fails, every call is `main`.
  - `tool`: the tool name.
  - `toolCallId`: only if the event carries one (needed for dedupe).
  - `session`: only if available. It comes from `$.session.id()`, read by the wiring per call and passed to `log` (the id changes on `/clear`, so it is not stored in state; Draft 01 row 20 confirms the new id after `/clear`).

  Tool arguments and command text are never stored, because they can hold secrets.

- **Writing (no Node, no append).** A mod has no Node `fs`. `$.fs.write(path, text)` creates the file and its folders but replaces the whole content, and a write over 4 MiB rejects. The real writer therefore reads the file (`$.fs.exists`, then `$.fs.read`), adds the new line in memory with the pure `appendLogLine(existingText, line, maxLines)` and writes the whole text back. `maxLines` is 1000: the oldest lines are dropped, so the log is a window of recent verdicts, not a full history, and the file stays far below 4 MiB (an entry is a few hundred bytes). A rejected write (including the cap) counts as a failed write. Two sessions that share the folder can lose entries to the read-modify-write race; this is documented, not fixed (KISS). The `$.fs` calls stay in `register.ts` behind an injected writer. The real `log` catches its own write errors and sets `gate.logFailing = true`; `/gate-status` (Draft 04) then shows `log: failing`. The next successful write sets it to false. Draft 12's shared path also wraps the `log` call, so any other throw is swallowed and never changes the verdict. A reset does not clear the flag, because the log file outlives the session's profiles.
- Dedupe state: the list of seen tool-call ids is `gate.seenIds` (per session, never a module variable), bounded to the last 200 ids. Without a tool-call id a call may be logged twice; this limit is documented.
- `/gate-why [n]` reads the log file with `$.fs.read`; default n is 10. n must be a positive integer; anything else (0, negative, non-numeric) prints usage and uses the default. If a session id is available, it shows only this session's last n entries; entries without a session id are excluded. If none is available (entries omit `session`), it shows the last n entries of all sessions and says so (concurrent sessions share the folder). It parses JSON Lines and skips malformed lines. An absent `rule` or `profile` is shown as `-`. The command is registered by this draft in the `session.start` hook (`$.command.register`, `immediate: true`) and served by `on('command.run', { command: 'gate-why' }, ...)` with the raw `e.args`, returning `{ text }`, with a `.catch` like Draft 04's commands.
- Band text above the prompt, from `gate.active`:

  | State                 | Text                              |
  | --------------------- | --------------------------------- |
  | No profile active     | `gate: baseline`                  |
  | Profiles active       | `gate: baseline + <names>`        |
  | Config failed to load | `gate: baseline (config invalid)` |

- The log folder is a protected path: the covered write tools are denied there (Draft 05, which takes `logDir` from the guard context Draft 12 passes), so Claude cannot erase its own trail. The mod's own `$.fs.write` is not a model tool call; whether it raises the tool hooks beneath the logging hook is spike row 19, and Draft 12's re-entry handling covers it.
- **This draft owns the real `log(decision, call, sessionId?)`** (exact signature open) that plugs into the injected stub of Draft 12's shared decide path, the single logging point. `tool.call` calls it only for a deny; `tool.check` calls it for every verdict it returns. If both hooks fire for one call (Draft 01's finding on assumption 2), `log` writes one entry per tool-call id when the event carries one. Without a tool-call id it cannot deduplicate and may write two entries.
- The `call` is `{ toolName, input, agentId?, toolCallId? }`, built by Draft 12. `log` writes only `toolName`, `agentId` and `toolCallId` from it, never `input`. The session id comes from the shared path as a separate argument.
- Failure: every gating hook fails closed. The verdict is computed first, so a logging error must not turn a deny into an allow (see Writing above).
- **Pure module.** The pure parts live in the new module `hooks/log-format.ts`: `formatLogEntry` (decision, call, session id and an injected time in, one JSON line out; it writes only `toolName`, `agentId` and `toolCallId` from the call, never `input`), `appendLogLine`, the `/gate-why` parsing and selection (JSON Lines text, `n` and the session id in; the lines to show, the usage note and the "all sessions" note out; malformed lines skipped), the dedupe step on `seenIds` (id and the list in, whether to write and the bounded list out) and the band text from the table above. It uses no `$` and no I/O and imports only types from `hooks/policy.ts`. Exact signatures are decided test-first.
- Unverified: assumption 13 (a mod can draw below the entry box). If it fails, the band stays above the prompt. Assumption 19 (re-entry of `$` calls). Assumption 16 (sibling imports in the packaged plugin) is needed for `register.ts` to import `log-format.ts`. Assumption 17 (file access through `$.fs`) is verified.

## Existing code

- `hooks/register.ts`: wiring with Draft 04's and Draft 12's hooks; this draft adds `ui.render`, the `/gate-why` command and the real writer. `hooks/policy.ts`: pure; `decide` (Draft 03) returns the rule and profile needed for log entries, and Draft 12's shared decide path passes the full decision on to the log.
- `types/index.d.ts`: `PluginState` (Draft 04). `tests/`: vitest; tests must not touch the real `~/.claude`, the network or the clock (inject a clock and a writer).
- `CLAUDE.md` "Testing strategy" item 4 names the band test.

## Goal

Show the active profiles in the band, record every verdict, and let the user read recent verdicts with `/gate-why`.

## Scope

- Band text from the active profile names and the config state (see the table above).
- The real `log(decision, call, sessionId?)` with dedupe by tool-call id in `gate.seenIds` and the bounded read-append-rewrite writer on `$.fs`.
- Log entry formatting, `appendLogLine`, `/gate-why` line parsing and selection, the dedupe step and the band text as pure functions in the new module `hooks/log-format.ts` (see **Pure module**); the `$.fs` calls stay in `register.ts`.
- Gates for `hooks/log-format.ts`: add it to the coverage include list in `vitest.config.ts` (keep the 95% thresholds) and to the `mutate` list in `stryker.config.json`, and add a dependency-cruiser rule so it imports only types from `hooks/policy.ts` (same pattern as `hooks/guards.ts` in Draft 05).
- Log folder read from the `logDir` of the `loadConfig` result (no separate setting); add `logs` to `.gitignore` if missing.
- `gate.logFailing`: set by `log` on a failed write, cleared on the next successful write, not reset by a session reset, and read by `/gate-status` (one line added in Draft 04).
- `/gate-why [n]`.

## Out of scope / later

A log with arguments (with credentials masked). Log rotation to files. Appending without rewriting (no API for it).

## Acceptance criteria

- [ ] With profiles active, the band reads `gate: baseline + <names>` in switch-on order, and updates after `/gate-on` and `/gate-off`.
- [ ] With no profile active, the band reads `gate: baseline`; with a failed config it reads `gate: baseline (config invalid)`.
- [ ] Other mods' band content is kept.
- [ ] The log file is `<logDir>/mode-gate.log.jsonl`. Each verdict adds one line of JSON with exactly the fields `time`, `verdict`, `source`, `rule`, `profile`, `agent`, `tool`, plus `toolCallId` only if the event carries one and `session` only if the API provides one. `rule` and `profile` are null when absent; `profile` is `baseline` for a baseline rule; `agent` is `main` for a call with no agent id, otherwise the agent id.
- [ ] `appendLogLine(existingText, line, maxLines)` is pure: it appends one line, keeps earlier lines unchanged and in order, handles empty text and text without a trailing newline, and with more than `maxLines` lines keeps only the newest `maxLines` (table test, including exactly `maxLines`, one more, and a malformed old line, which is kept or dropped as an ordinary line).
- [ ] The writer reads the existing file (a missing file counts as empty), writes the whole text back with `$.fs.write`, and a missing `logDir` is created by that write; a test with a fake `$.fs` checks the sequence and that earlier lines stay unchanged.
- [ ] A call that reaches `log` from both `tool.call` (deny) and `tool.check` with the same tool-call id adds exactly one entry; a `tool.call` deny alone adds one entry.
- [ ] `gate.seenIds` holds at most the last 200 ids (the 201st id evicts the oldest). Calls without a tool-call id are not deduplicated.
- [ ] No entry contains tool input (test with a Bash command holding a fake secret).
- [ ] `/gate-why` uses n = 10 by default, and honours an explicit positive integer n.
- [ ] `/gate-why 0`, `/gate-why -3` and `/gate-why abc` print usage and show the default 10 entries.
- [ ] When a session id is available, `/gate-why` shows only this session's entries (the session id from `$.session.id()`, passed to `log` as `sessionId`). Without one, entries omit `session` and `/gate-why` shows the last n of all sessions and says so. It skips malformed lines and shows an absent rule or profile as `-`.
- [ ] With a session id available, `/gate-why` excludes entries that have no `session` field (a log with old or foreign entries without one).
- [ ] A failing file write (including a rejected over-size write) sets `gate.logFailing` (the real `log` catches the error itself), does not change the verdict and lets no error escape; `/gate-status` then shows `log: failing`.
- [ ] A `log` that throws for another reason is swallowed by the shared path (Draft 12): a deny stays deny and no error escapes.
- [ ] `gate.logFailing` is cleared by the next successful write, and a reset leaves it set (test: fail a write, `session.end`, `/gate-status` still shows `log: failing`; then a successful write clears it).
- [ ] The log is written to the `logDir` of the `loadConfig` result: `logs` by default, a custom relative or absolute value when set, and `logs` also when the config failed to load.
- [ ] The log folder is denied for the covered write tools (`Edit`, `Write` and the mcp-workspace write tools; also a custom `logDir`, via the guard context).
- [ ] `/gate-why` is registered with `immediate: true` and has a `.catch` that returns an error `{ text }`.
- [ ] Tests use an injected clock and a fake `$.fs`.
- [ ] Gates: `hooks/log-format.ts` holds the pure formatting, bounded append, parsing, dedupe and band functions with no `$` and no I/O; it is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it and still on the other listed modules), in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold of 75), and a dependency-cruiser rule makes it import only types from `hooks/policy.ts` (`npm run arch` passes). The tests of the log entry, `/gate-why` and band criteria above call it directly.
- [ ] Documentation criteria that Draft 13's README text must satisfy: the log is a window of the last 1000 verdicts, two sessions sharing a folder can lose entries, and no arguments are recorded.
- [ ] `npm run check` passes.

## How to start

First failing test: formatting a deny verdict for tool `Bash`, rule `Bash(git push *)`, profile `git-write` at a fixed time gives the expected line with no command text.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 04, Draft 05, Draft 12. Draft 01 for assumptions 13, 16, 19 and 20.

## References

- [Decision log](../design.md#decision-log)
- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
- [API notes](../mods-api-notes.md)
