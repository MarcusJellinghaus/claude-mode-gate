# Policy: pure decide() function

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 03 of 11 (plan: Draft 00). `decide()` is the security boundary. Draft 04 wires it to `tool.check`, Draft 05 adds guards, Draft 06 adds subagent rules, Draft 08 reuses it for `/gate-explain` and replay.

## Design decisions this issue relies on

**Decision order.** The first match wins:

1. A subagent calls Bash and no active allow rule matches the call (an ask or deny rule does not count as holding it): deny. `decide` works from the agent context in its input (Draft 04 sets it: a call is a subagent call only when the event carries an agent id that identifies a subagent; every other call is a main-session call). It reports `source` = `subagent-bash` and builds no text; `register.ts` (Draft 04) adds the redirect text from `redirectHint`, a stub until Draft 05 supplies the real one. The rule works from Draft 04 on, with no need for Draft 06.
2. Edit or Write targets a protected path: deny (Draft 05 supplies the list).
3. Across the active set (baseline plus switched-on profiles), deny beats ask beats allow.
4. A call that matches nothing keeps Claude Code's own verdict.

A deny from Claude Code is never overridden. An allow from Claude Code is downgraded to ask for Bash unless an active rule allows the call. An active allow rule overrides Claude Code's own ask (that is what the Bash downgrade means), but never Claude Code's own deny. When Claude Code's own verdict is unavailable (assumption 7), `decide` treats it as `ask`: an unmatched Bash call asks with `source` = `bash-downgrade` (Bash is the weak spot, and this ask is the mod's own), and an unmatched non-Bash call asks with `source` = `default`.

**Guards compose with the rules; they never override them.** The guards are pure functions in `hooks/guards.ts` (Draft 05 owns them). `register.ts` calls them with the tool call and passes their results to `decide`. Each result is `{ kind: 'deny' | 'ask', message: string }`, or nothing. `decide` computes no paths. A `deny` result (protected path) is a step-2 deny. An `ask` result (the ask-path guard: `package.json`, `scripts/`, tool configs) is an ask source at step 3, so a profile `deny *` still wins over it (deny beats ask beats allow). A guard never turns a deny into an ask or an allow. `decide` passes the guard's `message` through to its decision.

**Matching.** Version 1 matches non-Bash tools by whole-tool rules only, and Bash by exact and prefix rules in Claude Code's syntax (`Bash(git commit *)`, `Bash(npm run check)`). Whole-tool rules: `*` covers every tool; a bare `mcp__<server>` covers every tool of that server; `mcp__<server>__<tool>` and plain tool names (`Skill`, `Edit`) match exactly. A whole-tool `Bash` rule or `*` matches every Bash call, whatever the command. Draft 02's parser rejects every other rule form (an argument on a non-Bash tool, a mid-string `*`), so `decide` never sees one.

Bash matching has two modes. Metacharacters are `&` `;` `|` `$` `(` `)` `` ` `` `<` `>` and a newline.

- **Allow rules (strict).** An exact rule needs equality, a prefix rule needs `startsWith`. If the command contains any metacharacter, an allow rule never matches, so the call asks.
- **Deny and ask rules (boundary-checked substring), always, with or without metacharacters.** The text tested is the rule's prefix with trailing whitespace removed (`git push` for `Bash(git push *)`) or, for an exact rule, the rule text trimmed (`rm -rf /` for `Bash(rm -rf /)`). It must appear in the command (a) preceded by the start of the command, whitespace or a metacharacter, and (b) followed by whitespace, a metacharacter or the end of the command. Every occurrence is tested; one occurrence that passes both tests is enough. Test (b) is skipped only for prefix rules whose trimmed prefix ends in a colon, such as `Bash(npm run check:*)` (prefix `npm run check:`), because `npm run check:docs` continues with word characters. Exact rules always need (b). An empty prefix (`deny Bash(*)`, `ask Bash(*)`) always matches. A literal `startsWith("git push ")` would miss bare `git push` and `git push<TAB>origin`, and an exact-equality `Bash(rm -rf /)` would miss `rm -rf / b`, so those denies would be inert for the plainest commands. So `deny Bash(git push *)` fires on `git push`, `x; git push`, `git push origin main` and `xgit push; git push`, but not on `git pushd`; `deny Bash(rm -rf /)` fires on `rm -rf /`, `rm -rf / b` and `a; rm -rf /`, but not on `rm -rf /tmp` (test (b) fails).

Nothing is trimmed or normalised: odd spacing that misses an allow rule falls through (ask for Bash). Matching by argument is later.

**Baseline.** Reads: mcp-workspace read tools (files, directories, search, reference projects, read-only `git`, GitHub reads, `check_*`). Writes: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`. Checks: exact `npm run` scripts `check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:*`, `audit`. `npm ci` and `npm install` ask. Also Skill, Agent, web fetch and web search. Ask: edits to `package.json`, `scripts/` and tool configs. Deny: protected paths. These two are path guards (Draft 05), not profile rules, because the v1 grammar cannot say "edit tool, but only for this path". Git writes are not in the baseline; all other Bash asks.

