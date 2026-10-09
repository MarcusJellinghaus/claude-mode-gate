# Session state and /gate-on, /gate-off, /gate-status, /gate-check

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`, and inspects with `/gate-status`, `/gate-why [n]`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES`.

This is Draft 04 of 13 (plan: Draft 00). It holds the per-session state and the commands that switch profiles and show the state. Draft 12 connects the decision logic to the tool hooks and adds headless behaviour.

## Design decisions this issue relies on

- **Hooks and events.** A mod is written as `export const register: Register = (on, options) => { ... }` with registrations `on(event, matcher, hook)`; a hook is `($, e, next)` and returns a result (a hook that returns nothing is a failure). This draft adds these registrations to `hooks/register.ts`:
  - `session.start` (the event has only `cwd`, `surface` and `isInteractive`, **no reason field**): registers the commands with `$.command.register({ name, description, argumentHint?, immediate: true })`, starts the state if it has not started (below), and returns `next(e)`. A hot reload re-fires `session.start` and wipes module variables, so a registration is idempotent (registering a name again replaces it) and nothing important is kept in module variables.
  - `session.end` (fires for `/clear` with reason `clear`, and **no** `session.start` follows): resets the state, whatever the reason (below). The end-of-session clock is short (1.5 s for every hook), so the reset only writes `$.state` and never loads files.
  - `command.run` with the matcher `{ command: 'gate-on' }` and so on for `gate-off`, `gate-status` and `gate-check`: the hook gets `e.args` (the raw argument text, `""` when none) and returns `{ text }`. Draft 07 registers `/gate-why`, Draft 08 `/gate-explain`.
- **State (this draft owns the shape).** `$.state` (per session, survives a hot reload; never `$.store`, never module variables). Everything lives under one literal key `gate` of this mod, so `validate` can list it; only the owning plugin writes it. The fields, which Drafts 06, 07 and 12 use by exactly these names:
  - `gate.config`: the loaded config (the `loadConfig` result), or unset until first use.
  - `gate.active`: array of active profile names in switch-on order.
  - `gate.started`: boolean; true once the state has started or been reset. Starting profiles apply only while it is false (Draft 12).
  - `gate.headless`: boolean, set from `session.start.isInteractive` (Draft 12).
  - `gate.logFailing`: boolean, set and cleared by the log (Draft 07), read by `/gate-status`.
  - `gate.seenIds`: the log's dedupe list (Draft 07), bounded to 200 ids.
  - `gate.assignments`: bound subagent assignments (Draft 06).
  - `gate.pending`: pending assignment records (Draft 06).

  The session id (`$.session.id()`) and the working directory (`$.session.cwd()`, the `cwd` given to `loadConfig`) are read when needed, not stored, because the id changes on `/clear`.

