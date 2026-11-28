# Step 5: subagent Bash and Bash calls without a command

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_5.md` exactly. Steps 1 to 4 are done: `decide` handles whole-tool and Bash rules, guard results, protected asks and the Bash downgrade. Work test-first: add the rows below, see them fail with `npm run test -- tests/policy.test.ts`, then implement. Then run `npm run format`, `npm run test:coverage` (95% on `hooks/policy.ts`), `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts`, `CHANGELOG.md` and any `tests/fixtures/policy/*.ts` with `git_commit` (`paths`), message `feat(policy): deny unheld subagent Bash and treat a missing command as malformed`. If `npm run test:coverage` stays below 95% after adding the rows, write one line to `pr_info/.blocked.txt` naming the uncovered lines and stop.

## WHERE

- `hooks/policy.ts` (`decide` core, `allowMatch`)
- `tests/policy.test.ts` (add the tables to `ROWS`, add chain rows)
- `CHANGELOG.md` (extend the `decide()` entry)

## WHAT

- `malformed = name === undefined || (name === "Bash" && command === undefined)` in the core; the existing malformed check after the deny walk uses it.
- `allowMatch(rule, name, command, malformed)` returns `"miss"` when `malformed`, so no allow rule, not even allow `Bash` or allow `*`, matches malformed input.
- The subagent check (the issue's step 1) right after the Claude Code deny pass-through.

## HOW

- A call is a subagent call when `call.agentId !== undefined`; the empty string counts.
- "Held" means some allow rule gives `"hit"`: `sets.some(s => s.allow.some(r => allowMatch(…) === "hit"))`. A protected Claude Code ask does not matter here: an allow rule that would be skipped for it still holds the call, so the result comes later from the protected pass-through.
- Ask and deny rules never hold a call.
- `decide` reports `source` `subagent-bash` and builds no text; `hooks/gate.ts` (Draft 12) adds the redirect text.
- When step 1 fires, the chain lists the allow rules it skipped for a metacharacter, with `step: 1`. When an allow rule holds the call, step 1 adds nothing.
- No special code for "only whole-tool denies beat malformed input": with `command` undefined, `matches` returns `false` for every exact and prefix rule, `deny Bash(*)` included.

## ALGORITHM

```text
core: if claude.decision === "deny": return fromClaude(claude, "deny")
  name, command; malformed = name === undefined or (name === "Bash" and command === undefined)
  if name === "Bash" and call.agentId !== undefined and no allow rule gives "hit":
    for each allow rule giving "meta": chain?.push({ step: 1, cls: "allow", text: rule.raw, profile, skipped: METACHARACTER })
    return { verdict: "deny", source: "subagent-bash" }
  deny walk; if malformed or not isVerdict(claude.decision): return { verdict: "ask", source: "malformed" }
  ask walk; allow walk; final pass-through (as before)
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
- Malformed Bash (missing `command`: input `{}`; non-string: `{ command: 42 }`; input `null`; input `"ls"`), no `agentId`:
  - under allow `Bash` and under allow `*` → `ask`, `malformed`;
  - under deny `*` and under deny `Bash` → `deny`, `rule`; under a `deny` guard result → `deny`, `guard`;
  - under ask `Bash` → `ask`, `malformed`; under an `ask` guard result → `ask`, `malformed`;
  - under deny `prefix("")` (`Bash(*)`) → `ask`, `malformed`;
  - with an `agentId` → `subagent-bash`;
  - with a Claude Code deny → the Claude Code deny.
- Never `allow` on its own: a table test that no malformed row and no unknown-`decision` row has `verdict` `allow`.

Chain rows (`withChain: true`):

- Malformed Bash (no `command`) under allow `Bash` → chain `[]` (no allow entry).
- Subagent `gh issue edit 1 && x` under allow `prefix("gh issue edit ")` → `subagent-bash`, chain `[{ step: 1, cls: "allow", text: "Bash(gh issue edit *)", profile: "baseline", skipped: "command contains a Bash metacharacter" }]`.
- Subagent `git push` held by allow `Bash` and denied by deny `prefix("git push ")` → chain `[{ step: 3, cls: "deny", text: "Bash(git push *)", profile: "baseline" }]` (no step-1 entry).

## CHANGELOG

Extend the `decide()` entry: a subagent's Bash call that no allow rule holds is denied (`subagent-bash`); a Bash call without a string `command` asks (`malformed`) unless a whole-tool deny or a deny guard result denies it.
