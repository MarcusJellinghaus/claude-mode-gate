# /gate-explain

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain <tool> …`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 08 of 13 (plan: Draft 00). It lets the user check a config before trusting it, with the same code that decides live. Replaying a session transcript offline is a later item (`docs/design.md`, Later), not part of this draft.

## Design decisions this issue relies on

- **One decide path.** `/gate-explain` calls the shared path in `hooks/gate.ts` (Draft 12). It imports `policy.ts`, uses no `$` and does no I/O; it receives the effective set (a function of the call), guards, `redirectHint`, `availableProfiles(call)` (the candidates for the denial's profile text), `log`, the `headless` flag, the `hook` kind and Claude Code's verdict by injection; `profileHint(decision, call)` is part of the path itself (Draft 12). `/gate-explain` and the live wiring run the same `profileHint`, so explain shows the denial text a live call would get. The path returns the full decision (`verdict`, `source`, `rule?`, `profile?`, `message?`, and the `chain` of Draft 03 only when the `withChain` option is set) as well as the hook result. Only explain sets `withChain` (default false); the live hooks never build the chain (cost), and the verdict is identical with and without it.
- **Claude Code's verdict in a dry run.** Explain cannot ask Claude Code about a call that never runs, so it decides with the stand-in verdict `{ decision: 'allow' }` (the same stand-in `tool.call` uses, Draft 12) and says so in its output: the result is what the mod does when Claude Code allows. A real Claude Code deny or ask can still change the outcome.
- **Effective set per call.** For a main-session call it is the baseline plus the active profiles. For a subagent call the live wiring follows Draft 06 (baseline, the assigned profiles' rules, and the main session's active profiles' deny and ask lists). Explain with `--agent <id>` simulates a subagent call **without assignment**: the baseline plus the main session's deny and ask lists. Draft 06 supplies the pure helper `effectiveSet({ baseline, profiles, active, assigned? })`; explain calls it directly with explicit lists (`active` = the session's switched-on profiles; `assigned: []` for a simulated subagent) and never reads `$.state` for the set. With `--agent`, the simulated subagent holds nothing beyond the baseline, so an Agent call from it names no held profile: any name in a `mode-gate-profiles:` marker is not held and `checkAssignment` denies the call.
- **Assignment guard.** Explain also wires Draft 06's pure `checkAssignment` as a guard, reading the marker with Draft 06's pure `parseAssignmentMarker(prompt)` (the function the live wiring uses): an Agent call whose first prompt line carries an invalid `mode-gate-profiles:` marker shows the guard-sourced `deny`. The held set is the session's switched-on profiles. Explain never writes pending or bound assignment records.
- **Guards in explain.** Explain injects the same guard closure the live path uses, including its `$.fs.stat` resolution step (the `resolved` input of Draft 05), so guard results for paths that resolve elsewhere (a symlink) equal the live ones. The resolution is read-only. A path whose resolution fails is checked by its spelling, as live.
- **Exactness.** Limited as follows:
  - A `deny` from a rule, a guard, the subagent-Bash rule or `malformed` input is exact for a **main-session, non-headless** call, apart from a Claude Code deny that explain cannot see.
  - Every result for `--agent`, whatever its verdict, is flagged as an **approximation**: a real assignment could allow the call. A `subagent-bash` deny is included.
  - An `ask` converted to `deny` by the headless rule is flagged as an approximation (the real Claude Code verdict decides whether the ask arises).
  - The note on a non-deny result depends on where the result comes from. A result from an **active allow rule** carries "unless Claude Code denies" (an active allow overrides a Claude Code ask). A result from the stand-in verdict (`source` `claude-code`: an unmatched non-Bash call, which takes the stand-in `allow`) carries "unless Claude Code denies or asks" and the flag "Claude Code's own verdict was assumed to be allow". Other non-deny results (an `ask` from a rule, a guard, `bash-downgrade` or `malformed`) carry "unless Claude Code denies".
- **`hooks/explain.ts`.** A new pure module holds the exactness notes and the formatting of a decision (with its `chain`) as text. `/gate-explain` (wired in `register.ts`) imports it. It imports only types from `policy.ts` (the decision type is one of them), uses no `$` and does no I/O.
- **Rule chain.** The `chain` field of Draft 03's decision lists the rules and guard results considered, in decision order. It is for display only and never affects the verdict (Draft 03 tests that). Decision order: a Claude Code deny passes through first; (1) a subagent calls Bash and no active allow rule matches: deny; (2) a covered write tool targets a protected path: deny; (3) deny beats ask beats allow across the active set; (4) unmatched keeps Claude Code's verdict.
- **Bash metacharacters.** Bash allow rules match only if the command has none of `BASH_METACHARACTERS` (Draft 03). The chain says when this is why an allow rule did not match.
- **`/gate-explain` is a dry run of one call.** It builds the same `call` as Draft 12, `{ toolName, input, agentId?, toolCallId? }`, and runs the shared path with a no-op `log`, the session's real headless state (`gate.headless`) and the stand-in verdict. It never writes to the decision log or the assignment records. It does not execute the call. "No side effects" is structural: Draft 06's pending-record write lives in `register.ts`, outside `gate.ts`, after the shared path returns a non-deny verdict for an Agent call. Explain never runs that code.
- **Registration.** `/gate-explain` is registered in `session.start` with `$.command.register({ name: 'gate-explain', description, argumentHint, immediate: true })` and served by `on('command.run', { command: 'gate-explain' }, ...)`. The hook gets the raw argument text in `e.args`, exactly as typed, so odd spacing in a Bash command survives. It returns `{ text }`, and has a `.catch` that returns an error `{ text }` like Draft 04's commands.

## Existing code

- `hooks/policy.ts`: pure; `decide` (Draft 03) returns the optional `chain`.
- `hooks/gate.ts` (Draft 12): the shared path, with the `withChain` option. `hooks/guards.ts` (Draft 05): the real guards and `redirectHint`. `hooks/assignment.ts` (Draft 06): `effectiveSet`, `checkAssignment`, `parseAssignmentMarker`. `profileHint` is part of `gate.ts`.
- `hooks/explain.ts` (new, this issue): pure; the exactness notes and the text formatting of a decision and its chain. It imports only types from `policy.ts` (the decision type is one of them), the same wording as Drafts 04 and 07. It is added to the coverage include list in `vitest.config.ts` (95% thresholds), to the `mutate` list in `stryker.config.json` and to a dependency-cruiser purity rule (like `policy-is-pure`). Add it to the `entry` list in `knip.json` if knip reports it unused before `register.ts` imports it.
- `hooks/register.ts`: wiring; this draft registers `/gate-explain` there (Draft 04 shows the pattern). Nothing imports `register.ts`.

## Goal

Show, for a single call, what the gate would decide and why.

## Scope

- `/gate-explain [--agent <id>] <tool> <input>`: for `Bash`, the command is the rest of the raw argument text after the tool name and one separating space, passed unmodified (odd spacing is kept, so it matches the live path). For any other tool, the rest of the line is a JSON object used as `call.input`, for example `/gate-explain mcp__mcp-workspace__edit_file {"file_path": ".claude/settings.json"}`. Tool names are the full names, as in the rules: a bare `edit_file` matches no baseline rule. `--agent <id>` simulates a subagent call (`agentId` set) with no assignment (see **Effective set per call**). Invalid JSON prints usage. It prints the verdict, source, rule, profile, the message and the rule chain, with the notes of **Exactness**, formatted by `hooks/explain.ts`.
- New pure module `hooks/explain.ts` (exactness notes and decision formatting), in the coverage, mutation and purity gates.
- The command registration, hook and `.catch` in `register.ts`.

## Out of scope / later

Replay of a session transcript (`npm run replay`; a Later item in `docs/design.md`). Replaying subagent profile assignments exactly. Graphical output. Asking Claude Code for the real verdict.

## Acceptance criteria

- [ ] `/gate-explain` lists each rule and guard result considered, in order (the `chain`), and the final verdict, source, rule and profile.
- [ ] `/gate-explain Bash <command>` takes the rest of the raw line after the tool name and one space as the command, unmodified: `/gate-explain Bash git  status` (two spaces) and a command with leading or trailing spaces reach the shared path exactly as typed after that one space, so they match as on the live path. Explaining a Bash command with a metacharacter says why an allow prefix rule did not match.
- [ ] `hooks/explain.ts` is pure: it imports only types from `policy.ts` (the decision type is one of them), `/gate-explain` imports it for the notes and the text of a decision and its chain, and it is in the coverage include list (95%), the Stryker `mutate` list and a dependency-cruiser purity rule (`npm run arch` and `npm run test:coverage` pass).
- [ ] `/gate-explain mcp__mcp-workspace__edit_file {"file_path": ".claude/settings.json"}` parses the JSON as `call.input` and shows `deny` from a protected-path guard, exact (main session, not headless).
- [ ] `/gate-explain mcp__mcp-workspace__read_file {"file_path": "README.md"}` shows `allow` from the baseline, with "unless Claude Code denies" (an active allow rule overrides a Claude Code ask, so "or asks" is not added). An unmatched non-Bash call (for example `/gate-explain Edit {"file_path": "src/x.ts"}` with no rule for it) shows `allow` with `source` `claude-code`, "unless Claude Code denies or asks" and the note that Claude Code's verdict was assumed to be allow; an unmatched `Bash` command such as `npm install` shows `ask` (`bash-downgrade`), "unless Claude Code denies". A Bash call with a missing `command` cannot be typed (the rest of the line is the command), so the row is a table test on `gate.ts` and `hooks/explain.ts` with a hand-built call: `ask` (`malformed`), "unless Claude Code denies", exact when it is a deny (under `deny Bash`, a rule deny).
- [ ] `/gate-explain <tool> <invalid JSON>` prints usage and decides nothing.
- [ ] `--agent <id>` decides the call as a subagent call with no assignment (a Bash call without an allow rule gives `subagent-bash`), using the baseline plus the main session's active deny and ask lists: with a profile active whose `deny` list has `Edit`, `/gate-explain --agent a1 Edit {...}` shows `deny`. Every `--agent` result, whatever its verdict, is flagged as an approximation.
- [ ] `/gate-explain Agent {"prompt": "mode-gate-profiles: x\n..."}` with `x` not held (or non-delegable, or unknown) shows `deny` from a guard (`checkAssignment`), naming `x`; with `x` switched on and delegable it does not deny. The marker is read with `parseAssignmentMarker`, so CRLF, spacing around commas, `a,,b` and duplicates behave as in Draft 06, and a marker on a later line is ignored. No pending or bound record is written.
- [ ] `/gate-explain --agent a1 Agent {"prompt": "mode-gate-profiles: x\n..."}` is denied by `checkAssignment` (`guard`) for any `x`, even with `x` switched on in the session: the simulated subagent holds nothing beyond the baseline. A call with no marker is not denied by the guard.
- [ ] The path builds `chain` only with `withChain`, which explain sets and the live hooks do not: the same call gives a decision without `chain` on the live path and with it in explain, and the verdict, `source`, `rule`, `profile` and `message` are identical (test through `gate.ts`).
- [ ] Explain computes the effective set by calling Draft 06's pure `effectiveSet` directly with explicit lists (the session's switched-on profiles), not by reading the assignment state (test with no assignments in state; the live closure wraps the same helper).
- [ ] The shared path takes the effective set as an injected function of the call; explain injects the no-assignment subagent set for `--agent` (test with a fake function).
- [ ] Explain shows the same denial text as the live call because both run `gate.ts`'s `profileHint` with their own `availableProfiles(call)` (test: a denied subagent call through `gate.ts` with a fake `availableProfiles` gives the hint text explain prints).
- [ ] Explain injects the same guard closure as the live path, including its `$.fs.stat` resolution: with a fake `$.fs` where `docs/notes.md` resolves to `<homeDir>/.claude/settings.json`, explain shows the same guard `deny` as the live call (test).
- [ ] For a main-session call in a non-headless session that the mod denies (source `rule` or `guard`), explain and the live `tool.check` with a Claude Code verdict of `allow` give the same `deny` (shared test through `gate.ts`).
- [ ] `/gate-explain` writes no decision-log entry and no assignment record (an accepted Agent call through explain leaves no record; `npm run arch` passes). In a headless session (`gate.headless`) it shows the `deny` the real call would get (an `ask` converted by the headless rule), flagged as an approximation.
- [ ] Notes per case in explain output (table test on `hooks/explain.ts`; one row per source, per call kind and per headless state):
  - main-session, non-headless `deny` (`rule`, `guard`, `malformed` input under a deny rule): exact, no note;
  - any result for `--agent` (any verdict, including a `subagent-bash` deny): flagged as an approximation;
  - an `ask` converted to `deny` by the headless rule (also `malformed`: a Bash call with a missing `command`): flagged as an approximation;
  - an `allow` from an active allow rule, and an `ask` from a rule, a guard, `bash-downgrade` or `malformed`: carry "unless Claude Code denies";
  - a `claude-code` result (the stand-in allow for an unmatched non-Bash call): carries "unless Claude Code denies or asks" and the assumed-allow note.
- [ ] `/gate-explain` is registered with `immediate: true`, a description and an `argumentHint`, and its `.catch` returns an error `{ text }` and changes nothing.
- [ ] README documentation is Draft 13's; the examples it needs come from the rows above.
- [ ] `npm run check` passes.

## How to start

First failing test: explaining `Edit` of `.claude/settings.json` under the baseline gives `deny` (`guard`, exact) with a one-entry chain; explaining the unmatched Bash command `npm install` gives `ask` (`bash-downgrade`). The working tree's own `hooks/policy.ts` is not protected (Draft 05), so it must not be used for the deny row.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 02, Draft 03, Draft 04, Draft 05 (the real guards), Draft 06 (the subagent effective set and `checkAssignment`), Draft 12 (the shared path, including `profileHint`).

## References

- [Commands](../design.md#commands)
- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Decision log](../design.md#decision-log)
- [Later](../design.md#later)
- [API notes](../mods-api-notes.md)
