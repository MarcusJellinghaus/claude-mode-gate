# Band, /gate-why and decision log

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why [n]` (the last n verdicts with the rule and profile that fired), `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 07 of 11 (plan: Draft 00). It makes the gate visible so a forgotten profile cannot stay active unnoticed.

## Design decisions this issue relies on

- Data source: the shared decide path of Draft 04 returns the full decision (`verdict`, `source`, `rule?`, `profile?`) as well as the hook result. The log entries and `/gate-why` use the full decision. The band reads `gate.active` (profile names in switch-on order) from `$.state`. The `gate` state shape is defined in Draft 04; this draft uses `gate.active`, `gate.config`, `gate.sessionId`, `gate.logFailing` and `gate.seenIds`.
- Lifetimes: a profile switched on lasts the session; profiles are cleared on `/clear` and never restored on resume (profiles from an earlier session do not come back). "The band shows profile names, so a forgotten profile stays visible."
- `ui.render` draws the active profiles in the band and keeps other mods' content.
- Decision log: the mod appends to the single file `<logDir>/mode-gate.log.jsonl`, where `logDir` comes from the `loadConfig` result (Draft 02: config key `logDir`, default `logs`, already resolved against the project directory, absolute allowed; the result carries it also when the config failed). Format: JSON Lines, one object per entry, with exactly these fields:
  - `time`: ISO 8601.
  - `verdict`, `source`: from the decision.
  - `rule`: the matched rule's raw string, or null.
  - `profile`: the profile name, `baseline` for baseline rules, or null.
  - `agent`: `main` whenever Draft 04's subagent rule says the call is not a subagent call (a main-session id the event may carry is not used), otherwise the agent id. Draft 04 sets `call.agentId` only for a subagent call, so this is `call.agentId ?? "main"`. If assumption 2 fails, every call is `main`.
  - `tool`: the tool name.
  - `toolCallId`: only if the event carries one (needed for dedupe).
  - `session`: only if a session id is available. Its source is the `session.start` event or a field on the hook events (Draft 01's spike notes which); Draft 04 records it as `gate.sessionId` and passes it to `log`.

  Tool arguments and command text are never stored, because they can hold secrets.

- Writing: the mod creates `logDir` recursively if missing and appends one line per entry (one write per entry) itself with Node's `fs` (assumption 17; Draft 01 records how the mod gets the file system, and if it is a host file API on `$` instead, `register.ts` uses that behind the same injected writer), not through a tool call. The real `log` catches its own write errors and sets `gate.logFailing = true`; `/gate-status` (Draft 04) then shows `log: failing`. The next successful write sets it to false. Draft 04's shared path also wraps the `log` call, so any other throw is swallowed and never changes the verdict. `/clear` does not reset it, because the log file outlives the session's profiles.
- Dedupe state: the set of seen tool-call ids is `gate.seenIds` (per session, never a module variable), bounded to the last 200 ids. Without a tool-call id a call may be logged twice; this limit is documented.
- `/gate-why [n]` reads the log file; default n is 10. n must be a positive integer; anything else (0, negative, non-numeric) prints usage and uses the default. If a session id is available, it shows only this session's last n entries; entries without a session id are excluded. If none is available (entries omit `session`), it shows the last n entries of all sessions and says so (concurrent sessions share the folder). It parses JSON Lines and skips malformed lines. An absent `rule` or `profile` is shown as `-`. Replay (Draft 08) uses session transcripts, not the log.
- Band text above the prompt, from `gate.active`:

  | State                 | Text                              |
  | --------------------- | --------------------------------- |
  | No profile active     | `gate: baseline`                  |
  | Profiles active       | `gate: baseline + <names>`        |
  | Config failed to load | `gate: baseline (config invalid)` |

- The log folder is a protected path: the covered write tools are denied there (Draft 05, which takes `logDir` from the guard context Draft 04 passes), so Claude cannot erase its own trail.
- **This draft owns the real `log(decision, call, sessionId?)`** (exact signature open) that plugs into the injected stub of Draft 04's shared decide path, the single logging point. `tool.call` calls it only for a deny; `tool.check` calls it for every verdict it returns. If both hooks fire for one call (Draft 01's finding on assumption 2), `log` writes one entry per tool-call id when the event carries one. Without a tool-call id it cannot deduplicate and may write two entries.
- The `call` is `{ toolName, input, agentId?, toolCallId? }` (the tool name, the tool input, the agent id only for a subagent call, the tool-call id when the event carries one), built by Draft 04. `log` writes only `toolName`, `agentId` and `toolCallId` from it, never `input`. The session id comes from the shared path as a separate argument (read from `gate.sessionId`, where Draft 04 recorded it at `session.start`), not from `call`.
- Failure: every gating hook fails closed. The verdict is computed first, so a logging error must not turn a deny into an allow (see Writing above).
- **Pure module.** The pure parts live in the new module `hooks/log-format.ts`: `formatLogEntry` (decision, call, session id and an injected time in, one JSON line out; it writes only `toolName`, `agentId` and `toolCallId` from the call, never `input`), the `/gate-why` parsing and selection (JSON Lines text, `n` and the session id in; the lines to show, the usage note and the "all sessions" note out; malformed lines skipped), the dedupe step on `seenIds` (id and the list in, whether to write and the bounded list out) and the band text from the table below. It uses no `$` and no I/O and imports only types from `hooks/policy.ts`. The `fs` calls (create the folder, append, read the file) stay in `register.ts` or a small adapter that is injected into `log`; exact signatures are decided test-first.
- Unverified: assumption 13 (a mod can draw below the entry box). If it fails, the band stays above the prompt. Assumption 5 (state per session) affects `gate.seenIds` and `gate.logFailing`. Assumption 17 (file system access) is needed for the log and for `/gate-why`; if it failed, follow Draft 01's fallback and stop and ask first. Assumption 16 (sibling imports) is needed for `register.ts` to import `log-format.ts`.