**Malformed input** is a Bash call whose `command` is missing or not a string, or any call with no tool name. No allow rule matches it, not even a whole-tool `Bash` or `*` rule, so `decide` returns `ask` (a subagent's malformed Bash call is a step-1 deny; Claude Code's own deny still stands). An **unknown non-Bash tool** that no active rule matches keeps Claude Code's own verdict, including its allow: the mod neither loosens nor tightens what it does not know.

## Existing code

- `hooks/policy.ts`: currently one line, `export type Verdict = "allow" | "ask" | "deny"`. It must stay free of imports, `$`, state and I/O. `tests/repo-structure.test.ts` and `.dependency-cruiser.cjs` (`policy-is-pure`) enforce this.
- `vitest.config.ts`: coverage threshold 95% (lines, functions, branches, statements) on `hooks/policy.ts`. `stryker.config.json`: mutates `hooks/policy.ts`, `break` at 75, `low` 80, `high` 90. CI runs mutation weekly and on demand (`.github/workflows/ci.yml`, job `mutation`).
- `CLAUDE.md` "Testing strategy": table-driven tests through `decide`, a negative test for every security rule, no real `~/.claude`, network or clock.

## Goal

Implement `decide()` in `hooks/policy.ts` with the decision order above, pure and fully tested. The input is the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the Bash command or file path, and the agent id and tool-call id when the event carries them; Draft 04 builds it), the active set (the baseline in the shape above plus the switched-on profiles; for a subagent call, Draft 06 supplies the baseline, its assigned profiles and the main session's deny and ask lists), the list of guard results (`{ kind: 'deny' | 'ask', message }` from Draft 05's `hooks/guards.ts`), the agent context and Claude Code's own verdict. The output is a decision `{ verdict, source, rule?, profile?, message? }`. `source` says what fired and is one of a closed list: `rule` (a profile or baseline rule), `guard` (a guard result), `subagent-bash` (decision-order step 1), `bash-downgrade` (the ask from the rule "a Bash call Claude Code would allow is downgraded to ask unless an active allow rule matches", also the ask for an unmatched Bash call when Claude Code's verdict is unavailable), `malformed` (malformed input), `claude-code` (Claude Code's own verdict passed through) and `default` (the ask for an unmatched non-Bash call when Claude Code's verdict is unavailable). `rule` is the matched rule's `raw`; `profile` is its profile name (`baseline` for baseline rules). `message` is the firing guard's message, passed through unchanged. Draft 04 builds the hook result `{ verdict, message? }` from it. When `source` is `subagent-bash`, `register.ts` calls `redirectHint(command)` (Draft 05, `hooks/guards.ts`) and puts its text in `message`; `decide` builds no redirect text. The profile hint for denials (which profile would be needed) is added by Draft 06, also in `register.ts`, from the full decision; `decide` builds no hint text. Drafts 07 and 08 use `source`. Field names other than `verdict`, `source`, `rule`, `profile` and `message` are the implementer's choice.

