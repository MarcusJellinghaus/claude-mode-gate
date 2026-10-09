# /gate-explain and offline replay

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain <tool> …`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 08 of 11 (plan: Draft 00). It lets the user check a config before trusting it, with the same code that decides live.

## Design decisions this issue relies on

- `/gate-explain <tool> …` is a dry run of one call (it builds the same `call` object as Draft 04, `{ toolName, input, agentId?, toolCallId? }`): it shows the verdict and the rule chain, and does not run the call. It uses the full decision (`verdict`, `source`, `rule?`, `profile?`) that Draft 04's shared decide path returns, not only the hook result `{ verdict, message? }`. It calls that path with a no-op `log` and the session's real headless state (both are injected, Draft 04), so a dry run never writes to the decision log and shows the verdict the real call would get.
- Replay runs offline as a command-line tool. It reads a Claude Code session transcript (JSONL) and reports what each call would have been under a given config.
- Replay uses session transcripts, not the decision log. The log records no arguments, so it cannot be replayed.
- Decision order, used for the rule chain: (1) a subagent calls Bash and no active allow rule matches this call: deny; (2) Edit or Write on a protected path: deny; (3) deny beats ask beats allow across the active set; (4) unmatched keeps Claude Code's verdict.
- Bash rules match only if the command has none of `& ; | $ ( ) \` < >` and no newline. Explain should say when this is why a rule did not match.
- Later: replay refinements, and a persistent log with arguments.

## Existing code

- `hooks/policy.ts`: pure; `decide` (Draft 03) must expose the rule chain, not only the final verdict. Add that to the result if Draft 03 did not.
- `hooks/register.ts`: wiring; this draft registers `/gate-explain` (Draft 04 shows the pattern and registers the other commands except `/gate-why`, which Draft 07 registers). The replay tool is a separate entry point under `scripts/` or `bin/`; check `knip.json` and `package.json` so it is not reported as dead code, and add an `npm run replay` script.
- `tests/`: vitest with small transcript fixtures. Never read the real `~/.claude`.
- `.dependency-cruiser.cjs`: nothing imports `register.ts`; the replay tool imports `policy.ts` and the config code (Draft 02) only.

## Goal

Show, for a single call or a whole transcript, what the gate would decide and why.

## Scope

- `/gate-explain <tool> <input>`: parse the input, run `decide`, print verdict and rule chain.
- Replay CLI: arguments transcript path and config path; one output line per tool call.
- Transcript parsing as pure code: tool name, input and agent where present.
- README usage example.

## Out of scope / later

Replaying subagent profile assignments exactly. Graphical output.

## Open questions

- A transcript does not record which profiles were active at the time. Recommend: replay takes the active profiles as an argument (default none) and reports per-call results under that set.

## Acceptance criteria

- [ ] `/gate-explain` lists each matching rule in order and the final verdict.
- [ ] Explaining a Bash command with a metacharacter says why a prefix rule did not match.
- [ ] Explain and the live `tool.check` give the same verdict for the same call (shared test).
- [ ] `/gate-explain` writes no decision-log entry, and in a headless session it shows the `deny` that the real call would get.
- [ ] Replay accepts a transcript path and config path, and prints one line per tool call with verdict and rule.
- [ ] A malformed JSONL line is reported and skipped, not fatal.
- [ ] Tests use small fixtures.
- [ ] README documents both with an example.
- [ ] `npm run check` passes.

## How to start

First failing test: a two-line JSONL fixture with one `Bash` `git status` call and one `Edit` of `hooks/policy.ts` replays to `ask` or `allow` and `deny` respectively under the baseline.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 02, Draft 03, Draft 04

## References

- [Commands](../design.md#commands)
- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Decision log](../design.md#decision-log)
- [Later](../design.md#later)
