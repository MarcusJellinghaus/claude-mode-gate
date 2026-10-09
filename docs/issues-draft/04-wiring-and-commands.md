# Wiring and /gate-on, /gate-off, /gate-status

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`, and inspects with `/gate-status`, `/gate-why [n]`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES`.

This is Draft 04 of 11 (plan: Draft 00). It connects the pure logic of Drafts 02 and 03 to Claude Code.

## Design decisions this issue relies on

- Events: `session.start` loads the config, applies the starting profiles from `startProfiles` when its reason says so (see **Starting profiles**) and registers commands. `command.run` switches profiles and redraws the band, registered with `immediate: true`. `tool.call` and `tool.check` both use one shared decision path (below). `ui.render` draws the band (Draft 07).
- **The `call` object.** The path builds one `call` from the hook event: `{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input (such as the Bash command or the file path), the agent id if the event carries one, and the tool-call id if the event carries one (both ids are optional and depend on Draft 01's findings). The same object goes to the guards, to `decide` (Draft 03) and to `log` (Draft 07).
- **Shared decision path (this draft owns it).** One function in `register.ts` used by both `tool.call` and `tool.check`: it builds the active set from `$.state`, gets Claude Code's own verdict as assumption 7 of `docs/design.md` describes (unavailable means `ask`, Draft 03), calls `decide` and builds the hook result. It takes its side-effect dependencies by **injection**: a list of guard functions (Draft 05; stubs return nothing until then), `redirectHint` (a stub that returns `undefined` until Draft 05), `log(decision, call)` (a stub until Draft 07 plugs in the real log) and a `headless` flag (see **Headless**). Draft 08's `/gate-explain` reuses the path with a no-op `log` and the session's real headless state, so a dry run never writes to the decision log and shows the verdict the real call would get. The path calls each guard function with the `call` and a **guard context** `{ projectDir, homeDir, logDir, configPath }`, and passes their results to `decide` (the guard results of Draft 03's input). The context holds the resolved values: `projectDir` is the session's working directory, recorded in `$.state` at `session.start` (the working directory of the mod process, unless the hook event offers a better field; Draft 01 notes it if it does, with no new assumption row), and also passed to `loadConfig` as `cwd`; `homeDir` comes from the injected environment (`HOME`, else `USERPROFILE`, like Draft 02's loader; `undefined` if neither is set); `logDir` and `configPath` come from the `loadConfig` result (both results carry them; `configPath` may be `undefined`). Draft 05 uses it to protect the log folder and the config file. The path builds the context on every call from the config in `$.state`, so a failed config still yields the default `logDir`. This draft does not import `hooks/guards.ts`, which Draft 05 creates. It also builds the **agent context** for `decide` from the hook event (assumption 2; Draft 01 verifies it). **Rule:** a call is a subagent call only when the event carries an agent id that identifies a subagent; every other call is a main-session call. When `decide` reports `source` = `subagent-bash`, it puts `redirectHint(command)` in the result's `message`. Draft 05 plugs in the real guards and the real `redirectHint`, and adds the wiring test for that message. The profile hint added to denials (telling the subagent which profile would be needed) is owned by Draft 06; until then denials carry only the redirect text and the headless message.
  - **Subagents until Draft 06.** The subagent-Bash deny (decision-order step 1, in `decide`, Draft 03) works from this draft on, with the stub hint text. Other subagent calls use the session's active set as a placeholder, which Draft 06 replaces: there a subagent's effective set is the baseline, its assigned profiles' rules and the main session's active profiles' deny and ask lists (the baseline plus those lists when no assignment is recorded). Call it out in the PR.
  - **No agent id, or no way to tell the sessions apart.** If assumption 2 fails (no agent id on the event, or main-session and subagent calls are not distinguishable), every call counts as main-session, so the subagent-Bash deny is inert. This is a documented limitation (README and PR). Draft 01's stop-and-report rule covers the design.
  - **Single logging point.** The path calls `log(decision, call)` and nothing else logs. `tool.call` calls it only when the path returns a deny; `tool.check` calls it for every verdict it returns. If both hooks can fire for one call (Draft 01's finding on assumption 2: `tool.check` fires after a `tool.call` deny), Draft 07's `log` deduplicates by the tool-call id when the event carries one. Draft 07 owns the real `log` and the dedupe. **A throwing `log` (or a throwing `redirectHint`) is swallowed and never changes the verdict:** the path computes the verdict first and wraps the `log` call in a try/catch.
  - **It returns both** the full decision (`verdict`, `source`, `rule?`, `profile?`, the `decide` output of Draft 03) and the hook result `{ verdict, message? }`. Draft 07 (log, `/gate-why`) and Draft 08 (`/gate-explain`) use the full decision; the hooks use the hook result.
  - **Hook verdicts.** The `tool.call` hook returns only deny or nothing, never allow, so it cannot bypass Claude Code's own prompts. The `tool.check` hook may return allow, ask or deny. Both come from the one decide path; `tool.call` drops an allow or ask.
  - **Fail closed per hook.** The `.catch` of `tool.call` returns deny, because that hook can only deny or return nothing, so an ask would fail open. The `.catch` of `tool.check` returns ask.
- Commands, registered by this draft: `/gate-on`, `/gate-off`, `/gate-status` and `/gate-check` (a thin wrapper around the Draft 02 validator; it re-reads and validates the config without applying it, and lists project proposals). Draft 07 registers `/gate-why`, Draft 08 registers `/gate-explain`.
  - `/gate-on <profile>...` switches profiles on and prints a short summary of what they allow. `all` and `baseline` are reserved names. With no arguments it prints usage and the available names. It is all-or-nothing: if any name is unknown or reserved, nothing changes, and all bad names are reported together with the list of valid names (built-ins and the user's profiles); if a bad name matches a project proposal in `.mode-gate.json`, it adds a note that project profiles are proposals to copy into the user config.
  - `/gate-off <profile>...` switches them off; `all` switches every profile off. It is symmetrical: if any name is unknown, nothing changes and the unknown names are reported. A known but inactive name is not an error; it only prints a "not active" note. With no arguments it prints usage and the active profiles.
  - `/gate-status` shows the baseline summary, the active profiles (name and description), the config path in use (`configPath` from `loadConfig`, in both results) and whether it loaded, and the warnings (including unknown names from `MODE_GATE_PROFILES`). It does not show per-profile source files.
- **Config timing.** The config is loaded at `session.start` and again on `/clear`. Other edits take effect in the next session. `/gate-check` re-reads and validates without applying.
- **State.** The loaded config result and the active profile names live in `$.state` (per session), never `$.store` and never module variables. The active list is an array of profile names in the order they were switched on (Drafts 06 and 07 use these names). If the state is missing or wiped (a hook firing before `session.start`, or `/clear` wiping state), only the baseline is active. If the config is missing from `$.state`, it is loaded lazily on first use through `loadConfig`. A lazy load restores the definitions only: it never applies `startProfiles` (only a true startup or resume does), so only the baseline is active until the user switches profiles on. On resume, `session.start` overwrites any state that persisted.
- **Starting profiles.** `loadConfig` (Draft 02) returns `startProfiles` in both its success and failure result: the names from `parseStartProfiles(env)` that match a defined profile. What `session.start` does depends on the event's reason or source field (assumption 5). The names below are placeholders; Draft 01's finding maps them to the real ones.
  - `startup` and `resume` (including an in-process resume): load the config and apply `startProfiles`. A resume applies them because `MODE_GATE_PROFILES` belongs to the process, not to the conversation; profiles switched on in an earlier session are still not restored.
  - `clear`: reset the active profiles to none and reload the config. Do not apply `startProfiles`.
  - Any other reason (for example compaction): change nothing (no reload, no reset, no re-apply).

  On a failed config only the baseline is active. Unknown names are warnings, shown by `/gate-status`. If the event has no reason field and `/clear` re-fires `session.start`, stop and ask (see Working rules).

- **Invalid config.** When `loadConfig` returns `ok: false`, only the baseline (from the failed result) is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors. `/gate-check` on an invalid config lists the errors and warnings only, with no proposals.
- **Command errors and repeats.** Each `command.run` handler has a `.catch` that shows the user an error message and changes nothing (no profile switched, no state written). Switching on a profile that is already active is idempotent: the `$.state` array gets no duplicate.
- Only the user switches profiles. The mod registers no tool Claude could call to switch.
- Lifetimes: a profile switched on lasts the session. On `/clear` the active profiles are reset to none and the config is reloaded. "Never restored on resume" means profiles switched on in an earlier session are not brought back. The band shows names so a forgotten profile stays visible. `MODE_GATE_PROFILES` is read once per process and applied at `startup` and `resume`, including `claude --resume` (a new process). After `/clear` no profile is active, even one it started.
- **Headless (this draft owns it).** If the session is headless and that is detectable (assumption 12 and what the API exposes), an `ask` verdict becomes `deny`, but only when the `ask` came from the mod's own policy: decision `source` is `rule`, `guard`, `bash-downgrade` or `malformed`. A passed-through Claude Code verdict (`claude-code`) and the `default` ask (an unmatched non-Bash call when Claude Code's verdict is unavailable) stay `ask`, so Claude Code resolves them; otherwise every unmatched call (for example a native Read) would be denied. An unmatched Bash call with an unavailable verdict has `source` `bash-downgrade` (Draft 03), so it is converted to deny. The conversion runs inside the shared decision path, so the full decision returned to the callers (logged by Draft 07, shown by Draft 08) already shows the deny, with the message below. For a main-session call the message names the available profiles (defined, not yet switched on) that would allow this call; for a subagent call, Draft 06's profile hint replaces this list (the parent's held, delegable profiles). To find them, run `decide` once per such profile with that profile added to the active set, and list those whose decision is allow. If none, or if the ask-path guard fires, the message is generic: "no available profile allows this call". If headless is not detectable, the conversion is inert: the mod returns `ask` as usual and Claude Code resolves it itself. This is a documented limitation (README and PR); state which case applies in the PR.
- State: see **State** above (assumption 5).
- Failure: every gating hook has a `.catch` that fails closed (see **Fail closed per hook**); `npm run check:catch` still requires a `.catch` on each.
- Unverified assumptions (Draft 01 verifies them): 2 (the event carries an agent id, main-session and subagent calls are distinguishable, and whether `tool.check` fires after a `tool.call` deny; if not distinguishable, see **No agent id, or no way to tell the sessions apart**), 3 (slash command text reaches `prompt.submit`), 4 (the test kit can raise `tool.check`), 5 (state is per session; what happens to `$.state` on `/clear` and on resume; whether a signal for them exists; whether `session.start` says why it fired), 7 (Claude Code's own verdict), 12 (hooks run under `claude -p`; a hook can tell the session is headless), 14 (argument completion). If 4 fails, test `decide` only and keep `register.ts` trivially thin. If 12 fails, headless is unsupported; if only the detection fails, the ask-to-deny conversion is inert (see **Headless**). If 14 fails, `/gate-on` with no arguments and an unknown name list the profile names. If 5 shows that state survives `/clear` and there is no signal for it, stop and ask (see Working rules). The same applies if `session.start` has no reason field and re-fires on `/clear`.

## Existing code

- `hooks/register.ts`: stub (`export {}`). Nothing may import it (`.dependency-cruiser.cjs` rule `no-import-of-register`).
- `hooks/hooks.json`: `{}` today; `scripts/check-manifests.mjs` requires it to be a JSON object and the plugin manifests (`.claude-plugin/plugin.json`, `marketplace.json`) to agree.
- `scripts/check-gating-catch.mjs`: requires `.catch(` in every `$.on("tool.call" | "tool.check" | "prompt.submit" | "command.run", ...)` registration in `register.ts`. Draft 01 may change the syntax it expects.
- `types/index.d.ts`: real declarations after Draft 01.
- `tests/`: vitest. `CLAUDE.md` "Testing strategy" item 4: wiring tests cover fail-closed (a guard that throws produces a deny), the reset test (after `/clear` no profile stays active) and the band test.

## Goal

Make the mod work end to end: load the config, hold per-session profile state, answer `tool.call` and `tool.check` through `decide`, and let the user switch profiles and check the config. The wiring stays thin.

## Scope

- `session.start`, `tool.call`, `tool.check` and `command.run` with `/gate-on`, `/gate-off`, `/gate-status` and `/gate-check`, all commands registered `immediate`.
- The shared decision path with an injected list of guard functions (called with the `call` and the guard context `{ projectDir, homeDir, logDir, configPath }`; their results go to `decide`), an injected `redirectHint` stub, an injected `log(decision, call)` stub, an injected `headless` flag, the session working directory recorded in `$.state` at `session.start`, and the agent context built from the event (subagent only with an agent id that identifies a subagent) passed into `decide` (the subagent-Bash deny works from here; other subagent calls use the session's active set until Draft 06 adds per-agent profiles).
- Session state in `$.state`: the loaded config and the active profile names.
- Starting profiles from `loadConfig`'s `startProfiles`, applied at `session.start` reasons `startup` and `resume` only.
- Reset on `/clear` (profiles none, config reloaded, `startProfiles` not applied); no change on other reasons; no restore of earlier-session profiles on resume.
- Invalid-config handling and headless conversion.
- A fail-closed `.catch` on every gating hook.

## Out of scope / later

Real guards and `redirectHint` (Draft 05), subagent assignment (Draft 06), band and log (Draft 07, including `/gate-why`), `/gate-explain` (Draft 08).

## Acceptance criteria

Fail-closed tests inject a throwing dependency (a fake guard).

- [ ] `tool.call`: a throwing dependency produces deny, never allow or nothing (wiring test).
- [ ] `tool.check`: a throwing dependency produces ask (wiring test).
- [ ] The shared path takes `redirectHint` as an injected function; the default stub returns `undefined`, and this draft does not import `hooks/guards.ts`.
- [ ] The shared path builds `call` as `{ toolName, input, agentId?, toolCallId? }` from the event, and passes that same object to the guards, `decide` and `log` (a fake guard and a fake `log` record it; the optional ids are present only when the event carries them).
- [ ] The shared path takes a list of guard functions, calls each with the `call` and the guard context `{ projectDir, homeDir, logDir, configPath }`, and passes their results to `decide`; a stub guard returning nothing adds no result.
- [ ] A path call with a no-op `log` writes no entry (a fake `log` records zero calls, and the verdict equals the one with the real `log`); the `headless` flag is an injected input, so the same call gives `deny` or `ask` as the flag says.
- [ ] `session.start` records the working directory in `$.state`, and the guard context's `projectDir` is that value (a fake guard records it); the same value is the `cwd` given to `loadConfig`.
- [ ] The guard context holds the session's `projectDir`, the `homeDir` from the injected environment (`HOME`, else `USERPROFILE`) and the `logDir` and `configPath` of the loaded config; with a failed config it still holds the default `logDir` and the resolved `configPath` (undefined if unresolved). A fake guard records the context it receives (test).
- [ ] A call is a subagent call only when the event carries an agent id that identifies a subagent. A Bash call from a subagent with no active allow rule for it is denied (`source` `subagent-bash`), with the message from the injected `redirectHint` stub (so with the stub, no text). The same call without such an id is decided as a main-session call.
- [ ] A non-Bash subagent call is decided with the session's active set as a placeholder, which Draft 06 replaces (with the baseline, assigned rules and the main session's deny and ask lists).
- [ ] With an injected `redirectHint` returning text, the subagent-Bash deny carries that text in `message`.
- [ ] If assumption 2 failed (no agent id, or main-session and subagent calls not distinguishable), every call is decided as a main-session call, so the subagent-Bash deny is inert, and the README and PR state the limitation.
- [ ] The shared path calls the injected `log(decision, call)`. `tool.call` calls it only for a deny; `tool.check` calls it for every verdict it returns. A `tool.call` deny calls `log` exactly once, and an allow or ask from `tool.call` calls it zero times. A call that goes through both hooks reaches `log` with the same tool-call id from the event both times; Draft 07's dedupe makes that one entry.
- [ ] A throwing `log` leaves the verdict unchanged, in both hooks: a deny stays deny, an allow stays allow, and a throwing `redirectHint` does the same for a subagent-Bash deny (no error escapes to the `.catch`).
- [ ] With the config missing from `$.state`, the first hook loads it through `loadConfig`.
- [ ] A lazy load (config missing from `$.state`, no `session.start` yet) restores the definitions only and never applies `startProfiles`: with `MODE_GATE_PROFILES=git-write` set, only the baseline is active until `/gate-on git-write`.
- [ ] `session.start` on resume overwrites any persisted state.
- [ ] `tool.call` and `tool.check` give the same verdict for the same call (both use the shared path), except that `tool.call` reports only deny.
- [ ] A `tool.call` path never returns allow (also when `decide` says allow).
- [ ] The shared path returns the full decision (`verdict`, `source`, `rule?`, `profile?`) as well as the hook result `{ verdict, message? }`.
- [ ] With the state missing or wiped (a hook before `session.start`), only the baseline is active.
- [ ] `MODE_GATE_PROFILES=git-write` activates `git-write` at a `session.start` with reason `startup`, and with reason `resume` (also in a new process started with `claude --resume` and for an in-process resume); an unknown name activates nothing and shows as a warning in `/gate-status`.
- [ ] A `session.start` with reason `clear` resets the active profiles to none, reloads the config and does not apply `startProfiles`. If the event has no reason field and `/clear` re-fires `session.start`, the work stops and asks.
- [ ] A `session.start` with any other reason (for example compaction) changes nothing: active profiles unchanged, config not reloaded.
- [ ] With Claude Code's own verdict unavailable (not headless), an unmatched call gets `ask`.
- [ ] After `/clear` no profile is active (reset test), including one that `MODE_GATE_PROFILES` started, and the config is reloaded.
- [ ] A resumed session has no profile that was switched on in an earlier session.
- [ ] `/gate-on` with a known name activates it and prints a summary of what it allows.
- [ ] `/gate-on` with an unknown name changes nothing and lists the valid names (built-ins and the user's profiles).
- [ ] `/gate-on` with several names is all-or-nothing: with one valid and one unknown name, nothing is activated; with several bad names, all are reported together with the valid-names list.
- [ ] `/gate-on` with a name that matches a project proposal in `.mode-gate.json` adds a note that project profiles are proposals to copy into the user config.
- [ ] `/gate-on all` and `/gate-on baseline` change nothing and say the names are reserved; mixed with a valid name, nothing is activated.
- [ ] `/gate-on` with no arguments prints usage and the available names.
- [ ] `/gate-off all` clears every profile.
- [ ] `/gate-off` with an unknown name changes nothing and reports the unknown names; with a known active name and an unknown one, the active one stays on.
- [ ] `/gate-off` with a known but inactive name prints a "not active" note, is not an error and changes nothing for that name; the other valid names are still switched off.
- [ ] `/gate-off` with no arguments prints usage and the active profiles.
- [ ] `/gate-on` with a profile that is already active changes nothing: the `$.state` array has no duplicate.
- [ ] A command handler that throws shows the user an error message and changes nothing (active profiles and config unchanged).
- [ ] `/gate-status` shows the baseline summary, each active profile's name and description, the config path (`configPath`, also when the config failed to load) and whether it loaded, and the warnings. It shows no per-profile source files.
- [ ] `/gate-check` re-reads and validates the config without applying it, lists project proposals and shows errors.
- [ ] Config edits made after `session.start` do not change the active rules until the next session or `/clear`.
- [ ] Invalid config (`ok: false`): only the baseline is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors.
- [ ] `/gate-check` with an invalid config lists the errors and warnings only; no proposals are listed, even when `.mode-gate.json` exists.
- [ ] Headless and detectable: an `ask` whose `source` is `rule`, `guard`, `bash-downgrade` or `malformed` becomes `deny` (one row per source: a Bash call Claude Code would allow with no allow rule gives `bash-downgrade`; a Bash call with no `command` gives `malformed`), with a message naming the available (defined, not switched-on) profiles for which `decide`, run with that profile added to the active set, returns allow.
- [ ] Headless and detectable, and no available profile would allow the call (for example the ask-path guard, or a call no profile allows): the deny message is generic ("no available profile allows this call").
- [ ] Headless and detectable: a passed-through Claude Code `ask` (`source` `claude-code`, for example a native Read) stays `ask`.
- [ ] Headless and detectable, Claude Code's verdict unavailable: an unmatched Bash call (decision `source` `bash-downgrade`) is converted to `deny`; an unmatched non-Bash call (`source` `default`) stays `ask`.
- [ ] Headless and detectable: the conversion happens inside the shared decision path, so the full decision returned to the callers shows `deny` (not `ask`), with the message naming the available profile(s) or the generic message.
- [ ] Headless and not detectable (assumption 12's detection part failed): the conversion is inert, every `ask` stays `ask` for Claude Code to resolve, and the README and PR document this limitation.
- [ ] Not headless: `ask` stays `ask`.
- [ ] No tool callable by Claude switches profiles.
- [ ] `npm run check:catch` and `npm run arch` pass.
- [ ] `npm run check` passes.

## How to start

First failing test: with the test kit (or a fake `$` if assumption 4 failed), a `tool.check` for `Bash` `git commit -m x` returns ask with no profile, and allow after `/gate-on git-write` once that profile exists as a fixture. Second: a throwing injected guard yields deny.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

**Stop and ask** (used in this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and leave the work uncommitted.

## Depends on

Draft 01 (assumption 2, and assumption 5 with its `/clear`, resume and `session.start` reason finding), Draft 02, Draft 03

## References

- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
- [Headless runs](../design.md#headless-runs)
- [Failure](../design.md#failure)
- [Code structure](../design.md#code-structure)
