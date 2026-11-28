# Step 2: guard results in the walks

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_2.md` exactly. Step 1 is done: `decide` exists in `hooks/policy.ts` and `tests/policy.test.ts` has the builders, `ROWS`, the invariance tests and the chain table. Work test-first: add the rows below, see them fail with `npm run test -- tests/policy.test.ts`, then implement. Then run `npm run format`, `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts` and `CHANGELOG.md` with `git_commit` (`paths`), message `feat(policy): compose guard results with the rules`.

## WHERE

- `hooks/policy.ts` (modify `walk`)
- `tests/policy.test.ts` (add a guard table to `ROWS`, add chain rows)
- `CHANGELOG.md` (extend the `decide()` entry)

## WHAT

`walk(cls, …)` first checks `input.guards` for a result with `kind === cls` (only for `cls` `deny` and `ask`; guards have no `allow` kind), then the rules as before. No new exported names. `decide` computes no paths; guard results are data.

## HOW

A deny guard result is the issue's step 2 and an ask guard result an ask source at step 3. Both are simply the first entries of their class walk, so "guards before rules" is list order and a profile `deny *` still beats an ask guard (the deny walk runs first). A guard never turns a deny into an ask or an allow: Claude Code's deny is passed through before any walk.

## ALGORITHM

```text
walk(cls): for g of guards: if g.kind === cls:
    chain?.push({ step: cls === "deny" ? 2 : 3, cls, text: g.message })
    return { verdict: cls, source: "guard", message: g.message }
  (rules as in step 1)
```

## DATA

A guard decision is `{ verdict, source: "guard", message }`: no `rule`, no `profile` key. Its chain entry has no `profile` key.

## Tests

Rows (Claude Code `allow` unless stated):

- A `deny` guard result (`"protected path"`) wins over a profile allow of the tool → `{ verdict: "deny", source: "guard", message: "protected path" }`.
- An arbitrary deny guard message (`"invalid subagent assignment"`, Draft 06) behaves the same; the message is unchanged in the decision.
- An `ask` guard result asks despite a profile allow → `ask`, `guard`, its message.
- A profile `deny *` wins over an ask guard result; so does `deny mcp__srv` for `mcp__srv__a` (`source` `rule`).
- Deny guard result plus a matching deny rule → the guard is reported (`source` `guard`, no `rule`, no `profile`).
- Ask guard result plus a matching ask rule → the guard is reported.
- Deny rule plus an ask guard result → the deny rule wins (class order).
- Two deny guard results → the first one's message.
- A Claude Code deny with an `ask` guard result stays the Claude Code deny (`claude-code`).
- A Claude Code deny with a `deny` guard result stays the Claude Code deny.
- Unusable tool name with a `deny` guard result → `deny`, `guard` (not `malformed`); with an `ask` guard result → `ask`, `malformed`.
- Unknown Claude Code `decision` with a `deny` guard result → `deny`, `guard`.

Chain rows (`withChain: true`):

- Deny guard plus deny rule → `[{ step: 2, cls: "deny", text: "protected path" }]` (the rule is not listed).
- Ask guard → `[{ step: 3, cls: "ask", text: "<message>" }]`.
- Unusable tool name with an ask guard result → `[]`.

## CHANGELOG

Extend the `decide()` entry: guard results compose with the rules (a deny result denies before every rule, an ask result is an ask source that a deny rule still beats).
