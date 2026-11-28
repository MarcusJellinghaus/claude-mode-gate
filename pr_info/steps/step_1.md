# Step 1: types, `BASH_METACHARACTERS` and the `decide` core

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_1.md` exactly. Work test-first: write the tests in `tests/policy.test.ts`, run `npm run test -- tests/policy.test.ts` and see them fail, then implement in `hooks/policy.ts` until they pass. Keep `hooks/policy.ts` import-free. Then run `npm run format`, `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts` and `CHANGELOG.md` with `git_commit` (`paths`), message `feat(policy): add decide() core and policy types`.

## WHERE

- `hooks/policy.ts` (modify)
- `tests/policy.test.ts` (create)
- `CHANGELOG.md` (modify)

## WHAT

All exported types and `BASH_METACHARACTERS` exactly as listed in the summary, and:

```ts
export function decide(input: DecideInput): Decision;
// private helpers
function toolNameOf(call: Call): string | undefined; // non-empty string, else undefined
function isVerdict(value: unknown): value is Verdict; // exactly "allow" | "ask" | "deny"
function wholeMatches(rule: Rule, name: string | undefined, cls: Verdict): boolean;
function fromClaude(claude: ClaudeVerdict, verdict: Verdict): Decision; // source "claude-code", reason→message, rule→rule
function walk(
  cls: Verdict,
  input: DecideInput,
  name: string | undefined,
  chain: ChainEntry[] | undefined,
): Decision | undefined; // first matching rule of the class
```

In this step only whole-tool rules match; an exact or prefix (Bash) rule never matches (`wholeMatches` returns `false` for `kind !== "whole"`). Step 4 adds Bash matching. Guards (step 2) are ignored for now.

## HOW

- `decide` is the only exported function. Pick a set's list with a selector (`(s: RuleSet) => s.deny`), not `set[cls]` (`security/detect-object-injection`).
- Tests import `decide` and the types from `../hooks/policy` (extensionless).

## ALGORITHM

```text
decide(input): chain = input.withChain === true ? [] : undefined
  d = core(input, chain); return chain === undefined ? d : { ...d, chain }
core: if claude.decision === "deny": return fromClaude(claude, "deny")
  name = toolNameOf(call); if (d = walk("deny")) return d
  if name === undefined or not isVerdict(claude.decision): return { verdict: "ask", source: "malformed" }
  if (d = walk("ask")) return d; if (d = walk("allow")) return d
  return fromClaude(claude, claude.decision)
walk(cls): for set of sets, rule of list(set): if wholeMatches(rule, name, cls):
  chain?.push({ step: 3, cls, text: rule.raw, profile: set.name }); return { verdict: cls, source: "rule", rule: rule.raw, profile: set.name }
wholeMatches: kind !== "whole" → false; tool "*" → true; name undefined → false; name === tool → true
  tool not "mcp__…" → false; cls "allow" and tool.slice(5) contains "__" → false; else name.startsWith(tool + "__")
```

## DATA

`Decision` objects with absent keys for fields that do not apply, for example `{ verdict: "ask", source: "malformed" }`, `{ verdict: "allow", source: "rule", rule: "Read", profile: "baseline" }`, `{ verdict: "deny", source: "claude-code", message: "<reason>", rule: "<rule>" }`.

## Tests (`tests/policy.test.ts`)

Set up the builders, `ROWS`, the invariance tests and the chain table described in the summary's "Test layout". Rows (Claude Code verdict `allow` unless stated; a "no match" row uses Claude Code `ask` so the result `ask`/`claude-code` shows that nothing matched):

- `BASH_METACHARACTERS` equals exactly `["&", ";", "|", "$", "(", ")", "`", "<", ">", "\n"]`; it does not contain `\\`or`\r`.
- First row (How to start): `Read` under `set("baseline", { allow: [whole("Read")] })` → `{ verdict: "allow", source: "rule", rule: "Read", profile: "baseline" }`.
- Claude Code deny stays deny, unchanged (`source` `claude-code`, `reason` as `message`, its `rule`): with a matching profile allow, with a matching deny rule, and with no `reason`/`rule` (then no `message`/`rule` keys).
- Allow rule overrides a plain Claude Code ask → `allow`, `rule`.
- Whole-tool: allow `mcp__srv` matches `mcp__srv__a` and `mcp__srv__b`, not `mcp__srv2__a` or `mcp__other__a`; `mcp__srv__a` matches only itself, not `mcp__srv__ab`; `Skill` matches `Skill`, not `SkillX`; allow `*` matches `Read`, `mcp__srv__a` and a `Bash` call with input `{ command: "ls" }`.
- Server names with `__`: deny `mcp__my__srv` denies `mcp__my__srv__read`; allow `mcp__my__srv` does not allow `mcp__my__srv__read`; deny `mcp__srv__a` also denies `mcp__srv__a__b`.
- `*` in deny denies `Read` even when the baseline allows it; `*` in ask asks for it; deny `mcp__srv` denies `mcp__srv__a`, not `mcp__other__a`.
- Class order: allow and ask on the same tool → ask rule; allow and deny → deny rule; baseline allow plus profile `git-write` deny → deny with `profile` `git-write`.
- Reporting order: two matching denies in two sets → the first set's rule and profile; two in one list → the first in the list.
- Inherited set: `set("git-write", { deny: [whole("Edit")] })` with empty `allow` reports `profile` `git-write`.
- Unknown non-Bash tool, no rule: Claude Code `allow`, `ask`, `deny` each pass through with `source` `claude-code`, `reason` as `message`, `rule`; without `reason`/`rule` the keys are absent.
- An exact Bash rule does not affect a non-Bash tool: allow `exact("npm run check")` with `Read` under Claude Code `ask` → `ask`, `claude-code`.
- Unknown Claude Code `decision` (missing, `"maybe"`, `42`): `ask`, `malformed`, also when an allow rule and when an ask rule match; a matching deny rule (`deny *`) still denies (`source` `rule`).
- Unusable tool name (missing, `undefined`, `""`, `42`, `{}`): `ask`, `malformed`, also under allow `*`; `deny *` denies the call with no `toolName`; `deny Bash` does not (`ask`, `malformed`).
- Invariance (all `ROWS`): `source` in the closed list; no `chain` key without `withChain`; equal decision with `withChain`.
- Chain rows: an allow that fires → `[{ step: 3, cls: "allow", text: "Read", profile: "baseline" }]`; two matching denies → only the first; nothing matches → `[]`; Claude Code deny → `[]`; unknown `decision` and missing tool name under a matching allow → `[]`.

## CHANGELOG

Add one Unreleased entry at the top: `hooks/policy.ts` exports `decide()`, the pure decision function, with its types (`Rule`, `Profile`, `RuleSet`, `Call`, `GuardResult`, `ClaudeVerdict`, `Decision`) and `BASH_METACHARACTERS`; describe what this step adds (Claude Code deny pass-through, whole-tool rules, deny beats ask beats allow, fail toward ask on unknown input, optional rule chain). Later steps extend this entry.
