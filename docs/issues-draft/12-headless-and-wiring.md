# Shared decision path, tool hooks and headless behaviour

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax. The user switches profiles with `/gate-on` and `/gate-off`. **Subagents** get the baseline plus assigned profiles. **Headless runs** (`claude -p`, the SDK) take starting profiles from `MODE_GATE_PROFILES`; there, an ask that comes from the mod's own policy becomes a deny.

This is Draft 12 of 13 (plan: Draft 00). It connects the pure logic of Drafts 02 and 03 to the two gating hooks, `tool.call` and `tool.check`, and adds starting profiles and headless behaviour. Draft 04 (state and commands) comes first.

## Design decisions this issue relies on

- **Event shapes (verified, `docs/mods-api-notes.md` claims 4, 5, 7).**
  - `tool.call` carries `tool`, `tool_use_id?`, `agentId?` and the tool's arguments spread beside them (`e.command` for Bash). It returns `{ deny: string }` to refuse. Anything else must be the result of `next(e)`, which runs the rest of the chain and the tool. A hook that returns nothing is a failure.
  - `tool.check` carries `tool`, `input: unknown` (`{ command }` for Bash, `{ file_path, ... }` for file tools), `tool_use_id?`, `agentId?`. `next(e)` resolves to Claude Code's own verdict `{ decision, reason?, rule? }` and runs no tool. The hook returns `{ decision: 'allow' | 'ask' | 'deny', reason?, rule? }`. The input is pinned: a hook decides about the call, it does not change it.
