# Policy: pure decide() function

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 03 of 11 (plan: Draft 00). `decide()` is the security boundary. Draft 04 wires it to `tool.check`, Draft 05 adds guards, Draft 06 adds subagent rules, Draft 08 reuses it for `/gate-explain` and replay.

## Design decisions this issue relies on

**Decision order.** The first match wins:

1. A subagent calls Bash and holds no profile with a Bash rule for it: deny, with the redirect message (Draft 05 supplies the text).
2. Edit or Write targets a protected path: deny (Draft 05 supplies the list).
3. Across the active set (baseline plus switched-on profiles), deny beats ask beats allow.
4. A call that matches nothing keeps Claude Code's own verdict.

A deny from Claude Code is never overridden. An allow from Claude Code is downgraded to ask for Bash unless an active rule allows the call.

**Matching.** Version 1 matches non-Bash tools by whole-tool rules only, and Bash by exact and prefix rules in Claude Code's syntax (`Bash(git commit *)`, `Bash(npm run check)`). Whole-tool rules: `*` covers every tool; a bare `mcp__<server>` covers every tool of that server; `mcp__<server>__<tool>` and plain tool names (`Skill`, `Edit`) match exactly. Draft 02's parser rejects every other rule form (an argument on a non-Bash tool, a mid-string `*`), so `decide` never sees one. A Bash rule matches only if the command contains none of these characters: `&` `;` `|` `$` `(` `)` `` ` `` `<` `>`, and no newline. Anything unusual does not match and so asks. Matching by argument is later.

**Baseline.** Reads: mcp-workspace read tools (files, directories, search, reference projects, read-only `git`, GitHub reads, `check_*`). Writes: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`. Checks: exact `npm run` scripts `check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:*`, `audit`. `npm ci` and `npm install` ask. Also Skill, Agent, web fetch and web search. Ask: edits to `package.json`, `scripts/` and tool configs. Deny: protected paths. These two are path guards (Draft 05), not profile rules, because the v1 grammar cannot say "edit tool, but only for this path". Git writes are not in the baseline; all other Bash asks.

**Unknown input** falls back to ask or deny, never allow.

## Existing code

- `hooks/policy.ts`: currently one line, `export type Verdict = "allow" | "ask" | "deny"`. It must stay free of imports, `$`, state and I/O. `tests/repo-structure.test.ts` and `.dependency-cruiser.cjs` (`policy-is-pure`) enforce this.
- `vitest.config.ts`: coverage threshold 95% (lines, functions, branches, statements) on `hooks/policy.ts`. `stryker.config.json`: mutates `hooks/policy.ts`, `break` at 75, `low` 80, `high` 90. CI runs mutation weekly and on demand (`.github/workflows/ci.yml`, job `mutation`).
- `CLAUDE.md` "Testing strategy": table-driven tests through `decide`, a negative test for every security rule, no real `~/.claude`, network or clock.

## Goal

Implement `decide()` in `hooks/policy.ts` with the decision order above, pure and fully tested. The input is the call (tool name, tool input), the active set (the baseline in the shape above plus the switched-on profiles), the agent context and Claude Code's own verdict. The output is a verdict plus the matched rule's `raw` and the profile name that fired.

## Scope

- Build the matching on the `Profile` and `Rule` types in `hooks/policy.ts`. Whichever of Draft 02 or Draft 03 starts first defines them there and says so in its PR; the other builds on them. A `Rule` is `{ tool, kind: 'whole' | 'exact' | 'prefix', arg?, raw }` (`arg` for exact and prefix), where `raw` is the original rule string. A `Profile` is `{ name, description, delegable, allow, ask, deny }` with `Rule[]` lists.
- Take the active set as input: the baseline, `{ name: 'baseline', allow: Rule[], ask: Rule[], deny: Rule[] }`, plus the switched-on profiles. Draft 02's `loadConfig` supplies the parsed baseline in `config.baseline`.
- Define the input and output types. Return the rule that fired (reported by its `raw`) and its profile name, because Draft 07 logs them and Draft 08 explains them.
- Whole-tool matching (`*`, bare `mcp__<server>`, `mcp__<server>__<tool>`, plain names) and Bash exact and prefix matching with the metacharacter rule.
- Deny beats ask beats allow; Claude Code's deny never overridden; unmatched keeps Claude Code's verdict.
- Subagent Bash rule (step 1) and protected-path hook (step 2) as parameters, so Draft 05 and Draft 06 only supply data.

## Out of scope / later

Matching by argument. Enforce mode. The protected-path list and redirect text (Draft 05). Agent assignment (Draft 06).

## Acceptance criteria

- [ ] Table-driven tests were written before the code.
- [ ] Every step of the decision order has a row, and so does the order itself.
- [ ] Bash rows cover `&&`, `;`, `|`, `$()`, backticks, `<`, `>`, a newline and odd spacing (tabs, double spaces, leading space).
- [ ] Negative test: `gh issue edit 1 && rm -rf .` is not allowed by a prefix rule `Bash(gh issue edit *)`.
- [ ] Whole-tool rows: an allow `mcp__srv` matches `mcp__srv__a` and `mcp__srv__b` but not `mcp__srv2__a`, `mcp__other__a` or `Bash`; `mcp__srv__a` matches only that tool (not `mcp__srv__ab`); a plain name (`Skill`) matches only that tool; `*` matches every tool, including `Bash` and an `mcp__` tool.
- [ ] `*` in a deny list denies every call, including a baseline-allowed read tool. `*` in an ask list asks for every call. `mcp__srv` in deny denies all tools of that server and no others.
- [ ] A Claude Code deny stays a deny in every row.
- [ ] A Claude Code allow for Bash becomes ask unless an active rule allows it.
- [ ] A decision from a rule reports that rule's `raw` and its profile name (baseline rules report `baseline`).
- [ ] Unknown tool or malformed input never returns allow.
- [ ] `npm run test:coverage` reaches 95% on `hooks/policy.ts`.
- [ ] `npm run test:mutation` stays above the `break` threshold of 75 (aim for the `high` of 90).
- [ ] `npm run check` passes, including `npm run arch`.

## How to start

First failing test in `tests/policy.test.ts`: `decide` of a baseline read tool with no Claude Code deny returns `allow`; then `Bash` with `npm run check && rm -rf .` returns `ask`.

## Open questions

- Quoted arguments that contain a listed character (for example `git commit -m "a;b"`) do not match, so they ask. Accept this for v1 (safe, may be annoying)?

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 01 (input shapes: assumptions 1 and 7). It can run in parallel with Draft 02. `Profile` and `Rule` are defined in `hooks/policy.ts` by whichever of the two starts first; the other builds on them (say so in the PR).

## References

- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Baseline](../design.md#baseline)
- [Testing](../design.md#testing)
- [Security model](../design.md#security-model)
