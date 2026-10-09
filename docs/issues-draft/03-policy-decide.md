# Policy: pure decide() function

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax (`mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 03 of 13 (plan: Draft 00). `decide()` is the security boundary. Draft 12 wires it to `tool.check`, Draft 05 adds guards, Draft 06 adds subagent rules, Draft 08 reuses it for `/gate-explain`. This draft owns the `Rule` and `Profile` types and the `BASH_METACHARACTERS` constant in `hooks/policy.ts`; Draft 02 imports them.

## Design decisions this issue relies on

**Claude Code's verdict.** In `tool.check`, `next(e)` resolves to Claude Code's own verdict `{ decision, reason?, rule? }` (rules, mode, the tool's own check). The engine lets a hook answer in either direction, so a mod could turn a deny into an allow. `decide` must not: **a deny from Claude Code is returned unchanged** (`verdict` deny, `source` `claude-code`, `message` = its `reason`, `rule` = its `rule` string), before step 1. `tool.call` and `/gate-explain` have no real verdict and pass the stand-in `{ decision: 'allow' }` (Drafts 12 and 08).

**Decision order.** After the pass-through above, the first match wins:

1. A subagent calls Bash and no active allow rule matches the call (an ask or deny rule does not count as holding it): deny. A call is a subagent call when `call.agentId` is set (Draft 12 sets it from any agent id on the event, teammates and engine forks included). `decide` reports `source` = `subagent-bash` and builds no text; the shared path in `hooks/gate.ts` (Draft 12) adds the redirect text from `redirectHint` (Draft 05).
2. A covered write tool (Draft 05) targets a protected path: deny (a `deny` guard result).
3. Across the active set (baseline plus switched-on profiles), deny beats ask beats allow. An `ask` guard result is an ask source here.
4. A call that matches nothing keeps Claude Code's own verdict (`source` `claude-code`). Exception: for Bash, an `allow` from Claude Code is downgraded to `ask` with `source` `bash-downgrade`, unless an active allow rule matched.

An active allow rule overrides Claude Code's own ask (that is what the Bash downgrade means), but never its deny.

**Guards compose with the rules; they never override them.** The guards are pure functions in `hooks/guards.ts` (Draft 05 owns them). The shared path in `hooks/gate.ts` calls them and passes their results to `decide`. Each result is `{ kind: 'deny' | 'ask', message: string }`, or nothing. `decide` computes no paths. A `deny` result is a step-2 deny. An `ask` result is an ask source at step 3, so a profile `deny *` still wins over it. A guard never turns a deny into an ask or an allow. `decide` passes the guard's `message` through.

**Types (owned here).** Both are exported from `hooks/policy.ts`, which stays import-free:

- `Rule` is `{ tool, kind: 'whole' | 'exact' | 'prefix', arg?, raw }`. `arg` is set for exact and prefix rules. `raw` is the original rule string.
- `Profile` is `{ name, description, delegable, allow, ask, deny }` with `Rule[]` lists. The baseline enters the active set as a rule set `{ name: 'baseline', allow, ask, deny }` (Draft 02 fills `ask` and `deny` with empty lists).
- `ClaudeVerdict` is `{ decision: Verdict; reason?: string; rule?: string }`.

**Matching.** Version 1 matches non-Bash tools by whole-tool rules only, and Bash by exact and prefix rules in a subset of Claude Code's syntax (`Bash(git commit *)`, `Bash(npm run check)`). Whole-tool rules: `*` covers every tool; a bare `mcp__<server>` covers every tool of that server; `mcp__<server>__<tool>` and plain tool names (`Skill`, `Edit`) match exactly. A whole-tool `Bash` rule or `*` matches every Bash call, whatever the command. Draft 02's parser rejects every other rule form (an argument on a non-Bash tool, a mid-string `*`), so `decide` never sees one.

Bash matching has two modes: strict (allow rules) and boundary-checked substring (deny rules and ask rules).

**Bash metacharacters (single definition).** `BASH_METACHARACTERS` is an exported constant of `hooks/policy.ts`. Every other file and every doc refers to it by name. It holds exactly these ten entries:

```text
&  ;  |  $  (  )  `  <  >  newline
```

| Entry   | Name                            |
| ------- | ------------------------------- |
| `&`     | ampersand                       |
| `;`     | semicolon                       |
| `\|`    | pipe                            |
| `$`     | dollar sign                     |
| `(`     | left parenthesis                |
| `)`     | right parenthesis               |
| `` ` `` | backtick                        |
| `<`     | less-than sign                  |
| `>`     | greater-than sign               |
| newline | line feed (`\n`; CR is not one) |

The backslash is **not** in the list.

- **Allow rules (strict).** An exact rule needs equality, a prefix rule needs `startsWith`. If the command contains any entry of `BASH_METACHARACTERS`, an allow rule never matches, so the call asks.
- **Deny rules and ask rules (boundary-checked substring), always, with or without metacharacters.** The text tested is the rule's prefix with trailing whitespace removed (`git push` for `Bash(git push *)`) or, for an exact rule, the rule text trimmed (`rm -rf /` for `Bash(rm -rf /)`). It must appear in the command (a) preceded by the start of the command, whitespace or a metacharacter, and (b) followed by whitespace, a metacharacter or the end of the command. Every occurrence is tested; one occurrence that passes both tests is enough. Test (b) is skipped only for prefix rules whose trimmed prefix ends in a colon, such as `Bash(npm run check:*)` (prefix `npm run check:`), because `npm run check:docs` continues with word characters. Exact rules always need (b). An empty prefix (`deny Bash(*)`, `ask Bash(*)`) always matches. A literal `startsWith("git push ")` would miss bare `git push` and `git push<TAB>origin`, and an exact-equality `Bash(rm -rf /)` would miss `rm -rf / b`, so those denies would be inert for the plainest commands. So `deny Bash(git push *)` fires on `git push`, `x; git push`, `git push origin main` and `xgit push; git push`, but not on `git pushd`; `deny Bash(rm -rf /)` fires on `rm -rf /`, `rm -rf / b` and `a; rm -rf /`, but not on `rm -rf /tmp` (test (b) fails).

Nothing is trimmed or normalised: odd spacing that misses an allow rule falls through (ask for Bash). Matching by argument is later.

**Baseline.** See `docs/design.md` (Baseline); Draft 02 implements the rule data. `decide` only receives it as a rule set with allow rules. The baseline has no ask or deny rules. An unmatched Bash call such as `npm install` asks through the Bash downgrade. The path-based asks and denies are guards (Draft 05).

**Malformed input** is a Bash call whose `command` is missing or not a string, or any call with no tool name. No allow rule matches it, not even a whole-tool `Bash` or `*` rule, so `decide` returns `ask` with `source` `malformed` (a subagent's malformed Bash call is a step-1 deny; Claude Code's own deny still stands). An **unknown non-Bash tool** that no active rule matches keeps Claude Code's own verdict, including its allow: the mod neither loosens nor tightens what it does not know.

## Existing code

- `hooks/policy.ts`: currently one line, `export type Verdict = "allow" | "ask" | "deny"`. It must stay free of imports, `$`, state and I/O. `tests/repo-structure.test.ts` and `.dependency-cruiser.cjs` (`policy-is-pure`) enforce this.
- `vitest.config.ts`: coverage threshold 95% (lines, functions, branches, statements) on `hooks/policy.ts`. `stryker.config.json`: mutates `hooks/policy.ts`, `break` at 75, `low` 80, `high` 90. CI runs mutation weekly and on demand (`.github/workflows/ci.yml`, job `mutation`).
- `CLAUDE.md` "Testing strategy": table-driven tests through `decide`, a negative test for every security rule, no real `~/.claude`, network or clock.

## Goal

Implement `decide()` in `hooks/policy.ts` with the decision order above, pure and fully tested. The input is the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the Bash command or file path, and the agent id and tool-call id when the event carries them; Draft 12 builds it), the active set (the baseline plus the switched-on profiles; for a subagent call, Draft 06 supplies the baseline, its assigned profiles and the main session's deny and ask lists), the list of guard results, Claude Code's verdict (`ClaudeVerdict`) and the optional `withChain` flag. The output is a decision `{ verdict, source, rule?, profile?, message?, chain? }`. `chain` is built only when `withChain` is set (default false): the ordered list of the rules and guard results considered, each with its step, `raw`, profile and kind (and, for a Bash allow rule skipped for a metacharacter, that reason). Only Draft 08's `/gate-explain` asks for it; the live path never builds it (cost). It is for display only and never affects the verdict.

`source` says what fired and is one of a closed list:

- `rule`: a profile or baseline rule;
- `guard`: a guard result;
- `subagent-bash`: decision-order step 1;
- `bash-downgrade`: the ask for a Bash call that Claude Code would allow and no active allow rule matched;
- `malformed`: malformed input;
- `claude-code`: Claude Code's own verdict passed through (a deny always).

`rule` is the matched rule's `raw` (for `claude-code`, Claude Code's rule string if it gave one); `profile` is its profile name (`baseline` for baseline rules). `message` is the firing guard's message, or Claude Code's `reason`, passed through unchanged. Draft 12 builds the hook result from the decision. When `source` is `subagent-bash`, `hooks/gate.ts` puts `redirectHint(command)` in `message`; `decide` builds no redirect text or profile hint (`profileHint(decision, call)`, Draft 06). Field names other than `verdict`, `source`, `rule`, `profile`, `message` and `chain` are the implementer's choice.

## Scope

- The `Rule`, `Profile`, `ClaudeVerdict`, decision and input types, and `BASH_METACHARACTERS`, in `hooks/policy.ts`.
- Take the active set as input: the baseline rule set plus the switched-on profiles. Draft 02's `loadConfig` supplies the parsed baseline.
- Report the rule that fired by its `raw`, its profile name and the `source`, because Draft 07 logs them and Draft 08 explains them.
- Whole-tool matching and Bash exact and prefix matching in two modes: strict for allow rules, boundary-checked substring for deny and ask rules.
- Claude Code deny pass-through; deny beats ask beats allow; unmatched keeps Claude Code's verdict.
- The optional `chain`, built by the same code path that decides, so it cannot disagree with the verdict.
- Subagent Bash rule (step 1, from `call.agentId`) and the guard results (a `deny` result at step 2, an `ask` result at step 3) as parameters, so Draft 05 and Draft 06 only supply data.

## Out of scope / later

Matching by argument. Globs in deny and ask rules. Enforce mode. The guards themselves, the protected-path list and `redirectHint` (Draft 05). Agent assignment (Draft 06).

## Acceptance criteria

- [ ] Table-driven tests were written before the code.
- [ ] Every step of the decision order has a row, and so does the order itself.
- [ ] `BASH_METACHARACTERS` is exported from `hooks/policy.ts` and a test pins its exact ten entries (`&`, `;`, `|`, `$`, `(`, `)`, backtick, `<`, `>`, newline); the backslash and CR are not in it.
- [ ] Bash rows cover each entry of `BASH_METACHARACTERS` (`&&`, `;`, `|`, `$()`, backticks, `<`, `>`, a newline) and odd spacing (tabs, double spaces, leading space). Each odd-spacing row states its expected result: the command is not trimmed or normalised, so `Bash(git commit *)` against ` git commit -m x` or `git  commit -m x` falls through and asks. A command with a backslash and no other metacharacter still matches an allow rule.
- [ ] Negative test: `gh issue edit 1 && rm -rf .` is not allowed by a prefix rule `Bash(gh issue edit *)`.
- [ ] No metacharacters: `deny Bash(git push *)` fires on `git push`, on `git push<TAB>origin` and on `git push origin main`, and does not fire on `git pushd`. `deny Bash(rm -rf /)` fires on `rm -rf /` and on `rm -rf / b`, and does not fire on `rm -rf /tmp` (exact rules always need the follow boundary).
- [ ] Deny and ask side, prefix rule: `deny Bash(git push *)` denies `x; git push`, `x && git push origin` and `x; git push<TAB>origin`; it does not fire on `x; git pushd` or `x; git pusher`. It also denies `x;git push`, `git push;`, `git push&&y` and `git push` followed by a newline and another command. `ask Bash(git push *)` asks for the three matching commands; a whole-tool `Bash` or `*` rule matches `x; git push` too.
- [ ] Deny and ask side, exact rule: `deny Bash(rm -rf /)` denies `a; rm -rf /` and `a && rm -rf / b`; it does not fire on `a; rm -rf /tmp` or `a; xrm -rf /`. `ask Bash(rm -rf /)` asks for `a; rm -rf /`.
- [ ] Every occurrence is tested: `deny Bash(git push *)` denies `xgit push; git push` (the first occurrence fails the preceding boundary, the second passes).
- [ ] Colon-ending prefix: `deny Bash(npm run check:*)` fires on `x; npm run check:docs` (the follow-boundary test is skipped for this prefix rule). An exact rule never skips it.
- [ ] Empty prefix: `deny Bash(*)` and `ask Bash(*)` match `x; git push` and `git status`.
- [ ] Allow rules never use substring mode: `allow Bash(git status *)` and `allow Bash(npm run check)` do not match `x; git status` or `x; npm run check`.
- [ ] A Claude Code deny stays a deny in every row, unchanged: with a matching profile allow, with an `ask` guard result, with a `deny` rule, for a subagent Bash call and for malformed input. The decision has `source` `claude-code`, the Claude Code `reason` as `message` and its `rule`. Negative row: a decision never carries a verdict weaker than a Claude Code deny.
- [ ] Claude Code `allow` for an unmatched Bash call becomes `ask` with `source` `bash-downgrade` (e.g. `npm install`, `npm ci`); Claude Code `ask` for an unmatched Bash call stays `ask` with `source` `claude-code`.
- [ ] A rule allow overrides Claude Code's ask but not its deny: an active allow with a Claude Code ask gives allow; with a Claude Code deny it stays deny.
- [ ] Unknown non-Bash tool, no active rule matches: Claude Code's verdict is passed through whatever it is (allow, ask, deny), with `source` `claude-code`.
- [ ] The subagent-Bash deny (`call.agentId` set) reports `source` `subagent-bash` and no redirect text; `hooks/gate.ts` (Draft 12) adds the text. The same Bash call without `agentId` is not denied by this step.
- [ ] Step 1 holds only for allow rules: a subagent whose only matching Bash rule is an ask or deny still gets the redirect deny.
- [ ] `source` is always one of `rule`, `guard`, `subagent-bash`, `bash-downgrade`, `malformed`, `claude-code` (table test over all rows); there is no other value.
- [ ] Guards compose (rows pass guard results in, no paths): a `deny` guard result wins over a profile allow; an `ask` guard result asks despite a profile allow, but a profile `deny *` or `deny mcp__srv` wins over it; no row turns a deny into an ask or allow.
- [ ] A guard result's `message` appears unchanged in the decision, and the decision reports `source` `guard`.
- [ ] Whole-tool rows: an allow `mcp__srv` matches `mcp__srv__a` and `mcp__srv__b` but not `mcp__srv2__a`, `mcp__other__a` or `Bash`; `mcp__srv__a` matches only that tool (not `mcp__srv__ab`); a plain name (`Skill`) matches only that tool; `*` matches every tool, including `Bash` and an `mcp__` tool.
- [ ] `*` in a deny list denies every call, including a baseline-allowed read tool. `*` in an ask list asks for every call. `mcp__srv` in deny denies all tools of that server and no others.
- [ ] A decision from a rule reports `source`, that rule's `raw` and its profile name (baseline rules report `baseline`). A guard, the subagent-Bash rule and a passed-through Claude Code verdict each report their own `source`.
- [ ] Malformed input: a Bash call with a missing or non-string `command` (even under an active `allow Bash` or `allow *`), and a call with no tool name, each return `ask` with `source` `malformed`. The same Bash call from a subagent returns `deny` (step 1).
- [ ] `decide` never returns allow on its own for unknown or malformed input. Allow comes only from an active allow rule or from Claude Code's own allow passed through for an unmatched non-Bash call.
- [ ] The verdict, `source`, `rule`, `profile` and `message` are identical with and without `withChain` (table test over all rows); when built, `chain` lists the rules and guard results considered in decision order and ends with the one that fired (none when nothing matched). Without `withChain` the decision has no `chain`.
- [ ] `npm run test:coverage` reaches 95% on `hooks/policy.ts`.
- [ ] `npm run test:mutation` stays above the `break` threshold of 75 (aim for the `high` of 90).
- [ ] `npm run check` passes, including `npm run arch`.

## How to start

First failing test in `tests/policy.test.ts`: `decide` of a baseline read tool with Claude Code verdict `allow` returns `allow`; then `Bash` with `npm run check && rm -rf .` returns `ask`; then a Claude Code `deny` for a tool that a profile allows stays `deny`.

## Open questions

None. Settled: a Bash command containing a metacharacter, even inside quotes (`git commit -m "a;b"`), never matches an allow rule, so it asks. This is safe and may be annoying; v1 accepts it.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

None. The input shapes (assumptions 1, 2 and 7 in `docs/design.md`) are verified in `docs/mods-api-notes.md`. It starts after PR #1 is merged and can run in parallel with Draft 01. Draft 02 builds on the types defined here.

## References

- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Baseline](../design.md#baseline)
- [Testing](../design.md#testing)
- [Security model](../design.md#security-model)
- [API notes](../mods-api-notes.md)