## Existing code

- `hooks/register.ts`: wiring stub with the `ui.render` event to add; `hooks/policy.ts`: pure; `decide` (Draft 03) returns the rule and profile needed for log entries, and Draft 04's shared decide path passes the full decision on to the log.
- `types/index.d.ts`: declarations after Draft 01. `tests/`: vitest; tests must not touch the real `~/.claude`, the network or the clock (inject a clock and a writer).
- `scripts/check-gating-catch.mjs`: the `.catch` guard on gating hooks. `CLAUDE.md` "Testing strategy" item 4 names the band test.

## Goal

Show the active profiles in the band, record every verdict, and let the user read recent verdicts with `/gate-why`.

## Scope

- Band text from the active profile names and the config state (see the table above).
- The real `log(decision, call, sessionId?)` with dedupe by tool-call id in `gate.seenIds`.
- Log entry formatting, `/gate-why` line parsing and selection, the dedupe step and the band text as pure functions in the new module `hooks/log-format.ts` (see **Pure module**); the file write stays in `register.ts` (or a small adapter).
- Gates for `hooks/log-format.ts`: add it to the coverage include list in `vitest.config.ts` (keep the 95% thresholds) and to the `mutate` list in `stryker.config.json`, and add a dependency-cruiser rule so it imports only types from `hooks/policy.ts` (same pattern as `hooks/guards.ts` in Draft 05).
- Log folder read from the `logDir` of the `loadConfig` result (no separate setting); add `logs` to `.gitignore` if missing.
- `gate.logFailing`: set by `log` on a failed write, cleared on the next successful write, not reset by `/clear`, and read by `/gate-status` (one line added in Draft 04).
- `/gate-why [n]`, registered by this draft (Draft 04 registers the other commands except `/gate-explain`, which Draft 08 registers).

## Out of scope / later

A log with arguments (with credentials masked). Log rotation.

## Acceptance criteria

- [ ] With profiles active, the band reads `gate: baseline + <names>` in switch-on order, and updates after `/gate-on` and `/gate-off`.
- [ ] With no profile active, the band reads `gate: baseline`; with a failed config it reads `gate: baseline (config invalid)`.
- [ ] Other mods' band content is kept.
- [ ] The log file is `<logDir>/mode-gate.log.jsonl`. Each verdict adds one line of JSON with exactly the fields `time`, `verdict`, `source`, `rule`, `profile`, `agent`, `tool`, plus `toolCallId` only if the event carries one and `session` only if the API provides one. `rule` and `profile` are null when absent; `profile` is `baseline` for a baseline rule; `agent` is `main` for every call that is not a subagent call (also when the event carries a main-session id), otherwise the agent id.
- [ ] A missing `logDir` is created recursively on the first write; entries are appended and earlier lines stay unchanged.
- [ ] A call that reaches `log` from both `tool.call` (deny) and `tool.check` with the same tool-call id adds exactly one entry; a `tool.call` deny alone adds one entry.
- [ ] `gate.seenIds` holds at most the last 200 ids (the 201st id evicts the oldest). Calls without a tool-call id are not deduplicated.
- [ ] No entry contains tool input (test with a Bash command holding a fake secret).
- [ ] `/gate-why` uses n = 10 by default, and honours an explicit positive integer n.
- [ ] `/gate-why 0`, `/gate-why -3` and `/gate-why abc` print usage and show the default 10 entries.
- [ ] When a session id is available, `/gate-why` shows only this session's entries (the session id is `gate.sessionId`, passed to `log` as `sessionId`). Without one, entries omit `session` and `/gate-why` shows the last n of all sessions and says so. It skips malformed lines and shows an absent rule or profile as `-`.
- [ ] With a session id available, `/gate-why` excludes entries that have no `session` field (a log with old or foreign entries without one).
- [ ] A failing file write sets `gate.logFailing` (the real `log` catches the error itself), does not change the verdict and lets no error escape; `/gate-status` then shows `log: failing`.
- [ ] A `log` that throws for another reason is swallowed by the shared path (Draft 04): a deny stays deny and no error escapes.
- [ ] `gate.logFailing` is cleared by the next successful write, and `/clear` leaves it set (test: fail a write, `/clear`, `/gate-status` still shows `log: failing`; then a successful write clears it).
- [ ] The log is written to the `logDir` of the `loadConfig` result: `logs` by default, a custom relative or absolute value when set, and `logs` also when the config failed to load.
- [ ] The log folder is denied for the covered write tools (`Edit`, `Write` and the mcp-workspace write tools; also a custom `logDir`, via the guard context).
- [ ] Tests use an injected clock and a temp folder.
- [ ] Gates: `hooks/log-format.ts` holds the pure formatting, parsing, dedupe and band functions with no `$` and no I/O; it is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it and still on the other listed modules), in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold of 75), and a dependency-cruiser rule makes it import only types from `hooks/policy.ts` (`npm run arch` passes). The tests of the log entry, `/gate-why` and band criteria above call it directly.
- [ ] `npm run check` passes.

## How to start

First failing test: formatting a deny verdict for tool `Bash`, rule `Bash(git push *)`, profile `git-write` at a fixed time gives the expected line with no command text.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 04, Draft 05. Draft 01 for assumptions 13, 16 and 17.

## References

- [Decision log](../design.md#decision-log)
- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
