# Step 3: protected Claude Code asks

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_3.md` exactly. Steps 1 and 2 are done: `decide` handles whole-tool rules and guard results. Work test-first: add the rows below, see them fail with `npm run test -- tests/policy.test.ts`, then implement. Then run `npm run format`, `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts` and `CHANGELOG.md` with `git_commit` (`paths`), message `feat(policy): keep Claude Code asks from a setting, hook or plugin`.

## WHERE

- `hooks/policy.ts` (split the allow walk out of `walk`)
- `tests/policy.test.ts` (add a protected-ask table to `ROWS`, add chain rows)
- `CHANGELOG.md` (extend the `decide()` entry)

## WHAT

```ts
const PROTECTED_ASK = "Claude Code ask from a setting, hook or plugin"; // chain skip reason
function isProtectedAsk(claude: ClaudeVerdict): boolean;
// decision "ask" and at least one of setting, hook, plugin !== undefined ("" counts)
function allowWalk(
  input: DecideInput,
  name: string | undefined,
  chain: ChainEntry[] | undefined,
): Decision | undefined;
```

`walk` keeps the deny and ask classes; `allowWalk` replaces `walk("allow")`.

## HOW

A protected ask is only a skip reason. Deny rules and deny guards still win (the deny walk runs first), ask rules and ask guards still give `ask` (the ask walk runs before the allow walk). When the allow walk skips every match, `decide` reaches the final `fromClaude(claude, claude.decision)` and returns Claude Code's ask with its `reason` and `rule`: no extra return branch.

## ALGORITHM

```text
allowWalk: protectedAsk = isProtectedAsk(claude)
  for set of sets, rule of set.allow: if not wholeMatches(rule, name, "allow"): continue
    entry = { step: 3, cls: "allow", text: rule.raw, profile: set.name }
    if protectedAsk: chain?.push({ ...entry, skipped: PROTECTED_ASK }); continue
    chain?.push(entry); return { verdict: "allow", source: "rule", rule: rule.raw, profile: set.name }
  return undefined
```

## DATA

Under a protected ask with a matching allow rule: `{ verdict: "ask", source: "claude-code", message: <reason>, rule?: <Claude Code rule> }`, chain listing every matching allow rule with `skipped: "Claude Code ask from a setting, hook or plugin"`.

## Tests

Use a non-Bash tool (`mcp__srv__a` under allow `mcp__srv__a`); the Bash rows follow in steps 4 and 5.

- Claude Code ask with `setting: "blockReadsOutsideWorkingDirectories"` and a `reason` → `{ verdict: "ask", source: "claude-code", message: <reason> }`; the same with `hook` and with `plugin`; with Claude Code's `rule` given it is carried.
- `setting: ""` is still protected.
- A plain Claude Code ask (none of the three fields) with the same allow rule → `allow`, `rule`.
- A matching deny rule with a protected ask → `deny`, `rule`; a deny guard result → `deny`, `guard`.
- A matching ask rule with a protected ask → `ask`, `rule`.
- A protected-looking field on a Claude Code `allow` (`setting` set, `decision: "allow"`) does not block the allow rule → `allow`, `rule`.

Chain rows (`withChain: true`):

- The first protected row → `[{ step: 3, cls: "allow", text: "mcp__srv__a", profile: "baseline", skipped: "Claude Code ask from a setting, hook or plugin" }]`.
- Two matching allow rules (in two sets) under a protected ask → both listed as skipped, in set order.

## CHANGELOG

Extend the `decide()` entry: an allow rule never overrides a Claude Code ask that carries `setting`, `hook` or `plugin`.
