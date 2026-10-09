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
  - `rule`: the matched rule's raw string for the mod-sourced sources (`rule`, `guard`, `bash-downgrade`; only where `decide` set one), and **null for source `claude-code`** and for every source without a mod rule. Claude Code's own rule string can hold secrets (an "always allow" click can store a full command with a token), which would contradict "arguments are never stored". With Draft 03's reporting order, a decision where a guard result and a rule both apply is reported as `source` `guard`, so its entry has `rule` null and `profile` null.
  - `profile`: the profile name, `baseline` for baseline rules, or null.
  - `agent`: `call.agentId ?? "main"`. Draft 12 copies any agent id on the event into `call.agentId`; the main loop carries none. If assumption 2 fails, every call is `main`.
  - `tool`: the tool name.
  - `toolCallId`: only if the event carries one (needed for dedupe).
  - `session`: only if available. It comes from `$.session.id()`, read by the wiring per call and passed to `log` (the id changes on `/clear`, so it is not stored in state; Draft 01 row 20 confirms the new id after `/clear`).

  Tool arguments and command text are never stored, because they can hold secrets.

- **Writing (no Node, no append).** A mod has no Node `fs`. `$.fs.write(path, text)` creates the file and its folders but replaces the whole content, and a write over 4 MiB rejects. The real writer therefore reads the file (`$.fs.exists`, then `$.fs.read`), adds the new line in memory with the pure `appendLogLine(existingText, line, maxLines)` and writes the whole text back. `maxLines` is 1000: the oldest lines are dropped, so the log is a window of recent verdicts, not a full history, and the file stays far below 4 MiB (an entry is a few hundred bytes). A rejected write (including the cap) counts as a failed write. Within **one** session, parallel tool calls run their hooks concurrently, and a read-modify-write across awaits would drop entries. So the writer serialises log writes in-process: a module-level promise chain in `register.ts` (each write is chained after the previous one, and a failed write does not break the chain). It holds no state that must survive a hot reload, so a module variable is fine here. Two sessions that share the folder can still lose entries to the read-modify-write race; this is documented, not fixed (KISS). The `$.fs` calls stay in `register.ts` behind an injected writer. The real `log` catches its own write errors and sets `gate.logFailing = true`; `/gate-status` (Draft 04) then shows `log: failing`. The next successful write sets it to false. Draft 12's shared path also wraps the `log` call, so any other throw is swallowed and never changes the verdict. A reset does not clear the flag, because the log file outlives the session's profiles.
- Dedupe state: the list of seen tool-call ids is `gate.seenIds` (per session, never a module variable), bounded to the last 200 ids. Without a tool-call id a call may be logged twice; this limit is documented. Writes to `gate.seenIds` and `gate.logFailing` follow Draft 04's state-write rule (re-read `gate` right before the set, no `await` between, change only that field), because log writes run concurrently with other hooks.
- `/gate-why [n]` reads the log file with `$.fs.read`; default n is 10. n must be a positive integer; anything else (0, negative, non-numeric) prints usage and uses the default. If a session id is available, it shows only this session's last n entries; entries without a session id are excluded. If none is available (entries omit `session`), it shows the last n entries of all sessions and says so (concurrent sessions share the folder). It parses JSON Lines and skips malformed lines. An absent `rule` or `profile` is shown as `-`. The command is registered by this draft **inside the single `session.start` hook** that Draft 04 owns and Draft 12 extends (one more `await $.command.register({ name: 'gate-why', ..., immediate: true })` call there; a second `on('session.start')` registration of the same pattern throws, mods-api-notes claim 9, and the module would fail to load). It is served by `on('command.run', { command: 'gate-why' }, ...)` with the raw `e.args`, returning `{ text }`, with a `.catch` like Draft 04's commands.
- **`/gate-why` output (pinned; Draft 13's README copies it).** The first line is `Last <k> verdicts (this session):` or `Last <k> verdicts (all sessions):`, where `<k>` is the number of lines shown (at most n; `Last 1 verdicts` is not special-cased). Then one line per entry, oldest first: `<time> <verdict> <tool> source=<source> rule=<rule or -> profile=<profile or -> agent=<agent>`. With no entry the text is `No verdicts logged yet.` Example:

  ```text
  Last 2 verdicts (this session):
  2026-10-09T10:15:00.000Z ask Bash source=bash-downgrade rule=- profile=- agent=main
  2026-10-09T10:15:07.000Z allow Bash source=rule rule=Bash(git commit *) profile=git-write agent=main
  ```

  For an invalid n (0, negative, non-numeric) the text starts with the line `Usage: /gate-why [n]  (n is a positive integer, default 10)` and continues with the default 10 entries as above.

- Band text above the prompt, from `gate.active`:

  | State                     | Text                              |
  | ------------------------- | --------------------------------- |
  | No profile active         | `gate: baseline`                  |
  | Profiles active           | `gate: baseline + <names>`        |
  | Config failed to load     | `gate: baseline (config invalid)` |
  | Config not loaded (unset) | `gate: baseline`                  |

  `gate.config` is unset after the session-end reset until the next lazy load. An unset config shows `gate: baseline` (the band does not trigger the load); `(config invalid)` is shown only for a load that **failed** (`ok: false`). `gate.active` is empty then anyway.

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
- [ ] Band test after `session.end`: with `gate.config` unset (not yet lazily reloaded) the band reads `gate: baseline`, not `(config invalid)`; after a lazy load that fails it reads `(config invalid)`.
- [ ] Other mods' band content is kept.
- [ ] The log file is `<logDir>/mode-gate.log.jsonl`. Each verdict adds one line of JSON with exactly the fields `time`, `verdict`, `source`, `rule`, `profile`, `agent`, `tool`, plus `toolCallId` only if the event carries one and `session` only if the API provides one. `rule` and `profile` are null when absent; `profile` is `baseline` for a baseline rule; `agent` is `main` for a call with no agent id, otherwise the agent id.
- [ ] `appendLogLine(existingText, line, maxLines)` is pure: it appends one line, keeps earlier lines unchanged and in order, handles empty text and text without a trailing newline, and with more than `maxLines` lines keeps only the newest `maxLines` (table test, including exactly `maxLines`, one more, and a malformed old line, which is kept or dropped as an ordinary line).
- [ ] The writer reads the existing file (a missing file counts as empty), writes the whole text back with `$.fs.write`, and a missing `logDir` is created by that write; a test with a fake `$.fs` checks the sequence and that earlier lines stay unchanged.
- [ ] Writes are serialised in-process: two overlapping `log` calls against a fake `$.fs` that yields between the read and the write both end up in the file (no lost entry); a failed first write does not stop the second.
- [ ] A call that reaches `log` from both `tool.call` (deny) and `tool.check` with the same tool-call id adds exactly one entry; a `tool.call` deny alone adds one entry.
- [ ] `gate.seenIds` holds at most the last 200 ids (the 201st id evicts the oldest). Calls without a tool-call id are not deduplicated.
- [ ] No entry contains tool input (test with a Bash command holding a fake secret).
- [ ] The `rule` field holds the raw rule only for mod-sourced sources: a `rule` decision from `Bash(git commit *)` logs `rule` `Bash(git commit *)`; a decision with source `claude-code` logs `rule` null even when Claude Code supplied a rule string. Test: a fake Claude Code deny whose `rule` is `Bash(curl -H "Authorization: Bearer FAKE-SECRET-123" *)` produces an entry that contains neither the string `FAKE-SECRET-123` nor any `rule` text (`rule` is null); the same string never appears anywhere in the entry or in `/gate-why` output.
- [ ] `register()` makes exactly one `session.start` registration: a wiring test with a fake `on` that throws on a repeated pattern (as the real engine does) calls `register()` and sees one `session.start` registration, and that single hook registers `gate-on`, `gate-off`, `gate-status`, `gate-check`, `gate-why` and `gate-explain` (once Draft 08 has landed) with `$.command.register`.
- [ ] `/gate-why` output is exactly the pinned text above (table test on the pure formatter in `hooks/log-format.ts`: this session, all sessions, one entry, no entries, an invalid n with the usage line, a `-` for an absent rule or profile). The README examples of Draft 13 are copied from this test's fixture.
- [ ] The pinned example output lives in `tests/fixtures/readme-gate-why.txt` (`tests/fixtures/readme-<command>.txt`), is used by the command's own test, and is read by `tests/readme-examples.test.ts` (Draft 13).
- [ ] `/gate-why` uses n = 10 by default, and honours an explicit positive integer n.
- [ ] `/gate-why 0`, `/gate-why -3` and `/gate-why abc` print usage and show the default 10 entries.
- [ ] When a session id is available, `/gate-why` shows only this session's entries (the session id from `$.session.id()`, passed to `log` as `sessionId`). Without one, entries omit `session` and `/gate-why` shows the last n of all sessions and says so. It skips malformed lines and shows an absent rule or profile as `-`.
- [ ] With a session id available, `/gate-why` excludes entries that have no `session` field (a log with old or foreign entries without one).
- [ ] A failing file write (including a rejected over-size write) sets `gate.logFailing` (the real `log` catches the error itself), does not change the verdict and lets no error escape; `/gate-status` then shows `log: failing`.
- [ ] A `log` that throws for another reason is swallowed by the shared path (Draft 12): a deny stays deny and no error escapes.
- [ ] `gate.logFailing` is cleared by the next successful write, and a reset leaves it set (test: fail a write, `session.end`, `/gate-status` still shows `log: failing`; then a successful write clears it).
- [ ] The log is written to the `logDir` of the `loadConfig` result: `logs` by default, a custom relative or absolute value when set, and `logs` also when the config failed to load.
- [ ] The log folder is denied for the covered write tools (`Edit`, `Write` and the mcp-workspace write tools; also a custom `logDir`, via the guard context).
- [ ] `/gate-why` is registered with `immediate: true`, inside the single `session.start` hook, and has a `.catch` that returns an error `{ text }`.
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