- **The `call` object and the normalising step.** Two small pure functions in `hooks/gate.ts`, `callFromToolCall(e)` and `callFromToolCheck(e)`, convert the two event shapes into the one object every later step uses: `{ toolName, input, agentId?, toolCallId? }`. For `tool.call`, `input` is the event minus the envelope keys `tool`, `tool_use_id` and `agentId` (those are reserved). For `tool.check`, `input` is `e.input` if it is an object, otherwise `undefined` (then the Bash `command` is missing, which `decide` treats as malformed). `toolCallId` is `tool_use_id` when present. `agentId` is copied whenever the event carries one. They take structural types (no import of host types), so `gate.ts` stays free of host APIs.
- **Subagent rule.** Any call with an `agentId` is a subagent call, because the id is absent on the main loop. The id is also set for teammates and for the engine's own forks (compaction, memory), which carry ids no list names. They are all treated as subagents (baseline plus assignment, Draft 06). Draft 06 states the consequence. If the events never carry an id (assumption 2), every call counts as main-session and the subagent-Bash deny is inert: a documented limitation.
- **Shared decision path (this draft owns it).** One function in `hooks/gate.ts`, used by both hooks and by Draft 08's `/gate-explain`. It imports `hooks/policy.ts` only, uses no `$` and does no I/O. It receives everything else as arguments, so it is testable without a host:
  - the **effective set**, injected as a function of the call (for a main-session call: the baseline plus the active profiles; Draft 06 supplies the subagent case: `register.ts` passes a closure over `$.state` that wraps Draft 06's pure helper, while explain calls the helper with explicit lists);
  - a `withChain` option (default false; only explain sets it);
  - the loaded config, and the guard context `{ projectDir, homeDir, logDir, configPath }`: `projectDir` is `$.session.cwd()`, `homeDir` is `HOME`, else `USERPROFILE` of the environment object (`undefined` if neither is set), `logDir` and `configPath` come from the `loadConfig` result (both results carry them; `configPath` may be `undefined`). The path builds the context on every call from the config it is given, so a failed config still yields the default `logDir`;
  - the injected dependencies: a list of guard functions (Draft 05; none until then), an optional `resolved` input forwarded untouched to each guard (Draft 05 defines it), `redirectHint` (a stub returning `undefined` until Draft 05), `profileHint(decision, call)` (a stub returning `undefined` until Draft 06), `log(decision, call, sessionId?)` (a stub until Draft 07; the data flow is fixed: `register.ts` reads the session id from `$.session.id()` and the path passes it on), the `headless` flag and **Claude Code's verdict** `{ decision, reason?, rule? }`.
  - It calls each guard, calls `decide`, applies the headless conversion (below) and builds the hook result `{ verdict, message? }`. When `decide` reports `subagent-bash`, it puts `redirectHint(command)` in `message`; for any denied subagent call it puts the `profileHint` text there. It returns **both** the full decision (`verdict`, `source`, `rule?`, `profile?`, `message?`, plus `chain` only when `withChain` is set) and the hook result.
  - `log` and `redirectHint` can throw: the path computes the verdict first and wraps both in try/catch, so a throw never changes a verdict. The real `log` (Draft 07) also catches its own write errors.
  - It has no injection point for writes other than `log`. Draft 06's pending assignment record is written by `register.ts` after the path returns a non-deny verdict for an Agent call.
- **Result mapping in `register.ts`.**
  - `tool.check`: `const verdict = await next(e)` (Claude Code's own verdict), run the path, return `{ decision: verdict, reason: message, rule }`. A Claude Code deny comes back unchanged (Draft 03).
  - `tool.call`: `next(e)` would run the tool, so the hook cannot ask Claude Code. It runs the path with the stand-in verdict `{ decision: 'allow' }`. If the verdict is deny it returns `{ deny: message }`; otherwise it returns `next(e)`. It never returns an allow of its own, so it cannot bypass Claude Code's prompts. It logs only a deny.
  - `tool.check` logs every verdict it returns.
- **Fail closed per hook.** Both gating hooks register `.catch`. A hook that throws, overruns its 10 s budget (own code only) or answers a wrong shape is otherwise skipped and the call runs. The handler has 1 s and must return a constant. `tool.call`: `next.called ? next(e) : { deny: '<reason>' }`. `tool.check`: `{ decision: 'ask' }`, except that when `next.called` and Claude Code's verdict was a deny, that deny is returned. On re-entry (`next.error.kind === 're-entry'`: a `$` call that the hook itself makes raised the event beneath it, so the hook is not re-run and its `.catch` is asked), the handler passes the call through with `next(e)`, because it is the mod's own `$` call and not a model call; otherwise the mod would deny its own reads and writes. Whether such re-entry happens, and whether calling `next(e)` again in a handler returns the memoised answer, is spike row 19; follow its finding.
- **`check:catch` (task for this draft).** `scripts/check-gating-catch.mjs` scans for `$.on(` registrations and requires `.catch(` on them. The real shape is `on(event, matcher, hook)` inside `register`, so the pattern matches **zero** registrations and the script prints ok anyway. Fix the pattern for `on(event, matcher, hook)` and make the script fail when it finds zero gating registrations once `register.ts` has any hook. Alternatively replace it with `claude plugin validate`, which prints `gating hook with .catch:` or `gating hook without .catch:` per hook (`--json` lists them as `gatingHooks`). Tests first: write `tests/check-gating-catch.test.ts` against the not-yet-exported pure function, see it fail, then extract the function like `scripts/check-action-pins.mjs` (exported pure function, `.d.mts` typing file, thin main behind an `import.meta.url` guard). The gating events this mod registers are `tool.call`, `tool.check` and `command.run`.
- **Starting profiles.** `loadConfig` returns `startProfiles` (names from `MODE_GATE_PROFILES` that match a defined profile) in both results. `register.ts` reads the environment with `$.env.get("NAME")` and literal names only (`MODE_GATE_PROFILES`, `MODE_GATE_CONFIG`, `XDG_CONFIG_HOME`, `HOME`, `USERPROFILE`) and passes the object to `loadConfig`; the file reader is built on `$.fs` (Draft 02). Draft 04's start transition is extended: when `gate.started` is false, the config loads and `startProfiles` become `gate.active`. Because `started` becomes true, a hot reload (which re-fires `session.start`) and `/clear` (which has no `session.start`) never re-apply them, and a resume in a new process (`claude --resume`) starts with empty state and does apply them. A lazy load never applies them. On a failed config only the baseline is active. Unknown names are warnings shown by `/gate-status`.
- **Headless (this draft owns it).** `session.start` stores `gate.headless = !e.isInteractive` (`isInteractive` is false for `-p` and the SDK, where `surface` is `null`). Only `session.start` carries the flag, so it is stored every time. When the flag is set, an `ask` verdict becomes `deny`, but only when the `ask` came from the mod's own policy: decision `source` is `rule`, `guard`, `bash-downgrade` or `malformed`. A passed-through Claude Code ask (`claude-code`) stays `ask`, so Claude Code resolves it; otherwise every unmatched call (for example a native Read) would be denied. The conversion runs inside the shared path, so the full decision returned to the callers (logged by Draft 07, shown by Draft 08) already shows the deny. The message: for a main-session call, the available profiles (defined, not yet switched on) that would allow this call. To find them, run `decide` once per such profile with that profile added to the active set and list those whose decision is allow. If none, or if an ask guard fired, the message is generic: "no available profile allows this call". For a subagent call the `profileHint` text (Draft 06) replaces the list.
- Unverified assumptions (Draft 01): 2 (does `tool.check` still fire for a call `tool.call` denied; if so, Draft 07's dedupe makes one log entry), 16 (sibling imports in the packaged plugin), 19 (re-entry), 4 (test kit). If 4 fails, test the pure functions only and keep `register.ts` trivially thin.

## Existing code

- `hooks/register.ts`: holds Draft 04's registrations. Nothing may import it (`no-import-of-register`).
- `hooks/gate.ts`: does not exist yet; this draft creates it. Add it to the `entry` list in `knip.json` if knip reports it unused before `register.ts` imports it. In `.dependency-cruiser.cjs` add a rule that `hooks/gate.ts` imports only `hooks/policy.ts` (and types). `register.ts` is the only importer of host APIs.
- `vitest.config.ts` and `stryker.config.json`: add `hooks/gate.ts` to the coverage include list and the `mutate` list.
- `scripts/check-gating-catch.mjs`: no export, top-level `process.exit`, hard-coded path `hooks/register.ts`, pattern `$.on(`. `scripts/check-action-pins.mjs`, its `.d.mts` and `tests/check-action-pins.test.ts` are the model for a testable script.
- `hooks/hooks.json` (shape fixed by Draft 01: `{ "modules": ["./register.ts"] }`).

## Goal

Make the mod gate calls end to end: answer `tool.call` and `tool.check` through `decide`, fail closed, apply starting profiles once, and turn the mod's own asks into denies in headless runs.

## Scope

- The new module `hooks/gate.ts`: the shared path, the two event normalisers and the headless conversion with its message.
- `tool.call` and `tool.check` hooks in `register.ts` with their `.catch`, the result mapping, the environment object and the `$.fs` file reader, the `isInteractive` flag and the start extension for `startProfiles`.
- The `check:catch` fix described above.
- Gates for `gate.ts`: coverage include list (keep 95%), the Stryker `mutate` list, a dependency-cruiser rule.

## Out of scope / later

Real guards and `redirectHint` (Draft 05), subagent assignment and `profileHint` (Draft 06), the real `log` and the band (Draft 07), `/gate-explain` (Draft 08), the built-in profile contents (Draft 09).

## Acceptance criteria

Fail-closed tests inject a throwing dependency (a fake guard).

- [ ] `callFromToolCall` and `callFromToolCheck` are pure (table tests, no host types): a Bash `tool.call` event `{ tool: 'Bash', tool_use_id: 't1', command: 'ls' }` and a Bash `tool.check` event `{ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 't1' }` give the same `call` `{ toolName: 'Bash', input: { command: 'ls' }, toolCallId: 't1' }`. `agentId` is copied when present and absent otherwise; the envelope keys are not in `input`; a `tool.check` event with a non-object `input` gives an `input` that `decide` treats as malformed.
- [ ] `hooks/gate.ts` exists and holds the shared path; it imports only `hooks/policy.ts` (no `$`, no host API, no I/O), and `register.ts` only wires (`npm run arch` passes; a test calls the path directly with fakes, without `register.ts`).
- [ ] The path takes the effective set as an injected function of the call; a test injects a fake function and sees its set used. In the live wiring it is a closure over `$.state`; a subagent call is decided with the session's active set as a placeholder until Draft 06 injects its own function.
- [ ] The path takes a list of guard functions, calls each with the `call` and the guard context `{ projectDir, homeDir, logDir, configPath }` and forwards the optional `resolved` input untouched; their results go to `decide`; a stub guard returning nothing adds no result. The context holds `projectDir` from `$.session.cwd()`, `homeDir` from `HOME`, else `USERPROFILE`, and the `logDir` and `configPath` of the loaded config; with a failed config it still holds the default `logDir` and the resolved `configPath` (undefined if unresolved). A fake guard records the context (test).
- [ ] A call with any `agentId` is decided as a subagent call: a Bash call with no active allow rule is denied (`source` `subagent-bash`) with the text from the injected `redirectHint`; the same call without `agentId` is a main-session call. With a fake `profileHint` returning text, a denied subagent call carries that text in `message`.
- [ ] `tool.check` runs `next(e)` and passes its verdict to the path; the hook result is `{ decision, reason, rule }`, not `{ verdict, message }`. A Claude Code deny comes back unchanged with its `reason`.
- [ ] `tool.call` uses the stand-in verdict `allow`, returns `{ deny: message }` for a deny and the result of `next(e)` for anything else, and never returns an allow of its own.
- [ ] `tool.call` and `tool.check` give the same verdict for the same call (both use the shared path), except that `tool.call` reports only deny and cannot see a Claude Code deny.
- [ ] `tool.call`: a throwing dependency produces `{ deny }`, never allow or nothing (wiring test). `tool.check`: a throwing dependency produces `{ decision: 'ask' }` (wiring test), and a Claude Code deny that was already obtained is returned as deny.
- [ ] The `.catch` handlers return constants and handle `next.error.kind === 're-entry'` as specified (a test with a fake `next` carrying that error kind).
- [ ] A throwing `log` or `redirectHint` leaves the verdict unchanged, in both hooks: a deny stays deny, an allow stays allow (no error escapes to the `.catch`).
- [ ] The path calls the injected `log(decision, call, sessionId?)` with the session id from `$.session.id()`. `tool.call` calls it only for a deny, exactly once; an allow or ask from `tool.call` calls it zero times. `tool.check` calls it for every verdict it returns. A call that goes through both hooks reaches `log` with the same tool-call id both times (Draft 07's dedupe makes one entry).
- [ ] A path call with a no-op `log` writes nothing (a fake `log` records zero calls, and the verdict equals the one with the real `log`); the `headless` flag is an injected input, so the same call gives `deny` or `ask` as the flag says.
- [ ] The path takes a `withChain` option, default false. The live hooks never set it, so their decision has no `chain`; with it set, the decision carries `chain`, and the verdict, `source`, `rule`, `profile` and `message` are identical with and without it (test through the path).
- [ ] The path returns the full decision as well as the hook result `{ verdict, message? }`.
- [ ] `gate.ts` takes no dependency for writing assignment records (its only write-like dependency is `log`).
- [ ] `register.ts` reads the environment only with `$.env.get` and the five literal names; a test or `claude plugin validate` shows no other name.
- [ ] `MODE_GATE_PROFILES=git-write` activates `git-write` at the first `session.start` (state not started); a second `session.start` (hot reload) does not re-apply it after the user switched it off; after a reset (`/clear`) no profile is active, including one it started; a new process starts it again. An unknown name activates nothing and shows as a warning in `/gate-status`. A lazy load never applies it.
- [ ] `session.start` stores `gate.headless` from `isInteractive` (false means headless), every time it fires.
- [ ] Headless: an `ask` whose `source` is `rule`, `guard`, `bash-downgrade` or `malformed` becomes `deny` (one row per source: an unmatched Bash call that Claude Code would allow gives `bash-downgrade`; a Bash call with no `command` gives `malformed`), with a message naming the available (defined, not switched-on) profiles for which `decide`, run with that profile added to the active set, returns allow.
- [ ] Headless, and no available profile would allow the call (for example an ask guard, or a call no profile allows): the deny message is generic ("no available profile allows this call").
- [ ] Headless: a passed-through Claude Code `ask` (`source` `claude-code`, for example a native Read) stays `ask`.
- [ ] Headless: the conversion happens inside the shared path, so the full decision returned to the callers shows `deny` (not `ask`), with the message naming the available profile(s) or the generic message. Not headless: `ask` stays `ask`.
- [ ] If assumption 2 failed (no agent id), every call is decided as a main-session call, so the subagent-Bash deny is inert, and Draft 13's docs state the limitation.
- [ ] `check:catch`: `tests/check-gating-catch.test.ts` was written first against the unexported function and failed; the script now exports a pure function, has a `.d.mts` typing file and a thin main. Rows: a `register.ts` with `tool.call`, `tool.check` and `command.run` registrations that all have `.catch` passes; one without `.catch` fails; **a file with no recognisable registration fails** (zero registrations is an error once `register.ts` has hooks); the `on(event, matcher, hook)` shape is matched, and the old `$.on(` shape is not. `npm run check:catch` passes on the real `register.ts`.
- [ ] Gates: `hooks/gate.ts` is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it and still on the other listed modules) and in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold of 75); a dependency-cruiser rule makes it import only `policy.ts` (`npm run arch` passes); it uses no `$`.
- [ ] `npm run check` passes.

## How to start

First failing test: with fakes, a `tool.check` for `Bash` `git commit -m x` and Claude Code verdict `allow` returns `ask` (`bash-downgrade`) with no profile, and `allow` with an injected effective set that holds `Bash(git commit *)`. Second: a throwing injected guard yields `{ deny }` for `tool.call`.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

**Stop and ask** (used in this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and leave the work uncommitted.

## Depends on

Draft 02 (`loadConfig`), Draft 03 (`decide`), Draft 04 (state, reset and commands; this draft extends its start transition). Draft 01 for assumptions 2, 4, 16 and 19.

## References

- [Decision order](../design.md#decision-order)
- [Headless runs](../design.md#headless-runs)
- [Failure](../design.md#failure)
- [Code structure](../design.md#code-structure)
- [Events](../design.md#events)
- [API notes](../mods-api-notes.md)