## Scope

- Build the matching on the `Profile` and `Rule` types in `hooks/policy.ts`. Whichever of Draft 02 or Draft 03 starts first defines them there and says so in its PR; the other builds on them. A `Rule` is `{ tool, kind: 'whole' | 'exact' | 'prefix', arg?, raw }` (`arg` for exact and prefix), where `raw` is the original rule string. A `Profile` is `{ name, description, delegable, allow, ask, deny }` with `Rule[]` lists.
- Take the active set as input: the baseline, `{ name: 'baseline', allow: Rule[], ask: Rule[], deny: Rule[] }`, plus the switched-on profiles. Draft 02's `loadConfig` supplies the parsed baseline in `config.baseline`.
- Define the input and the decision types (see Goal). Report the rule that fired by its `raw`, its profile name and the `source`, because Draft 07 logs them and Draft 08 explains them.
- Whole-tool matching (`*`, bare `mcp__<server>`, `mcp__<server>__<tool>`, plain names) and Bash exact and prefix matching in two modes: strict for allow rules, boundary-checked substring for deny and ask rules.
- Deny beats ask beats allow; Claude Code's deny never overridden; unmatched keeps Claude Code's verdict.
- Subagent Bash rule (step 1, from the agent context in the input) and the guard results (a `deny` result at step 2, an `ask` result at step 3) as parameters, so Draft 05 and Draft 06 only supply data. `decide` does not compute paths.

## Out of scope / later

Matching by argument. Enforce mode. The guards themselves, the protected-path list and `redirectHint` (Draft 05). Agent assignment (Draft 06).

## Acceptance criteria

