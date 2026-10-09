# Policy: pure decide() function

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax (`mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 03 of 13 (plan: Draft 00). `decide()` is the security boundary. Draft 12 wires it to `tool.check`, Draft 05 adds guards, Draft 06 adds subagent rules, Draft 08 reuses it for `/gate-explain`. This draft owns the `Rule` and `Profile` types and the `BASH_METACHARACTERS` constant in `hooks/policy.ts`; Draft 02 imports them.

## Design decisions this issue relies on

**Claude Code's verdict.** In `tool.check`, `next(e)` resolves to Claude Code's own verdict `{ decision, reason?, rule? }` (rules, mode, the tool's own check). The engine lets a hook answer in either direction, so a mod could turn a deny into an allow. `decide` must not: **a deny from Claude Code is returned unchanged** (`verdict` deny, `source` `claude-code`, `message` = its `reason`, `rule` = its `rule` string), before step 1. `tool.call` and `/gate-explain` have no real verdict and pass the stand-in `{ decision: 'allow' }` (Drafts 12 and 08).

**Decision order.** After the pass-through above, the first match wins:

1. A subagent calls Bash and no active allow rule matches the call (an ask or deny rule does not count as holding it): deny. A call is a subagent call when `call.agentId !== undefined`, the empty string included (Draft 12 sets it from any agent id on the event, teammates and engine forks included). `decide` reports `source` = `subagent-bash` and builds no text; the shared path in `hooks/gate.ts` (Draft 12) adds the redirect text from `redirectHint` (Draft 05).
2. A covered write tool (Draft 05) targets a protected path: deny (a `deny` guard result).
3. Across the active set (baseline plus switched-on profiles), deny beats ask beats allow. An `ask` guard result is an ask source here. **Malformed input** (below) sits in this step, after the denies: a matching whole-tool deny (`deny *`, `deny Bash`, `deny mcp__srv`; only `deny *` can match a call without a usable tool name) or a `deny` guard result still wins over `malformed`; otherwise the result is `ask` with `source` `malformed`, whatever ask or allow rules match (exact and prefix rules cannot match without a command).
4. A call that matches nothing keeps Claude Code's own verdict (`source` `claude-code`). Exception: for Bash, an `allow` from Claude Code is downgraded to `ask` with `source` `bash-downgrade`, unless an active allow rule matched.

An active allow rule overrides Claude Code's own ask (that is what the Bash downgrade means), but never its deny.

**Guards compose with the rules; they never override them.** The guards are pure functions in `hooks/guards.ts` (Draft 05 owns them). The shared path in `hooks/gate.ts` calls them and passes their results to `decide`. Each result is `{ kind: 'deny' | 'ask', message: string }`, or nothing. `decide` computes no paths. A `deny` result is a step-2 deny. An `ask` result is an ask source at step 3, so a profile `deny *` still wins over it. A guard never turns a deny into an ask or an allow. `decide` passes the guard's `message` through.

**Types (owned here).** All are exported from `hooks/policy.ts`, which stays import-free:

- `Rule` is `{ tool, kind: 'whole' | 'exact' | 'prefix', arg?, raw }`. `arg` is set for exact and prefix rules. For a prefix rule it is the prefix **verbatim, trailing space kept** (`git commit `; `Bash(git commit:*)` has the same `arg`), as Draft 02 parses it; allow matching is `command.startsWith(arg)` with no trimming (only the deny and ask test trims). `raw` is the original rule string.
- `Profile` is `{ name, description, delegable, allow, ask, deny }` with `Rule[]` lists.
- `RuleSet` is `{ name: string, allow: Rule[], ask: Rule[], deny: Rule[] }`. The baseline enters as `{ name: 'baseline', allow, ask, deny }` (Draft 02 fills `ask` and `deny` with empty lists); a `Profile` is a `RuleSet` by structure. For a subagent, Draft 06's `effectiveSet` also passes the main session's inherited deny and ask lists as `RuleSet`s: one per active profile, named after that profile, with an empty `allow`. So `profile` in the decision reports the real profile name.
- `Call` is `{ toolName, input, agentId?, toolCallId? }`. `GuardResult` is `{ kind: 'deny' | 'ask', message: string }`. `ClaudeVerdict` is `{ decision: Verdict; reason?: string; rule?: string }`. `Decision` is `{ verdict, source, rule?, profile?, message?, chain? }`. All are exported from `hooks/policy.ts`.
- Signature: `decide({ call, sets, guards, claude, withChain? }): Decision`, with `sets: RuleSet[]` (the active set, in order: baseline first, then profiles in the order supplied), `guards: GuardResult[]` and `claude: ClaudeVerdict`. Drafts 06, 08 and 12 use exactly this shape.
- **Reporting order.** `decide` walks `sets` in the order given. Within a verdict class (deny, ask, allow) the order is: guard results first, in list order, then rule results, in set order and then list order. The first match in that order is the one reported. This follows the decision order, where a deny guard result is a step-2 deny and so precedes every rule deny of step 3; an ask guard result takes the same place in the ask class for uniformity. With two matching denies, the first is the reported `rule` and `profile`. **`source` consequence:** when a guard result and a rule both apply in the same class, the decision has `source` `guard`, the guard's `message`, and no `rule` and no `profile` (so Draft 07's log entry shows `source` `guard`, `rule` null, `profile` null). The rule is not reported, and not in the chain either, because the chain stops at the first entry that fired.

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

- **Allow rules (strict).** An exact rule needs equality, a prefix rule needs `command.startsWith(arg)` with `arg` verbatim (trailing space kept, no trimming): `Bash(gh issue edit *)` has `arg` `gh issue edit `, so it matches neither `gh issue editor 1` nor the bare `gh issue edit`. If the command contains any entry of `BASH_METACHARACTERS`, an **exact or prefix** allow rule never matches, so the call asks. The exclusion does not apply to whole-tool rules: `allow Bash` and `allow *` match every Bash call, metacharacters included (`allow Bash(*)` is a prefix rule with an empty `arg`, so it does **not** match a command with a metacharacter).
- **Deny rules and ask rules (boundary-checked substring), always, with or without metacharacters.** The text tested is the rule's prefix with trailing whitespace removed (`git push` for `Bash(git push *)` and for `Bash(git push:*)`) or, for an exact rule, the rule text trimmed (`rm -rf /` for `Bash(rm -rf /)`). It must appear in the command (a) preceded by the start of the command, whitespace or a metacharacter, and (b) followed by whitespace, a metacharacter or the end of the command. Both tests apply to every rule, with no exception (`deny Bash(npm run check:*)` has the text `npm run check` and so does not fire on `npm run check:docs`). **Whitespace** in these two tests is JavaScript `\s` (tab, CR, VT, FF, NBSP and the other Unicode spaces count), the safe direction because more commands fire; allow prefixes stay a literal space and are not affected. Every occurrence is tested; one occurrence that passes both tests is enough. **String operations only:** matching uses `indexOf`/`startsWith` and character checks and never builds a regular expression from rule text, so `.`, `+`, `(`, `[`, `^`, `$` and `*` inside rule text are literal characters. An empty prefix (`deny Bash(*)`, `ask Bash(*)`) always matches. A literal `startsWith("git push ")` would miss bare `git push` and `git push<TAB>origin`, and an exact-equality `Bash(rm -rf /)` would miss `rm -rf / b`, so those denies would be inert for the plainest commands. So `deny Bash(git push *)` fires on `git push`, `x; git push`, `git push origin main` and `xgit push; git push`, but not on `git pushd`; `deny Bash(rm -rf /)` fires on `rm -rf /`, `rm -rf / b` and `a; rm -rf /`, but not on `rm -rf /tmp` (test (b) fails).

**Boundaries are only whitespace, the start and end, and a metacharacter.** A quote, a backslash, `/` and `=` are **not** boundaries. These are **known bypasses that degrade to ask**, and implementers must not "improve" the matcher to catch them: `deny Bash(git push *)` does not fire on `bash -c "git push"`, `sh -c 'git push'`, `/usr/bin/git push`, `\git push`, `git  push` (double space) or `git -C . push`; each gets `ask` with `source` `bash-downgrade` (Claude Code allow, no active allow rule matches) and never `allow`. Likewise `deny Bash(rm -rf /)` does not fire on `rm -rf /*` (the follow boundary fails): a limit of exact rules.

Nothing is trimmed or normalised: odd spacing that misses an allow rule falls through (ask for Bash). Matching by argument is later.

**Baseline.** See `docs/design.md` (Baseline); Draft 02 implements the rule data. `decide` only receives it as a rule set with allow rules. The baseline has no ask or deny rules. An unmatched Bash call such as `npm install` asks through the Bash downgrade. The path-based asks and denies are guards (Draft 05).

**Malformed input** is a Bash call whose `command` is missing or not a string, or any call whose `toolName` is not a non-empty string (missing, `undefined`, a number, an object or `""`). No allow rule matches it, not even a whole-tool `Bash` or `*` rule, so `decide` returns `ask` with `source` `malformed` at decision step 3, after the denies (a subagent's malformed Bash call is a step-1 deny; Claude Code's own deny still stands; a matching whole-tool deny or a `deny` guard result still wins). An **unknown non-Bash tool** that no active rule matches keeps Claude Code's own verdict, including its allow: the mod neither loosens nor tightens what it does not know.

## Existing code

- `hooks/policy.ts`: currently one line, `export type Verdict = "allow" | "ask" | "deny"`. It must stay free of imports, `$`, state and I/O. `tests/repo-structure.test.ts` and `.dependency-cruiser.cjs` (`policy-is-pure`) enforce this.
- `vitest.config.ts`: coverage threshold 95% (lines, functions, branches, statements) on `hooks/policy.ts`. `stryker.config.json`: mutates `hooks/policy.ts`, `break` at 75, `low` 80, `high` 90. CI runs mutation weekly and on demand (`.github/workflows/ci.yml`, job `mutation`).
- `CLAUDE.md` "Testing strategy": table-driven tests through `decide`, a negative test for every security rule, no real `~/.claude`, network or clock.

## Goal

Implement `decide()` in `hooks/policy.ts` with the decision order above, pure and fully tested. The input is `decide({ call, sets, guards, claude, withChain? })`: the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the Bash command or file path, and the agent id and tool-call id when the event carries them; Draft 12 builds it), the active set as `sets: RuleSet[]` (the baseline plus the switched-on profiles; for a subagent call, Draft 06 supplies the baseline, its assigned profiles and the main session's deny and ask lists), the list of guard results, Claude Code's verdict (`ClaudeVerdict`) and the optional `withChain` flag. The output is a `Decision` `{ verdict, source, rule?, profile?, message?, chain? }`. `chain` is built only when `withChain` is set (default false). **One definition:** the chain lists, in step, class (deny, ask, allow) and set order (guard results before rule results within a class, as in Reporting order), every rule and guard result _considered_ up to and including the first one that fired, and stops there. "Considered" means a rule or guard result that matched, or that would have matched but was skipped for a stated reason (a Bash allow rule skipped for a metacharacter); rules that simply do not apply are not listed. Each entry has its step, `raw` (or the guard message), profile and kind, and the skip reason where there is one. The chain is empty when nothing fired (the call keeps Claude Code's verdict, or Claude Code's deny was passed through). The chain is never a list of all matches: with two matching denies it ends with the first deny. Only Draft 08's `/gate-explain` asks for it; the live path never builds it (cost). It is for display only and never affects the verdict.

`source` says what fired and is one of a closed list:

- `rule`: a profile or baseline rule;
- `guard`: a guard result;
- `subagent-bash`: decision-order step 1;
- `bash-downgrade`: the ask for a Bash call that Claude Code would allow and no active allow rule matched;
- `malformed`: malformed input;
- `claude-code`: Claude Code's own verdict passed through (a deny always).

`rule` is the matched rule's `raw` (for `claude-code`, Claude Code's rule string if it gave one); `profile` is its profile name (`baseline` for baseline rules). `message` is the firing guard's message, or Claude Code's `reason`, passed through unchanged. Draft 12 builds the hook result from the decision. When `source` is `subagent-bash`, `hooks/gate.ts` puts `redirectHint(command)` in `message`; `decide` builds no redirect text or profile hint (`profileHint(decision, call)` lives in `hooks/gate.ts`, Draft 12). Field names other than `verdict`, `source`, `rule`, `profile`, `message` and `chain` are the implementer's choice.

## Scope

- The `Rule`, `Profile`, `ClaudeVerdict`, decision and input types, and `BASH_METACHARACTERS`, in `hooks/policy.ts`.
- Take the active set as input: the baseline rule set plus the switched-on profiles. Draft 02's `loadConfig` supplies the parsed baseline.
- Report the rule that fired by its `raw`, its profile name and the `source`, because Draft 07 logs them and Draft 08 explains them.
- Whole-tool matching and Bash exact and prefix matching in two modes: strict for allow rules, boundary-checked substring for deny and ask rules.
- Claude Code deny pass-through; deny beats ask beats allow; unmatched keeps Claude Code's verdict.
- The optional `chain`, built by the same code path that decides, so it cannot disagree with the verdict.
- Subagent Bash rule (step 1, from `call.agentId`) and the guard results (a `deny` result at step 2, an `ask` result at step 3) as parameters, so Draft 05 and Draft 06 only supply data.

## Out of scope / later

Matching by argument. Other Bash input fields: `decide` ignores every Bash input field other than `command`. An allow rule such as `Bash(npm run check)` therefore also covers a call that asks to run outside the sandbox (`dangerouslyDisableSandbox`), as in Claude Code itself, and the user has no prompt for it while such an allow rule is active (Draft 13 documents it). Globs in deny and ask rules. Enforce mode. The guards themselves, the protected-path list and `redirectHint` (Draft 05). Agent assignment (Draft 06).

## Acceptance criteria

- [ ] Table-driven tests were written before the code.
- [ ] Every step of the decision order has a row, and so does the order itself.
- [ ] `BASH_METACHARACTERS` is exported from `hooks/policy.ts` and a test pins its exact ten entries (`&`, `;`, `|`, `$`, `(`, `)`, backtick, `<`, `>`, newline); the backslash and CR are not in it.
- [ ] Bash rows cover each entry of `BASH_METACHARACTERS` (`&&`, `;`, `|`, `$()`, backticks, `<`, `>`, a newline) and odd spacing (tabs, double spaces, leading space). Each odd-spacing row states its expected result: the command is not trimmed or normalised, so `Bash(git commit *)` against ` git commit -m x` or `git  commit -m x` falls through and asks. A command with a backslash and no other metacharacter still matches an allow rule.
- [ ] Negative test: `gh issue edit 1 && rm -rf .` is not allowed by a prefix rule `Bash(gh issue edit *)`.
- [ ] No metacharacters: `deny Bash(git push *)` fires on `git push`, on `git push<TAB>origin` and on `git push origin main`, and does not fire on `git pushd`. `deny Bash(rm -rf /)` fires on `rm -rf /` and on `rm -rf / b`, and does not fire on `rm -rf /tmp` (exact rules always need the follow boundary).
- [ ] Deny and ask side, prefix rule: `deny Bash(git push *)` denies `x; git push`, `x && git push origin` and `x; git push<TAB>origin`; it does not fire on `x; git pushd` or `x; git pusher`. It also denies `x;git push`, `git push;`, `git push&&y` and `git push` followed by a newline and another command. `ask Bash(git push *)` asks for those three matching commands (`x; git push`, `x && git push origin`, `x; git push<TAB>origin`); a whole-tool `Bash` or `*` rule matches `x; git push` too.
- [ ] Deny and ask side, exact rule: `deny Bash(rm -rf /)` denies `a; rm -rf /` and `a && rm -rf / b`; it does not fire on `a; rm -rf /tmp` or `a; xrm -rf /`. `ask Bash(rm -rf /)` asks for `a; rm -rf /`.
- [ ] Every occurrence is tested: `deny Bash(git push *)` denies `xgit push; git push` (the first occurrence fails the preceding boundary, the second passes).
- [ ] `:*` is a prefix rule like ` *`, with no colon exception: `deny Bash(git push:*)` behaves exactly like `deny Bash(git push *)` (fires on `git push`, `x; git push origin`, not on `git pushd`), and `deny Bash(npm run check:*)` fires on `npm run check` and `x; npm run check -x` but not on `x; npm run check:docs` (the follow boundary applies to every rule). `allow Bash(git status:*)` matches `git status -s` and not `git statusx`. A colon in the middle is literal: `deny Bash(npm run check:docs)` (exact) fires on `a; npm run check:docs` and not on `npm run check`.
- [ ] Whitespace is JavaScript `\s` for deny and ask rules: `deny Bash(git push *)` fires on a CR before `git push` (`x\rgit push`), on a NBSP (U+00A0) before it (`x` + U+00A0 + `git push`), on a NBSP after it (`git push` + U+00A0 + `origin`) and on a tab; the allow side stays literal: `allow Bash(git status *)` does not match `git` + U+00A0 + `status -s` (falls through and asks).
- [ ] Rule text is never compiled to a regular expression: with regex characters in rule text, `deny Bash(grep a.b *)` fires on `grep a.b f` and not on `grep aXb f`; `deny Bash(echo (x) *)` fires on `echo (x) y` (the command's own metacharacters do not matter on the deny side); `deny Bash(echo a+b *)`, `deny Bash(echo [a] *)` and `deny Bash(echo ^a$ *)` fire on `echo a+b x`, `echo [a] x` and `echo ^a$ x` and not on the strings a regular expression would match (`echo aab x`, `echo a x`, `echo a x`). No rule text throws.
- [ ] Empty prefix: `deny Bash(*)` and `ask Bash(*)` match `x; git push` and `git status`.
- [ ] Boundary limits (rows, each expecting `ask` with `source` `bash-downgrade` under a Claude Code `allow`, never `allow`): `deny Bash(git push *)` does not fire on `bash -c "git push"`, `sh -c 'git push'`, `/usr/bin/git push`, `\git push`, `git  push` (double space) or `git -C . push`; `deny Bash(rm -rf /)` does not fire on `rm -rf /*`. The quote, backslash, `/` and `=` are not boundaries, and the issue lists these as known bypasses that degrade to ask, so nobody widens the matcher.
- [ ] Allow rules never use substring mode: `allow Bash(git status *)` and `allow Bash(npm run check)` do not match `x; git status` or `x; npm run check`.
- [ ] Prefix `arg` is verbatim: `allow Bash(gh issue edit *)` matches `gh issue edit 1` and does not match `gh issue editor 1` or the bare `gh issue edit`.
- [ ] The metacharacter exclusion applies only to exact and prefix allow rules: against `a && b`, `allow Bash` and `allow *` allow, while `allow Bash(*)` (prefix, empty `arg`) does not match and the call asks.
- [ ] Reporting order: with two matching deny rules (in two sets, and in one list), the decision reports the first in set order, then list order, and it is the last entry of the `chain` (the chain stops at the first that fired, so the second deny is not listed). With a matching deny guard result and a matching deny rule, the guard is reported (`source` `guard`, no `rule`, no `profile`, the guard's `message`); the same for an ask guard result and an ask rule; with a deny rule and an ask guard result the deny rule wins (class order).
- [ ] `decide({ call, sets, guards, claude, withChain? })` has the signature in Types; a subagent's inherited deny/ask `RuleSet` (named after its profile, empty `allow`) reports that profile name in `profile`. `call.agentId` of the empty string counts as a subagent call.
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
- [ ] Malformed input: a Bash call with a missing or non-string `command` (even under an active `allow Bash` or `allow *`), and a call whose `toolName` is not a non-empty string (missing, `undefined`, `""`, a number, an object; table rows for each), each return `ask` with `source` `malformed`. The same Bash call from a subagent returns `deny` (step 1). Order rows: malformed input with `deny *`, with `deny Bash` and with a `deny` guard result returns `deny` (not `malformed`); with `ask Bash`, `allow Bash` or an `ask` guard result it returns `ask` with `source` `malformed`.
- [ ] `decide` never returns allow on its own for unknown or malformed input. Allow comes only from an active allow rule or from Claude Code's own allow passed through for an unmatched non-Bash call.
- [ ] The verdict, `source`, `rule`, `profile` and `message` are identical with and without `withChain` (table test over all rows); when built, `chain` follows the one definition in Goal: the rules and guard results considered, in step, class and set order, up to and including the first one that fired, and empty when nothing fired. A Bash allow rule skipped for a metacharacter appears with that reason. Without `withChain` the decision has no `chain`.
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

None. The input shapes are verified in `docs/mods-api-notes.md`: assumptions 1 and 7 are verified, assumption 2 is partly verified (open: does `tool.check` fire after a `tool.call` deny; it does not affect `decide`), per the table in `docs/design.md`. It starts after PR #1 is merged and can run in parallel with Draft 01. Draft 02 builds on the types defined here.

## References

- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Baseline](../design.md#baseline)
- [Testing](../design.md#testing)
- [Security model](../design.md#security-model)
- [API notes](../mods-api-notes.md)
