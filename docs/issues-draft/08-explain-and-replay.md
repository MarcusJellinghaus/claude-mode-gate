# /gate-explain and offline replay

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain <tool> …`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 08 of 11 (plan: Draft 00). It lets the user check a config before trusting it, with the same code that decides live.

## Design decisions this issue relies on

- **One decide path.** Both tools call the shared path in `hooks/gate.ts` (Draft 04). It imports `policy.ts`, uses no `$` and does no I/O; it receives the effective set (a function of the call), guards, `redirectHint`, `profileHint(decision, call)` (Draft 06: the denial's profile text, built from the effective set and the held profiles), `log`, the `headless` flag and the source of Claude Code's verdict by injection. The live wiring, explain and replay all inject the same `profileHint`, so they show the denial text a live call would get. It returns the full decision (`verdict`, `source`, `rule?`, `profile?`, `message?`, and the `chain` of Draft 03 only when the `withChain` option is set) as well as the hook result. Only explain and replay set `withChain` (default false); the live hooks never build the chain (cost), and the verdict is identical with and without it.
- **Effective set per call.** For a main-session call it is the baseline plus the active profiles. For a subagent call the live wiring follows Draft 06 (baseline, the assigned profiles' rules, and the main session's active profiles' deny and ask lists). Explain with `--agent <id>` and replay's sidechain calls simulate a subagent call **without assignment**: the baseline plus the main session's deny and ask lists. In replay, the profiles given with `--profiles` play the main session's role. Draft 06 supplies the pure helper `effectiveSet({ baseline, profiles, active, assigned? })`; the live wiring injects a closure over `$.state` that wraps it, while explain and replay call it directly with explicit lists (`active` = the session's switched-on profiles or `--profiles`; `assigned: []` for a simulated subagent) and never read `$.state`. With `--agent`, the simulated subagent holds nothing beyond the baseline, so an Agent call from it names no held profile: any name in a `mode-gate-profiles:` marker is not held and `checkAssignment` denies the call.
- **Assignment guard.** Explain and replay also wire Draft 06's pure `checkAssignment` as a guard, reading the marker with Draft 06's pure `parseAssignmentMarker(prompt)` (the function the live wiring uses): an Agent call whose first prompt line carries an invalid `mode-gate-profiles:` marker shows the guard-sourced `deny`. The held set is the switched-on profiles (the current session's in explain, `--profiles` in replay), also for a sidechain Agent call in replay: the held set `checkAssignment` uses is the `--profiles` set. They never write pending or bound assignment records.
- **Exactness.** Claude Code's own verdict is unavailable in a dry run and in replay, so `source` `claude-code` never occurs there, and in the live path a Claude Code deny still wins. Exactness is limited:
  - A `deny` is exact only for a **main-session, non-headless** call (source `rule`, `guard` or `malformed`).
  - Every result for a sidechain call, for `--agent`, or converted by the headless rule is flagged as an **approximation**, whatever its verdict: a real assignment could allow the call, and Claude Code's own `ask` stays an `ask`. This includes a `subagent-bash` deny and an `ask` converted to `deny` in a headless session.
  - Every non-deny result whose source is `rule`, `guard`, `bash-downgrade` or `malformed` also carries the note "unless Claude Code denies".
  - An `ask` with source `bash-downgrade` (unmatched Bash) or `default` (unmatched other tool) is always an approximation, because Claude Code's verdict is unknown.
- **`hooks/explain.ts`.** A new pure module holds the exactness notes and the formatting of a decision (with its `chain`) as text. `/gate-explain` (wired in `register.ts`) and the replay CLI both import it, so their output cannot drift. It imports only types from `policy.ts` and the decision type, uses no `$` and does no I/O.
- **Rule chain.** The `chain` field of Draft 03's decision lists the rules and guard results considered, in decision order. It is for display only and never affects the verdict (Draft 03 tests that). Decision order: (1) a subagent calls Bash and no active allow rule matches: deny; (2) Edit or Write on a protected path: deny; (3) deny beats ask beats allow across the active set; (4) unmatched keeps Claude Code's verdict.
- **Bash metacharacters.** Bash allow rules match only if the command has none of `& ; | $ ( ) \` < >` and no newline. The chain says when this is why an allow rule did not match.
- **`/gate-explain` is a dry run of one call.** It builds the same `call` as Draft 04, `{ toolName, input, agentId?, toolCallId? }`, and runs the shared path with a no-op `log`, the session's real headless state. It never writes to the decision log or the assignment records, and shows the verdict the real call would get, within the limits of **Exactness**. It does not execute the call. "No side effects" is structural: Draft 06's pending-record write lives in `register.ts`, outside `gate.ts`, which writes the record after the shared path returns a non-deny verdict for an Agent call. Explain and replay never run that code.
- **Replay is offline.** It reads a Claude Code session transcript and reports what each call would have been under a config and a set of profiles. It uses transcripts, not the decision log, which records no arguments.
- **Transcript format (as observed; the implementing session confirms it against a real transcript, and Draft 01 notes it).** A transcript is JSON Lines. Assistant messages carry content blocks of type `tool_use` with `id`, `name` and `input`. Entries carry `cwd`, `sessionId` and `isSidechain` (true for subagent calls) and, for those, possibly `agentId`. Both `Agent` and the older name `Task` count as Agent calls (also for the live tool name). A sidechain call's agent id is the entry's `agentId` field if present, otherwise the synthetic value `sidechain`. Tests use hand-written fixtures under `tests/fixtures/` and never read `~/.claude`.
- **Runner.** The replay CLI is TypeScript run with `tsx`, a devDependency that is never shipped; hooks never depend on it. `scripts/replay.ts` is a thin entry (arguments, file read, printing). The logic lives in an importable module so it is unit tested. `npm run replay -- <transcript.jsonl> [--profiles a,b] [--config path]`.
- Later: replay refinements, and a persistent log with arguments.

