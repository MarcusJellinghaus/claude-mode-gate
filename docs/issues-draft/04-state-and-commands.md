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
  - `gate.config`: the loaded config (the `loadConfig` result), optional, unset until first use.
  - `gate.active`: `string[]`, profile names in switch-on order. Initial value `[]`.
  - `gate.started`: boolean; true once the state has started or been reset. Initial value `false`. Starting profiles apply only while it is false (Draft 12).
  - `gate.headless`: boolean, optional, set from `session.start.isInteractive` by Draft 12. Unset means `false` (not headless). This assumes `session.start` precedes the first tool call; a lazy load cannot read `isInteractive` (only `session.start` carries it), so it leaves the flag alone.
  - `gate.logFailing`: boolean, optional, set and cleared by the log (Draft 07), read by `/gate-status`. Unset means `false`.
  - `gate.seenIds`: the log's dedupe list (Draft 07), bounded to 200 ids. This draft declares it as `string[]`, optional, unset at the start.
  - `gate.assignments`: bound subagent assignments. This draft declares it loosely typed and optional (`Record<string, unknown>`); Draft 06 narrows the element type. Unset at the start.
  - `gate.pending`: pending assignment records. Declared loosely typed and optional (`Record<string, unknown>`); Draft 06 narrows it. Unset at the start.

  So the initial state is `{ active: [], started: false }` and every other field is unset.

  **State writes (one value, so one rule).** The whole `gate` is a single `$.state` value, so every write replaces all of it, and a write built from a stale copy silently undoes a concurrent change (for example a lazy config load that finishes after `/gate-on`). Rule: every state write re-reads `gate` immediately before setting it, with no `await` between that read and the `set`, and changes only its target field of the fresh copy. After any slow step (the config load, a file read) the code re-reads `gate` and applies only its own field; it never writes back a copy taken before the step. This holds for every draft that writes `gate` (Drafts 06, 07 and 12 too). Draft 01 row 24 asks whether `$.state` offers a finer-grained or atomic update; if it does, use it, and the rule stays as the fallback.

  The session id (`$.session.id()`) and the working directory (`$.session.cwd()`, the `cwd` given to `loadConfig`) are read when needed, not stored, because the id changes on `/clear`.