- **Types.** The engine supplies the API types. The mod only needs its own `PluginState` contract in `types/index.d.ts`, declaring `gate` under the mod's name, named in `.claude-plugin/plugin.json` as `"types": "./types/index.d.ts"`. It is merged into the engine's `PluginState` through `declare module "claude-code"`. Draft 01 settles how `typecheck` finds the engine's types.
- **Start, reset, lazy load.**
  - Start: `session.start` with `gate.started` false (or `gate` missing) loads the config and sets `started`. This draft starts with `active: []`; Draft 12 extends the start to apply `startProfiles`. A hot reload finds `started` true and leaves the active profiles alone.
  - Reset: `session.end` (any reason) sets `active` to none, clears `assignments`, `pending` and `seenIds`, unsets `config` (the next hook reloads it) and sets `started` to true, so starting profiles are not re-applied: after `/clear` no profile is active, even one that `MODE_GATE_PROFILES` started. `logFailing` and `headless` are kept (the log file outlives the session's profiles). In-process resume also ends a session, so profiles from an earlier session never come back.
  - Lazy load: if `gate` or `gate.config` is missing (a hook firing before `session.start`, or after a reset), the first use loads the config through `loadConfig`. A lazy load restores the definitions only, never applies `startProfiles`, and leaves `started` as it found it. Until the user switches profiles on, only the baseline is active.
- **Pure module `hooks/commands.ts`.** The logic lives here, not in `register.ts`: the start and reset transitions (plain state in, plain state out), argument parsing of the raw text, all-or-nothing validation, reserved names, the proposal hint, the "not active" note, the summary of what a profile allows, the `/gate-status` text and the usage texts. Its functions take the raw argument text and plain data (the current `gate`, the defined profiles, the project proposals) and return `{ active, message }` (or the new state), where `active` is unchanged on any error. They use no `$` and do no I/O, and import only types from `hooks/policy.ts`. `register.ts` only calls them from the hooks, stores the result in `$.state` and returns `{ text: message }`. Exact signatures are decided test-first.
- **Commands.**
  - `/gate-on <profile>...` switches profiles on and prints a short summary of what they allow. `all` and `baseline` are reserved names. With no arguments it prints usage and the available names. It is all-or-nothing: if any name is unknown or reserved, nothing changes, and all bad names are reported together with the list of valid names (built-ins and the user's profiles); if a bad name matches a project proposal in `.mode-gate.json`, it adds a note that project profiles are proposals to copy into the user config. Switching on an active profile is idempotent (no duplicate in `gate.active`).
  - `/gate-off <profile>...` switches them off; `all` switches every profile off. It is symmetrical: if any name is unknown, nothing changes and the unknown names are reported. A known but inactive name is not an error; it only prints a "not active" note. With no arguments it prints usage and the active profiles. Draft 06 extends it to revoke delegated copies and pending records.
  - `/gate-status` shows the baseline summary (see `docs/design.md`, Baseline), the active profiles (name and description), the config path in use (`configPath` from `loadConfig`, in both results) and whether it loaded, and the warnings (including unknown names from `MODE_GATE_PROFILES`). It adds the line `log: failing` while `gate.logFailing` is true. It does not show per-profile source files.
  - `/gate-check` is a thin wrapper around the Draft 02 validator: it re-reads and validates the config without applying it, shows errors and warnings, and lists project proposals (only when the config is valid).
  - Commands are registered with `immediate: true`.
- **Invalid config.** When `loadConfig` returns `ok: false`, only the baseline (from the failed result) is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors.
- **Command errors.** Each `command.run` handler has a `.catch` that returns a `{ text }` error message for the user and changes nothing (no profile switched, no state written).
- Only the user switches profiles. The mod registers no tool Claude could call to switch (`$.tool.register` is not used).
- **Config timing.** The config loads at start and after a reset. Other edits take effect after the next reset. `/gate-check` re-reads and validates without applying.
- **Hot reload and `/clear`** are the cases that make state tricky; both are covered by tests below.
- Unverified assumptions (Draft 01): 4 (the test kit can raise events; if not, test the pure functions only and keep `register.ts` trivially thin), 20 (`$.session.id()` after `/clear`, `$.session.cwd()`, `session.start` after an in-process resume). If `session.end` does not fire for `/clear`, stop and ask.

## Existing code

- `hooks/register.ts`: stub. Nothing may import it (`.dependency-cruiser.cjs` rule `no-import-of-register`). After this draft it holds the registrations above and only wires.
- `hooks/commands.ts`: does not exist yet; this draft creates it. Add it to the `entry` list in `knip.json` if knip reports it unused before `register.ts` imports it. In `.dependency-cruiser.cjs` add a rule that `hooks/commands.ts` imports only types from `hooks/policy.ts`.
- `vitest.config.ts` (coverage include list: `hooks/policy.ts` and `hooks/config.ts`) and `stryker.config.json` (`mutate` list): add `hooks/commands.ts` to both, the same pattern as Drafts 05, 06, 07 and 08 use for their pure modules.
- `hooks/hooks.json` (manifest shape fixed by Draft 01), `.claude-plugin/plugin.json` (gets the `types` entry), `types/index.d.ts`.
- `tests/`: vitest. `CLAUDE.md` "Testing strategy" item 4: wiring tests cover fail-closed, the reset test (after `/clear` no profile stays active) and the band test.

## Goal

Hold per-session profile state that survives a hot reload and resets on `/clear`, and let the user switch profiles and check the config. The wiring stays thin.

## Scope

- The `gate` state shape, the `PluginState` contract in `types/index.d.ts` and the `types` entry in `plugin.json`.
- `session.start` (register commands, start the state once), `session.end` (reset), the lazy config load, and the four `command.run` hooks with their `.catch`.
- The new pure module `hooks/commands.ts`, table-tested directly, and its gates: coverage include list in `vitest.config.ts` (keep 95%), the `mutate` list in `stryker.config.json`, and a dependency-cruiser rule (imports only types from `policy.ts`).
- `/gate-on`, `/gate-off`, `/gate-status`, `/gate-check`.
- Invalid-config handling.

## Out of scope / later

The shared decision path, `tool.call` and `tool.check` wiring, starting profiles, headless behaviour (Draft 12). Guards (Draft 05), subagent assignment (Draft 06), band, log and `/gate-why` (Draft 07), `/gate-explain` (Draft 08), the built-in profile contents (Draft 09).

## Acceptance criteria

- [ ] `$.state` holds everything under the one literal key `gate` with the fields `config`, `active`, `started`, `headless`, `logFailing`, `seenIds`, `assignments` and `pending`; nothing else is stored in `$.state` or `$.store`; `types/index.d.ts` declares exactly these as `PluginState` and `plugin.json` names the file in `types`.
- [ ] The session id and working directory are read from `$.session` when needed and are not stored in `gate` (a test or review check on the state shape).
- [ ] Reset test: after `session.end` (reason `clear`, and any other reason) `gate.active` is empty, `assignments`, `pending` and `seenIds` are cleared, `config` is unset, `started` is true and `logFailing` is unchanged; the next hook reloads the config.
- [ ] After a reset no profile is active, including one that was active before; a resumed session has no profile that was switched on in an earlier session.
- [ ] Hot reload test: a second `session.start` with `started` true leaves `gate.active`, `assignments` and `pending` unchanged and re-registers the commands; no module variable holds state.
- [ ] With `gate` or `gate.config` missing (a hook before `session.start`, or after a reset), the first use loads the config through `loadConfig`; a lazy load never applies `startProfiles` and does not change `started`. With the state missing or wiped only the baseline is active.
- [ ] `session.start` registers `gate-on`, `gate-off`, `gate-status` and `gate-check` with `immediate: true`, a description and an `argumentHint` where the command takes arguments, and returns `next(e)`.
- [ ] The `session.end` reset writes only `$.state` (no file read, no `loadConfig`).
- [ ] The `/gate-on` and `/gate-off` rows below are table tests on the pure functions of `hooks/commands.ts` (raw argument text and plain data in, `{ active, message }` out, no `$`); a wiring test checks only that `register.ts` stores `active` and returns `message` as `{ text }`.
- [ ] `/gate-on` with a known name activates it and prints a summary of what it allows.
- [ ] `/gate-on` with an unknown name changes nothing and lists the valid names (built-ins and the user's profiles).
- [ ] `/gate-on` with several names is all-or-nothing: with one valid and one unknown name, nothing is activated; with several bad names, all are reported together with the valid-names list.
- [ ] `/gate-on` with a name that matches a project proposal in `.mode-gate.json` adds a note that project profiles are proposals to copy into the user config.
- [ ] `/gate-on all` and `/gate-on baseline` change nothing and say the names are reserved; mixed with a valid name, nothing is activated.
- [ ] `/gate-on` with no arguments prints usage and the available names. Raw text with odd spacing (`"  a   b "`) parses to the names `a` and `b`.
- [ ] `/gate-on` with a profile that is already active changes nothing: `gate.active` has no duplicate.
- [ ] `/gate-off all` clears every profile.
- [ ] `/gate-off` with an unknown name changes nothing and reports the unknown names; with a known active name and an unknown one, the active one stays on.
- [ ] `/gate-off` with a known but inactive name prints a "not active" note, is not an error and changes nothing for that name; the other valid names are still switched off.
- [ ] `/gate-off` with no arguments prints usage and the active profiles.
- [ ] A command handler that throws returns an error `{ text }` and changes nothing (active profiles and config unchanged).
- [ ] `/gate-status` shows the baseline summary, each active profile's name and description, the config path (`configPath`, also when the config failed to load) and whether it loaded, and the warnings. It shows `log: failing` while `gate.logFailing` is true; a reset does not clear the flag. It shows no per-profile source files.
- [ ] `/gate-check` re-reads and validates the config without applying it, lists project proposals and shows errors and warnings.
- [ ] `/gate-check` with an invalid config lists the errors and warnings only; no proposals are listed, even when `.mode-gate.json` exists.
- [ ] Config edits made after the config loaded do not change the active rules until the next reset.
- [ ] Invalid config (`ok: false`): only the baseline is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors.
- [ ] No tool callable by Claude switches profiles (no `$.tool.register` in `register.ts`).
- [ ] Gates: `hooks/commands.ts` is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it and still on the other listed modules) and in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold of 75); a dependency-cruiser rule makes it import only types from `hooks/policy.ts` (`npm run arch` passes); it uses no `$`.
- [ ] `npm run check` passes.

## How to start

First failing test in `tests/commands.test.ts`: `/gate-on git-write` with `git-write` defined returns `active: ['git-write']` and a summary; then `/gate-on nope` returns `active` unchanged and a message listing the valid names. Then the reset function empties `active`.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

**Stop and ask** (used in this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and leave the work uncommitted.

## Depends on

Draft 02 (`loadConfig`, the validator), Draft 03 (the types). Draft 01 for assumptions 4 and 20.

## References

- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
- [Code structure](../design.md#code-structure)
- [API notes](../mods-api-notes.md)