## Existing code

- `hooks/policy.ts`: pure; `decide` (Draft 03) returns the optional `chain`.
- `hooks/gate.ts` (Draft 04): the shared path, with the `withChain` option. `hooks/guards.ts` (Draft 05): the real guards and `redirectHint`.
- `hooks/explain.ts` (new, this issue): pure; the exactness notes and the text formatting of a decision and its chain. It imports only types from `policy.ts` and the decision type, like `hooks/guards.ts` (Draft 05). It is added to the coverage include list in `vitest.config.ts` (95% thresholds), to the `mutate` list in `stryker.config.json` and to a dependency-cruiser purity rule (like `policy-is-pure`).
- `hooks/register.ts`: wiring; this draft registers `/gate-explain` there (Draft 04 shows the pattern and registers the other commands except `/gate-why`, Draft 07). Nothing imports `register.ts`, so replay must not.
- `scripts/replay.ts` and the replay module: new. Add `scripts/replay.ts` to `knip.json` `entry` (today it lists `scripts/*.mjs`), add `tsx` to `devDependencies`, add the `replay` script to `package.json`, and check that `tsconfig.json` and ESLint cover `scripts/*.ts`. Replay imports `policy.ts`, `gate.ts`, `guards.ts`, `explain.ts` and Draft 02's config code, and no host API.
- `.dependency-cruiser.cjs`: `no-dev-dependencies-in-hooks` applies to `hooks/`; put the replay module outside `hooks/` (for example `scripts/`), so `tsx` stays out of shipped code.
- Note, not a change: `Bash(npm run replay *)` is not added to the baseline or to `.claude/settings.json`.

## Goal

Show, for a single call or a whole transcript, what the gate would decide and why.

## Scope

- `/gate-explain <tool> <input>`: for `Bash`, the command is the rest of the raw argument text after the tool name and one separating space, passed unmodified (odd spacing is kept, so it matches the live path). If the command API gives only tokens (Draft 01 notes which), the command is rebuilt by joining the tokens with single spaces, so odd spacing cannot be preserved; this limitation is documented in the README and in the output. For any other tool, the rest of the line is a JSON object used as `call.input`, for example `/gate-explain mcp__mcp-workspace__edit_file {"file_path": ".claude/settings.json"}`. Tool names are the full names, as in the rules: a bare `edit_file` matches no baseline rule. `--agent <id>` simulates a subagent call (`agentId` set) with no assignment (see **Effective set per call**). Invalid JSON prints usage. It prints the verdict, source, rule, profile, the message and the rule chain, with the notes of **Exactness**, formatted by `hooks/explain.ts`.
- New pure module `hooks/explain.ts` (exactness notes and decision formatting), shared by `/gate-explain` and replay, and in the coverage, mutation and purity gates.
- Replay CLI `npm run replay -- <transcript.jsonl> [--profiles a,b] [--config path]`:
  - `--profiles a,b` is the set of switched-on profiles. Default none: baseline only. An unknown name exits with code 2 and a message listing the valid names.
  - The config comes from Draft 02's loader (`--config` overrides the path). An invalid config follows the live behaviour: it prints the errors, ignores `--profiles` with a warning, replays the baseline only and exits with code 0. (An unknown profile name with a valid config still exits with code 2.)
  - It builds `gate.ts`'s dependencies itself: the real guards from `hooks/guards.ts`, the real `redirectHint`, Draft 06's `profileHint` (held profiles = `--profiles`), a no-op `log`, `headless` false, and the guard context: `projectDir` is the first `cwd` found in the transcript, else the process's working directory; `homeDir` comes from the environment. It also wires `checkAssignment` with `parseAssignmentMarker` (see **Assignment guard**).
  - Claude Code's own verdict is unavailable in replay: an unmatched call gives `ask` (`source` `bash-downgrade` for Bash, `default` otherwise), and every line carries the notes of **Exactness**.
  - Entries with `isSidechain: true` replay as subagent calls with no assignment (baseline plus the deny and ask lists of the `--profiles` set), with the agent id from the entry's `agentId` field, else `sidechain`. Every such line is flagged as an approximation, whatever its verdict.
  - `Agent` and `Task` tool names both count as Agent calls.
  - A malformed transcript line is skipped and counted.
  - Output: one line per tool call with verdict, source, rule, profile and the rule chain, then a summary count per verdict.