- **Types.** The engine supplies the API types. The mod only needs its own `PluginState` contract in `types/index.d.ts`, declaring `gate` under the mod's name, named in `.claude-plugin/plugin.json` as `"types": "./types/index.d.ts"`. It is merged into the engine's `PluginState` through `declare module "claude-code"`. Draft 01 settles how `typecheck` finds the engine's types.
- **Start, reset, lazy load.**
  - Start (the one definition of the transition): `session.start` with `gate.started` false (or `gate` missing) loads the config, sets `started` to true and sets `active` to `[]`. Draft 12 extends only the last part (`active` becomes `startProfiles` when the config is ok; never when it is not, even though the failed result carries `startProfiles`). A hot reload finds `started` true and leaves the active profiles alone.
  - Reset: `session.end` (any reason) sets `active` to none, clears `assignments`, `pending` and `seenIds`, unsets `config` (the next hook reloads it) and sets `started` to true, so starting profiles are not re-applied (Draft 12 tests the `MODE_GATE_PROFILES` case). `logFailing` and `headless` are kept (the log file outlives the session's profiles). In-process resume also ends a session, so profiles from an earlier session never come back.
  - Lazy load: if `gate` or `gate.config` is missing (a hook firing before `session.start`, or after a reset), the first use loads the config through `loadConfig`. A lazy load restores the definitions only, never applies `startProfiles`, and leaves `started` as it found it. Until the user switches profiles on, only the baseline is active.
- **Loading the config from `register.ts`.** `loadConfig` runs in `session.start` (start), in the lazy load and in `/gate-check`, and needs an environment object and a file reader. `register.ts` builds them (Draft 02 defines their shape): the environment object comes from `$.env.get` on the literal names `MODE_GATE_PROFILES`, `MODE_GATE_CONFIG`, `XDG_CONFIG_HOME`, `HOME` and `USERPROFILE` (no other name is read), the reader is built on `$.fs` (`exists`, then `read`; `undefined` for a missing file), and `cwd` comes from `$.session.cwd()`. One small helper in `register.ts` does this for all three callers. Draft 12 reuses it and does not rebuild it.
- **Pure module `hooks/commands.ts`.** The logic lives here, not in `register.ts`: the start and reset transitions (plain state in, plain state out), argument parsing of the raw text, all-or-nothing validation, reserved names, the proposal hint, the "not active" note, the summary of what a profile allows, the `/gate-status` text and the usage texts. Its functions take the raw argument text and plain data (the current `gate`, the defined profiles as `config.profiles` and the project proposals as `config.proposals`, both `Record<string, Profile>` from Draft 02) and return `{ active, message }` (or the new state), where `active` is unchanged on any error. They use no `$` and do no I/O, and import only types from `hooks/policy.ts` and `hooks/config.ts` (the `loadConfig` result type held in `gate.config`, and the profile and proposal shapes). `register.ts` only calls them from the hooks, stores the result in `$.state` and returns `{ text: message }`. Exact signatures are decided test-first.
- **Commands.**
  - `/gate-on <profile>...` switches profiles on and prints a short summary of what they allow. `all` and `baseline` are reserved names. With no arguments it prints usage and the available names. It is all-or-nothing: if any name is unknown or reserved, nothing changes, and all bad names are reported together with the list of valid names (built-ins and the user's profiles); if a bad name matches a project proposal in `.mode-gate.json`, it adds a note that project profiles are proposals to copy into the user config. Switching on an active profile is idempotent (no duplicate in `gate.active`).
  - `/gate-off <profile>...` switches them off; `all` switches every profile off. It is symmetrical: if any name is unknown, nothing changes and the unknown names are reported. A known but inactive name is not an error; it only prints a "not active" note. With no arguments it prints usage and the active profiles. `commands.ts` returns only `{ active, message }`; to revoke delegated copies and pending records, `register.ts` applies Draft 06's pure `revoke(gate, names)` after `commands.ts` returns, with the names that left `active` (so `commands.ts` imports nothing from `assignment.ts`).
  - **Output text (pinned; Draft 13's README copies it).** Each command returns exactly these lines (`\n` between them, no trailing newline). Rule lists are the raw rule strings joined with `, `; a list that is empty is omitted; a profile with no rules prints `<name> adds no rules`.

    `/gate-on git-write` (built-in profile as Draft 09 defines it):

    ```text
    Switched on: git-write
    git-write allows: Bash(git add *), Bash(git commit *), Bash(git checkout -b *), Bash(git push)
    Active: git-write
    ```

    A profile with ask or deny rules adds `<name> asks: ...` and `<name> denies: ...` lines after the `allows` line. A name that is already active is listed on its own line `Already active: <names>` and is not repeated in `Switched on`.

    `/gate-off git-write`:

    ```text
    Switched off: git-write
    Active: none
    ```

    With other profiles still active the last line is `Active: issues` (names in switch-on order, `, ` separated). `/gate-off all` prints `Switched off: ` followed by the names that were active (or `Nothing was active` when none was). A known but inactive name prints the line `Not active: <names>`.

    `/gate-status`:

    ```text
    Baseline: reads, project writes, check scripts, Skill, Agent, web fetch and search
    Active profiles: git-write (<description>)
    Config: <configPath> (loaded)
    Warnings: none
    ```

    With several active profiles the second line is `Active profiles: a (<description>), b (<description>)`; with none it is `Active profiles: none`. The config line is `Config: <configPath> (failed)` after an invalid config, followed by one `Error: <message>` line per error, and `Config: unknown path (failed)` when `configPath` is undefined. Warnings are `Warning: <message>` lines instead of `Warnings: none`. The line `log: failing` comes last, only while `gate.logFailing` is true.

  - `/gate-status` shows the baseline summary (see `docs/design.md`, Baseline), the active profiles (name and description), the config path in use (`configPath` from `loadConfig`, in both results) and whether it loaded, and the warnings (including unknown names from `MODE_GATE_PROFILES`). It adds the line `log: failing` while `gate.logFailing` is true. It does not show per-profile source files.
  - `/gate-check` is a thin wrapper around the Draft 02 validator: it re-reads and validates the config without applying it, shows errors and warnings, and lists project proposals (only when the config is valid).
  - Commands are registered with `immediate: true`.
- **Invalid config.** When `loadConfig` returns `ok: false`, only the baseline (from the failed result) is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors.
- **Command errors.** Each `command.run` handler has a `.catch` that returns a `{ text }` error message for the user and changes nothing (no profile switched, no state written).
- Only the user switches profiles. The mod registers no tool Claude could call to switch (`$.tool.register` is not used).
- **Config timing.** The config loads at start and after a reset. Other edits take effect after the next reset. `/gate-check` re-reads and validates without applying.
- **Hot reload and `/clear`** are the cases that make state tricky; both are covered by tests below.
- Unverified assumptions (Draft 01): 4 (the test kit can raise events and mock the layers; if not, Draft 12 adds a named test-only exception to `no-import-of-register` limited to `tests/wiring/**`, and the pure functions are tested directly with `register.ts` kept trivially thin), 20 (`$.session.id()` after `/clear`, `$.session.cwd()`, `session.start` after an in-process resume). If `session.end` does not fire for `/clear`, stop and ask.

## Existing code

- `hooks/register.ts`: stub. Nothing may import it, not even tests (`.dependency-cruiser.cjs` rule `no-import-of-register`). After this draft it holds the registrations above and only wires.
- `hooks/commands.ts`: does not exist yet; this draft creates it. Add it to the `entry` list in `knip.json` if knip reports it unused before `register.ts` imports it. In `.dependency-cruiser.cjs` add a rule that `hooks/commands.ts` imports only types from `hooks/policy.ts` and `hooks/config.ts` (needs `tsPreCompilationDeps: true`, added by Draft 02).
- `vitest.config.ts` (coverage include list: `hooks/policy.ts` and `hooks/config.ts`) and `stryker.config.json` (`mutate` list): add `hooks/commands.ts` to both, the same pattern as Drafts 05, 06, 07 and 08 use for their pure modules.
- `hooks/hooks.json` (manifest shape fixed by Draft 01), `.claude-plugin/plugin.json` (gets the `types` entry), `types/index.d.ts`.
- `tests/`: vitest. `CLAUDE.md` "Testing strategy" item 4: wiring tests cover fail-closed, the reset test (after `/clear` no profile stays active) and the band test. Wiring tests run through the plugin test kit (`claude-code/testing`, `claude plugin test`), which loads the module from the manifest; no test imports `register.ts` (`no-import-of-register`, see Draft 12). Where a criterion below names a fake `$.env`, `$.fs` or `$.state`, it is the kit's mock.

## Goal

Hold per-session profile state that survives a hot reload and resets on `/clear`, and let the user switch profiles and check the config. The wiring stays thin.

## Scope

- The `gate` state shape, the `PluginState` contract in `types/index.d.ts` and the `types` entry in `plugin.json`.
- `session.start` (register commands, start the state once), `session.end` (reset), the lazy config load, and the four `command.run` hooks with their `.catch`.
- The new pure module `hooks/commands.ts`, table-tested directly, and its gates: coverage include list in `vitest.config.ts` (keep 95%), the `mutate` list in `stryker.config.json`, and a dependency-cruiser rule (imports only types from `policy.ts` and `config.ts`).
- The environment object, `$.fs` reader and `cwd` that `register.ts` hands to `loadConfig` (see Loading the config).
- `/gate-on`, `/gate-off`, `/gate-status`, `/gate-check`.
- Invalid-config handling.

## Out of scope / later

The shared decision path, `tool.call` and `tool.check` wiring, starting profiles, headless behaviour (Draft 12). Guards (Draft 05), subagent assignment (Draft 06), band, log and `/gate-why` (Draft 07), `/gate-explain` (Draft 08), the built-in profile contents (Draft 09).

## Acceptance criteria

- [ ] `$.state` holds everything under the one literal key `gate` with the fields `config`, `active`, `started`, `headless`, `logFailing`, `seenIds`, `assignments` and `pending`; nothing else is stored in `$.state` or `$.store`; `types/index.d.ts` declares exactly these as `PluginState` and `plugin.json` names the file in `types`.
- [ ] The session id and working directory are read from `$.session` when needed and are not stored in `gate` (a test or review check on the state shape).
- [ ] Reset test: after `session.end` (reason `clear`, and any other reason) `gate.active` is empty, `assignments`, `pending` and `seenIds` are cleared, `config` is unset, `started` is true and `logFailing` is unchanged; the next hook reloads the config.
- [ ] After a reset no profile is active, including one that was active before; a resumed session has no profile that was switched on in an earlier session. (The case of a profile that `MODE_GATE_PROFILES` started is tested in Draft 12.)
- [ ] Initial state: a first `session.start` (this draft's own, run without Draft 12's `headless` store) leaves `active` empty, `started` true and `config` loaded, with every other field unset, except `headless`, which Draft 12's `session.start` extension sets; `headless` unset reads as false (a test with a hook before `session.start`). After Draft 12 lands, the same test expects `headless` to be set too.
- [ ] State-write rule: every write to `gate` re-reads `gate` immediately before `$.state` set, with no `await` between the read and the set, and changes only its target field. Test with a fake `$.state` and a lazy config load held open: start the lazy load (a `loadConfig` whose file read stays pending), run `/gate-on git-write`, then let the load finish; `gate.active` still holds `git-write` and `gate.config` is set. The mirror case (`/gate-on` finishing while the load is pending, and a `session.end` reset in between) leaves `active` empty after the reset and no stale copy is written back. A structural check (review or test) finds no `await` between a `$.state` read and the matching set in `register.ts`.
- [ ] Wiring test (through the test kit): `register.ts` builds the environment object from `$.env.get` with exactly the five literal names, builds the `$.fs` reader (missing file gives `undefined`) and passes `$.session.cwd()` to `loadConfig`, in `session.start`, the lazy load and `/gate-check`.
- [ ] Hot reload test: a second `session.start` with `started` true leaves `gate.active`, `assignments` and `pending` unchanged and re-registers the commands; no module variable holds state.
- [ ] With `gate` or `gate.config` missing (a hook before `session.start`, or after a reset), the first use loads the config through `loadConfig`; a lazy load never applies `startProfiles` and does not change `started`. With the state missing or wiped only the baseline is active.
- [ ] `session.start` registers `gate-on`, `gate-off`, `gate-status` and `gate-check` with `immediate: true`, a description and an `argumentHint` where the command takes arguments, and returns `next(e)`.
- [ ] The `session.end` reset writes only `$.state` (no file read, no `loadConfig`).
- [ ] The `/gate-on` and `/gate-off` rows below are table tests on the pure functions of `hooks/commands.ts` (raw argument text and plain data in, `{ active, message }` out, no `$`); a wiring test (through the test kit) checks only that `register.ts` stores `active` and returns `message` as `{ text }`.
- [ ] `/gate-on` with a known name activates it and prints a summary of what it allows, in exactly the pinned text above (a table test per case: one profile, two profiles, an already active name, a profile with ask and deny rules, a profile with no rules). `/gate-off` and `/gate-status` are pinned the same way (one profile, several, none active, `all`, an inactive name; `/gate-status` with a loaded config, a failed config, a warning, an undefined `configPath` and `log: failing`). The README examples of Draft 13 are copied from these tests' fixtures.
- [ ] The pinned example outputs live in `tests/fixtures/readme-<command>.txt` (`readme-gate-on.txt`, `readme-gate-off.txt`, `readme-gate-status.txt`), are used by the command's own test, and are read by `tests/readme-examples.test.ts` (Draft 13).
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
- [ ] Invalid config (`ok: false`): only the baseline is active, `/gate-on` activates nothing and says why, and `/gate-status` and `/gate-check` show the errors. The `startProfiles` of the failed result are informational: `/gate-status` may list them in its warnings, and nothing ever activates them (Draft 12 tests the start transition).
- [ ] `commands.ts` takes the defined profiles and the proposals as `Record<string, Profile>` (`config.profiles`, `config.proposals`, Draft 02), returns only `{ active, message }` for `/gate-off`, and imports nothing from `assignment.ts`; a wiring test (through the test kit) checks that `register.ts` calls Draft 06's `revoke` with the names that left `active` once Draft 06 has landed.
- [ ] No tool callable by Claude switches profiles (no `$.tool.register` in `register.ts`).
- [ ] Gates: `hooks/commands.ts` is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it and still on the other listed modules) and in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold of 75); a dependency-cruiser rule makes it import only types from `hooks/policy.ts` and `hooks/config.ts` (`npm run arch` passes); it uses no `$`.
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