- [ ] Table-driven tests were written before the code.
- [ ] Every step of the decision order has a row, and so does the order itself.
- [ ] Bash rows cover `&&`, `;`, `|`, `$()`, backticks, `<`, `>`, a newline and odd spacing (tabs, double spaces, leading space). Each odd-spacing row states its expected result: the command is not trimmed or normalised, so `Bash(git commit *)` against ` git commit -m x` or `git  commit -m x` falls through and asks.
- [ ] Negative test: `gh issue edit 1 && rm -rf .` is not allowed by a prefix rule `Bash(gh issue edit *)`.
- [ ] No metacharacters: `deny Bash(git push *)` fires on `git push`, on `git push<TAB>origin` and on `git push origin main`, and does not fire on `git pushd`. `deny Bash(rm -rf /)` fires on `rm -rf /` and on `rm -rf / b`, and does not fire on `rm -rf /tmp` (exact rules always need the follow boundary).
- [ ] Deny and ask side, prefix rule: `deny Bash(git push *)` denies `x; git push`, `x && git push origin` and `x; git push<TAB>origin`; it does not fire on `x; git pushd` or `x; git pusher`. `deny Bash(git push *)` also denies `x;git push`, `git push;`, `git push&&y` and `git push` followed by a newline and another command. `ask Bash(git push *)` asks for the three matching commands; a whole-tool `Bash` or `*` rule matches `x; git push` too.
- [ ] Deny and ask side, exact rule: `deny Bash(rm -rf /)` denies `a; rm -rf /` and `a && rm -rf / b`; it does not fire on `a; rm -rf /tmp` or `a; xrm -rf /`. `ask Bash(rm -rf /)` asks for `a; rm -rf /`.
- [ ] Every occurrence is tested: `deny Bash(git push *)` denies `xgit push; git push` (the first occurrence fails the preceding boundary, the second passes).
- [ ] Colon-ending prefix: `deny Bash(npm run check:*)` fires on `x; npm run check:docs` (the follow-boundary test is skipped for this prefix rule). An exact rule never skips it.
- [ ] Claude Code's own verdict unavailable (assumption 7): an unmatched Bash call gets `ask` with `source` `bash-downgrade`; an unmatched non-Bash call gets `ask` with `source` `default`; a matching deny rule still denies.
- [ ] The subagent-Bash deny (agent context says subagent) reports `source` `subagent-bash` and no redirect text; `register.ts` (Draft 04) adds the text from `redirectHint`. The same Bash call with a main-session context is not denied by this step.
- [ ] `source` is always one of `rule`, `guard`, `subagent-bash`, `bash-downgrade`, `malformed`, `claude-code`, `default` (table test over all rows). The ask for a Bash call Claude Code would allow reports `bash-downgrade`; malformed input reports `malformed`; the unavailable-verdict ask reports `bash-downgrade` for Bash and `default` for other tools.
- [ ] Empty prefix: `deny Bash(*)` and `ask Bash(*)` match `x; git push` and `git status`.
- [ ] A rule allow overrides Claude Code's ask but not its deny: an active allow with a Claude Code ask gives allow; with a Claude Code deny it stays deny.
- [ ] Allow rules never use substring mode: `allow Bash(git status *)` and `allow Bash(npm run check)` do not match `x; git status` or `x; npm run check`.
- [ ] Step 1 holds only for allow rules: a subagent whose only matching Bash rule is an ask or deny still gets the redirect deny.
- [ ] Guards compose (rows pass guard results in, no paths): a `deny` guard result wins over a profile allow; an `ask` guard result asks despite a profile allow, but a profile `deny *` or `deny mcp__srv` wins over it; no row turns a deny into an ask or allow.
- [ ] A guard result's `message` appears unchanged in the decision, and the decision reports `source` `guard`.
- [ ] Whole-tool rows: an allow `mcp__srv` matches `mcp__srv__a` and `mcp__srv__b` but not `mcp__srv2__a`, `mcp__other__a` or `Bash`; `mcp__srv__a` matches only that tool (not `mcp__srv__ab`); a plain name (`Skill`) matches only that tool; `*` matches every tool, including `Bash` and an `mcp__` tool.
- [ ] `*` in a deny list denies every call, including a baseline-allowed read tool. `*` in an ask list asks for every call. `mcp__srv` in deny denies all tools of that server and no others.
- [ ] A Claude Code deny stays a deny in every row.
- [ ] A Claude Code allow for Bash becomes ask unless an active rule allows it.
- [ ] A decision from a rule reports `source`, that rule's `raw` and its profile name (baseline rules report `baseline`). A guard, the subagent-Bash rule and a passed-through Claude Code verdict each report their own `source` (`guard`, `subagent-bash`, `claude-code`).
- [ ] Malformed input: a Bash call with a missing or non-string `command` (even under an active `allow Bash` or `allow *`), and a call with no tool name, each return `ask`. The same Bash call from a subagent returns `deny` (step 1).
- [ ] Unknown non-Bash tool, no active rule matches: Claude Code's own verdict is passed through, allow included, with `source` `claude-code`.
- [ ] `decide` never returns allow on its own for unknown or malformed input. Allow comes only from an active allow rule or from Claude Code's own allow passed through for an unmatched non-Bash call (step 4).
- [ ] `npm run test:coverage` reaches 95% on `hooks/policy.ts`.
- [ ] `npm run test:mutation` stays above the `break` threshold of 75 (aim for the `high` of 90).
- [ ] `npm run check` passes, including `npm run arch`.

## How to start

First failing test in `tests/policy.test.ts`: `decide` of a baseline read tool with no Claude Code deny returns `allow`; then `Bash` with `npm run check && rm -rf .` returns `ask`.

## Open questions

None. Settled: a Bash command containing a metacharacter, even inside quotes (`git commit -m "a;b"`), never matches an allow rule, so it asks. This is safe and may be annoying; v1 accepts it.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 01 (input shapes: assumptions 1, 2 and 7). It can run in parallel with Draft 02. `Profile` and `Rule` are defined in `hooks/policy.ts` by whichever of the two starts first; the other builds on them (say so in the PR).

## References

- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Baseline](../design.md#baseline)
- [Testing](../design.md#testing)
- [Security model](../design.md#security-model)