- Transcript parsing as pure code: tool name, input, `cwd`, session id, the sidechain flag and `agentId` from `tool_use` blocks.
- README usage example for both.

## Out of scope / later

Replaying subagent profile assignments exactly. Graphical output.

## Open questions

None. Settled: a transcript does not record the active profiles, so replay takes them as `--profiles` (default none).

## Acceptance criteria

- [ ] `/gate-explain` lists each rule and guard result considered, in order (the `chain`), and the final verdict, source, rule and profile.
- [ ] `/gate-explain Bash <command>` takes the rest of the line after the tool name and one space as the command, unmodified: `/gate-explain Bash git  status` (two spaces) and a command with leading or trailing spaces reach the shared path exactly as typed after that one space, so they match as on the live path. Explaining a Bash command with a metacharacter says why an allow prefix rule did not match.
- [ ] `hooks/explain.ts` is pure and shared: it imports only types from `policy.ts` and the decision type, both `/gate-explain` and the replay CLI import it for the notes and the text of a decision and its chain (the same decision gives the same text in both), and it is in the coverage include list (95%), the Stryker `mutate` list and a dependency-cruiser purity rule (`npm run arch` and `npm run test:coverage` pass).
- [ ] `/gate-explain mcp__mcp-workspace__edit_file {"file_path": ".claude/settings.json"}` parses the JSON as `call.input` and shows `deny` from a protected-path guard, exact (main session, not headless).
- [ ] `/gate-explain mcp__mcp-workspace__read_file {"file_path": "README.md"}` shows `allow` from the baseline, with "unless Claude Code denies". An unmatched call (for example `/gate-explain Edit {"file_path": "src/x.ts"}` with no rule for it) shows `ask` (`default`), and an unmatched `Bash` command shows `ask` (`bash-downgrade`); both are flagged as approximations.
- [ ] `/gate-explain <tool> <invalid JSON>` prints usage and decides nothing.
- [ ] `--agent <id>` decides the call as a subagent call with no assignment (a Bash call without an allow rule gives `subagent-bash`), using the baseline plus the main session's active deny and ask lists: with a profile active whose `deny` list has `Edit`, `/gate-explain --agent a1 Edit {...}` shows `deny`. Every `--agent` result, whatever its verdict, is flagged as an approximation.
- [ ] `/gate-explain Agent {"prompt": "mode-gate-profiles: x\n..."}` with `x` not held (or non-delegable, or unknown) shows `deny` from a guard (`checkAssignment`), naming `x`; with `x` switched on and delegable it does not deny. The marker is read with `parseAssignmentMarker`, so CRLF, spacing around commas, `a,,b` and duplicates behave as in Draft 06, and a marker on a later line is ignored. No pending or bound record is written.
- [ ] `/gate-explain --agent a1 Agent {"prompt": "mode-gate-profiles: x\n..."}` is denied by `checkAssignment` (`guard`) for any `x`, even with `x` switched on in the session: the simulated subagent holds nothing beyond the baseline. A call with no marker is not denied by the guard.
- [ ] Raw text: if the command handler receives the raw argument text, the odd-spacing row above holds. If it gives only tokens, the command is the tokens joined with single spaces: `/gate-explain Bash git  status` is explained as `git status`, the output says spacing was normalised, and the README documents the limitation (a test per case, using a fake handler input).
- [ ] The path builds `chain` only with `withChain`, which explain and replay set and the live hooks do not: the same call gives a decision without `chain` on the live path and with it in explain and replay, and the verdict, `source`, `rule`, `profile` and `message` are identical (test through `gate.ts`).
- [ ] Explain and replay compute the effective set by calling Draft 06's pure `effectiveSet` directly with explicit lists (the session's switched-on profiles, or `--profiles`), without `$.state` (test with no `$` available; the live closure wraps the same helper).
- [ ] Replay of an Agent call with an invalid marker gives `deny` (`guard`); with `--profiles x` for a delegable `x` it does not deny. Replay reads the marker with `parseAssignmentMarker`. Replay writes no assignment record.
- [ ] A sidechain Agent call in replay is checked against the `--profiles` set as the held set: with a marker naming a delegable `x`, it is denied (`guard`) without `--profiles x` and not denied with it.
- [ ] `Agent` and the older name `Task` both count as Agent calls in replay (the same marker check on each) and for the live tool name.
- [ ] A sidechain call's agent id is the entry's `agentId` if present, otherwise `sidechain`; the `call` given to the shared path carries it (test both).
- [ ] No side effects, structurally: the pending-record write is in `register.ts`, after the shared path returns a non-deny verdict for an Agent call, using the full decision. `gate.ts` has no injection point for it and neither `/gate-explain` nor replay can reach it (an accepted Agent call through explain and through replay leaves no record; `npm run arch` passes).
- [ ] Explain and replay inject Draft 06's `profileHint`: a denied subagent call shows the same message the live call would get (a fake `profileHint` records the decision and call it receives).
- [ ] Replay's `projectDir` is the first `cwd` in the transcript; with no `cwd` in any entry it is the process's working directory (test both).
- [ ] The shared path takes the effective set as an injected function of the call; explain and replay inject the no-assignment subagent set for `--agent` and sidechain calls (test with a fake function).
- [ ] For a main-session call in a non-headless session that the mod denies (source `rule`, `guard` or `malformed`), explain and the live `tool.check` give the same `deny` (shared test through `gate.ts`). For a non-deny result from a rule or guard, explain gives the same verdict with "unless Claude Code denies"; for an unmatched call explain gives `ask` (`bash-downgrade` or `default`) where the live path would use Claude Code's verdict.
- [ ] `/gate-explain` writes no decision-log entry and no assignment record. In a headless session it shows the `deny` the real call would get (an `ask` converted by the headless rule), flagged as an approximation.
- [ ] Replay prints one line per tool call with verdict, source, rule, profile and chain, then a summary count per verdict.
- [ ] `--profiles a,b` switches those profiles on: a call that only profile `a` allows is `allow` with it and `ask` without it. With no `--profiles`, only the baseline is active.
- [ ] An unknown name in `--profiles` exits with code 2 and prints a message naming it and the valid names.
- [ ] An invalid config prints its errors, replays the baseline only and exits with code 0.
- [ ] An invalid config with `--profiles a`: a warning says `--profiles` is ignored, a call that only profile `a` allows is not allowed, and the exit code is 0.
- [ ] An unknown name in `--profiles` with a valid config still exits with code 2.
- [ ] An unmatched call replays as `ask` (`bash-downgrade` for Bash, `default` otherwise), and the report flags both this and the sidechain handling as approximations.
- [ ] An entry with `isSidechain: true` replays as a subagent call with no assignment (a Bash call without an allow rule gives `deny`, `subagent-bash`); with `--profiles` naming a profile that denies `Edit`, a sidechain `Edit` gives `deny`, and a profile's allow rule does not apply to it. Every sidechain line is flagged as an approximation, deny included.
- [ ] Notes per case in explain and replay output (table test on `hooks/explain.ts`; one row per source, per call kind and per headless state):
  - main-session, non-headless `deny` (`rule`, `guard`, `malformed`): exact, no note;
  - any result for a sidechain call or `--agent` (any verdict, including `subagent-bash` deny): flagged as an approximation;
  - an `ask` converted to `deny` by the headless rule: flagged as an approximation;
  - every `allow` or `ask` from `rule`, `guard`, `bash-downgrade` or `malformed`: carries "unless Claude Code denies";
  - an `ask` from `bash-downgrade` or `default`: also flagged as an approximation;
  - `claude-code` never occurs.
