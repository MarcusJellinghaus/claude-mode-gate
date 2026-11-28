# Step 5: subagent Bash

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_5.md` exactly. Steps 1 to 4 are done: `decide` handles whole-tool and Bash rules, guard results, protected asks, the Bash downgrade and Bash calls without a string `command` (`malformed`, and `allowMatch` returns `"miss"` for malformed input). Work test-first: add the rows below, see them fail with `npm run test -- tests/policy.test.ts`, then implement. If `tests/policy.test.ts` now passes 750 lines, move the tables and builders into `tests/fixtures/policy/*.ts` as the summary describes (data and builders only; the `it.each` blocks stay in the test file). Then run `npm run format`, `npm run test:coverage` (95% on `hooks/policy.ts`), `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts`, `CHANGELOG.md` and any `tests/fixtures/policy/*.ts` with `git_commit` (`paths`), message `feat(policy): deny unheld subagent Bash calls`. If `npm run test:coverage` stays below 95% after adding the rows, write one line to `pr_info/.blocked.txt` naming the uncovered lines and stop.

## WHERE

- `hooks/policy.ts` (`decide` core)
- `tests/policy.test.ts` (add the tables to `ROWS`, add chain rows)
- `CHANGELOG.md` (extend the `decide()` entry)

## WHAT

- The subagent check (the issue's step 1) right after the Claude Code deny pass-through.

## HOW

- A call is a subagent call when `call.agentId !== undefined`; the empty string counts.
- "Held" means some allow rule gives `"hit"`: `sets.some(s => s.allow.some(r => allowMatch(…) === "hit"))`. `allowMatch` already returns `"miss"` for malformed input (step 4), so a subagent's malformed Bash call is never held. A protected Claude Code ask does not matter here: an allow rule that would be skipped for it still holds the call, so the result comes later from the protected pass-through.
- Ask and deny rules never hold a call.
- `decide` reports `source` `subagent-bash` and builds no text; `hooks/gate.ts` (Draft 12) adds the redirect text.
- When step 1 fires, the chain lists the allow rules it skipped for a metacharacter, with `step: 1`. When an allow rule holds the call, step 1 adds nothing.

## ALGORITHM

```text
core: if claude.decision === "deny": return fromClaude(claude, "deny")
  name, command, malformed (as in step 4)
  if name === "Bash" and call.agentId !== undefined and no allow rule gives "hit":
    for each allow rule giving "meta": chain?.push({ step: 1, cls: "allow", text: rule.raw, profile, skipped: METACHARACTER })
    return { verdict: "deny", source: "subagent-bash" }
  deny walk; malformed check; ask walk; allow walk; final pass-through (as before)
```

## DATA

The step-1 decision is exactly `{ verdict: "deny", source: "subagent-bash" }` (no `message`, `rule` or `profile`).

## Tests

A subagent call carries `agentId: "a1"` unless stated. Claude Code `allow` unless stated.

- Subagent `git status` with no allow rule → `{ verdict: "deny", source: "subagent-bash" }`; the same call without `agentId` → downgrade.
- `agentId: ""` counts as a subagent call → `subagent-bash`.
- Order of steps 1 and 2: subagent `git status` with no allow rule and a `deny` guard result → `{ verdict: "deny", source: "subagent-bash" }`, not `guard`.
- Held: subagent `npm run check` under allow exact `npm run check` → `allow`, `rule`; under allow `Bash` → `allow`.
- Ask or deny rules do not hold: subagent `git push` whose only matching rule is ask `prefix("git push ")` → `subagent-bash`; only deny `prefix("git push ")` → `subagent-bash`.
- Held, then denied by a rule: subagent `git push` under allow `Bash` and deny `prefix("git push ")` → `deny`, `rule`.
- Subagent non-Bash call (`Read`, no rule) → Claude Code's verdict passes through.
- Claude Code deny for a subagent Bash call stays the Claude Code deny.
- Protected ask: subagent `npm run check` held by allow exact `npm run check`, Claude Code ask with `setting` → `ask`, `claude-code` (no step-1 deny).
- Unknown `decision` (`"maybe"`) for an unheld subagent Bash call → `subagent-bash`.
- Malformed Bash from a subagent (input `{}`, `{ command: 42 }`, `null`, `"ls"`), also under allow `Bash` → `subagent-bash`.

Chain rows (`withChain: true`):

- Subagent `gh issue edit 1 && x` under allow `prefix("gh issue edit ")` → `subagent-bash`, chain `[{ step: 1, cls: "allow", text: "Bash(gh issue edit *)", profile: "baseline", skipped: "command contains a Bash metacharacter" }]`.
- Subagent `git push` held by allow `Bash` and denied by deny `prefix("git push ")` → chain `[{ step: 3, cls: "deny", text: "Bash(git push *)", profile: "baseline" }]` (no step-1 entry).

## CHANGELOG

Extend the `decide()` entry: a subagent's Bash call that no allow rule holds is denied (`subagent-bash`).