- [ ] A malformed JSONL line is skipped, not fatal, and the skipped count is printed.
- [ ] Replay and the live path share `gate.ts`: a test runs the same rule- or guard-denied call through both and gets the same `deny`, and replay imports neither `register.ts` nor any host API (`npm run arch` passes).
- [ ] `tsx` is a devDependency, `scripts/replay.ts` is in the knip `entry` list, and `hooks/` does not import `tsx` (`npm run deadcode` and `npm run arch` pass).
- [ ] Tests use small hand-written fixtures under `tests/fixtures/` and never read `~/.claude`.
- [ ] README documents both with an example.
- [ ] `npm run check` passes.

## How to start

First failing test: a two-line JSONL fixture with one `Bash` `git status` call and one `Edit` of `.claude/settings.json` replays under the baseline to `ask` (`bash-downgrade`, flagged as an approximation) for the Bash call and `deny` (`guard`) for the Edit. The working tree's own `hooks/policy.ts` is not protected (Draft 05), so it must not be used for the deny row.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 02, Draft 03, Draft 04, Draft 05 (the real guards), Draft 06 (the subagent effective set, `checkAssignment` and `profileHint`). Draft 01 for the transcript format note.

## References

- [Commands](../design.md#commands)
- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Decision log](../design.md#decision-log)
- [Later](../design.md#later)
