# Step 4: Bash matching, the Bash downgrade and Bash calls without a command

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_4.md` exactly. Steps 1 to 3 are done: `decide` handles whole-tool rules, guard results and protected asks. Work test-first: add the rows below, see them fail with `npm run test -- tests/policy.test.ts`, then implement. Write the metacharacter rows as literals, not generated from `BASH_METACHARACTERS`, so a change to the constant fails a test. Do not widen the matcher to catch the bypass rows: they are required to degrade to ask. Then run `npm run format`, `npm run check`, and commit `hooks/policy.ts`, `tests/policy.test.ts` and `CHANGELOG.md` with `git_commit` (`paths`), message `feat(policy): match Bash rules strictly for allow, by boundary for deny and ask; a missing command is malformed`. `npm run check` includes `npm run test:coverage` (95% on `hooks/policy.ts`), so every branch added here needs a row in this step. If `tests/policy.test.ts` now passes 750 lines, move the tables and builders into `tests/fixtures/policy/*.ts` as the summary describes, and add those files to the commit.

## WHERE

- `hooks/policy.ts` (add Bash helpers, use them in `walk` and `allowWalk`, add the downgrade)
- `tests/policy.test.ts` (add Bash tables to `ROWS`, add chain rows)
- `CHANGELOG.md` (extend the `decide()` entry)

## WHAT

```ts
const METACHARACTER = "command contains a Bash metacharacter"; // chain skip reason
function commandOf(input: unknown): string | undefined; // input.command if it is a string
function hasMeta(command: string): boolean; // BASH_METACHARACTERS.some(m => command.includes(m))
function isBoundary(ch: string): boolean; // ch === "" || /\s/.test(ch) || BASH_METACHARACTERS.includes(ch)
function denyAskHit(text: string, command: string): boolean;
function matches(
  rule: Rule,
  name: string | undefined,
  command: string | undefined,
  cls: "deny" | "ask",
): boolean;
function allowMatch(
  rule: Rule,
  name: string | undefined,
  command: string | undefined,
  malformed: boolean,
): "hit" | "meta" | "miss";
```

`decide` reads `command = commandOf(call.input)` once, next to `name`, and passes it to the walks. It also computes `malformed = name === undefined || (name === "Bash" && command === undefined)`; the existing malformed check after the deny walk uses it instead of `name === undefined`. `allowMatch` returns `"miss"` when `malformed`, so no allow rule, not even allow `Bash` or allow `*`, matches malformed input (step 5's "held" check relies on this).

## HOW

- `commandOf` narrows: `typeof input === "object" && input !== null && "command" in input`, then `typeof … === "string"` (use bracket access only if `noPropertyAccessFromIndexSignature` demands it; `scripts/agent-bash-guard.mjs` shows the pattern).
- `walk` (deny, ask) uses `matches`; `allowWalk` uses `allowMatch` and checks the metacharacter skip before the protected skip, so a rule skipped for both shows the metacharacter reason.
- Final pass-through: a Bash call with Claude Code `allow` returns `{ verdict: "ask", source: "bash-downgrade" }`, with no `rule` and no `message` key.
- No special code for "only whole-tool denies beat malformed input": with `command` undefined, `matches` returns `false` for every exact and prefix rule, `deny Bash(*)` included.
- String operations only: never build a `RegExp` from rule text. The only regex is the fixed `/\s/` on one character. `charAt` returns `""` before the start and after the end, which `isBoundary` treats as a boundary.

## ALGORITHM

```text
denyAskHit(text, cmd): if text === "": return true
  for (i = cmd.indexOf(text); i !== -1; i = cmd.indexOf(text, i + 1))
    if isBoundary(cmd.charAt(i - 1)) and isBoundary(cmd.charAt(i + text.length)): return true
  return false
matches: whole → wholeMatches(rule, name, cls); name !== "Bash" or command undefined → false; else denyAskHit(rule.arg.trim(), command)
core: … name, command; malformed = name === undefined or (name === "Bash" and command === undefined)
  deny walk; if malformed or not isVerdict(claude.decision): return { verdict: "ask", source: "malformed" }
allowMatch: malformed → "miss"; whole → wholeMatches(rule, name, "allow") ? "hit" : "miss"; name !== "Bash" or command undefined → "miss"
  strict = kind "exact" ? command === arg : command.startsWith(arg); if not strict → "miss"; return hasMeta(command) ? "meta" : "hit"
```

## DATA

`allowMatch` result `"meta"` produces a chain entry `{ step: 3, cls: "allow", text: rule.raw, profile, skipped: "command contains a Bash metacharacter" }` and the walk continues. Rule literals: `prefix("git push ")` is `{ tool: "Bash", kind: "prefix", arg: "git push ", raw: "Bash(git push *)" }`; the `:*` form has the same `arg` and `raw: "Bash(git push:*)"`; `prefix("")` is `Bash(*)`.

## Tests

All Bash calls use input `{ command: … }`. Claude Code `allow` unless stated; "downgrade" means `{ verdict: "ask", source: "bash-downgrade" }` exactly.

Allow side (strict):

- Exact `npm run check` allows `npm run check`; `npm run check && rm -rf .` → downgrade (How to start, row 2).
- Each metacharacter on its own, one row each, under allow `prefix("echo ")`: `echo a&b`, `echo a;b`, `echo a|b`, `echo a$b`, `echo a(b`, `echo a)b`, ``echo a`b``, `echo a<b`, `echo a>b`, `echo a\nb` → downgrade; combined `echo a && b`, `echo $(id)` → downgrade; `echo a\\b` (backslash only) → `allow`; `echo a\rb` (CR only) → `allow`.
- Negative: `gh issue edit 1 && rm -rf .` under allow `prefix("gh issue edit ")` → downgrade.
- Odd spacing under allow `prefix("git commit ")`: ` git commit -m x`, `git  commit -m x`, `git\tcommit -m x` → downgrade; `git commit -m x` → `allow`.
- Verbatim prefix: allow `prefix("gh issue edit ")` matches `gh issue edit 1`, not `gh issue editor 1` or `gh issue edit` (downgrade); allow `prefix("git status ", "Bash(git status:*)")` matches `git status -s`, not `git statusx`.
- Never substring: allow `prefix("git status ")` and allow exact `npm run check` do not match `x; git status` or `x; npm run check`; nor `echo git status -s` and `x npm run check` (downgrade).
- Literal space only: allow `prefix("git status ")` does not match `"git\u00A0status -s"` (downgrade).
- Whole-tool rules ignore metacharacters: against `a && b`, allow `Bash` and allow `*` → `allow`; allow `prefix("")` (`Bash(*)`) → downgrade.
- Allow `mcp__srv` does not match a `Bash` call (downgrade).
- Unmatched Bash: Claude Code `allow` with a `reason` and `rule` for `npm install` and for `npm ci` → downgrade, no `rule`/`message` keys; Claude Code `ask` for `npm install` → `ask`, `claude-code`.
- Allow overrides a plain Claude Code ask for Bash: allow exact `npm run check`, Claude Code `ask` → `allow`.
- Protected ask: allow exact `npm run check` with Claude Code ask carrying `setting` → `ask`, `claude-code`, its `reason`; the same with `hook` and `plugin`; a deny `prefix("npm run ")` with that protected ask → `deny`, `rule`.

Deny and ask side (boundary-checked):

- `deny prefix("git push ")` fires on `git push`, `git push\torigin`, `git push origin main`, `x; git push`, `x && git push origin`, `x; git push\torigin`, `x;git push`, `git push;`, `git push&&y`, `git push\nls`, `xgit push; git push`; not on `git pushd`, `x; git pushd`, `x; git pusher` (downgrade).
- `ask prefix("git push ")` asks (`source` `rule`) for `x; git push`, `x && git push origin`, `x; git push\torigin`; whole-tool ask `Bash` and ask `*` ask for `x; git push`.
- `deny exact("rm -rf /")` fires on `rm -rf /`, `rm -rf / b`, `a; rm -rf /`, `a && rm -rf / b`; not on `rm -rf /tmp`, `a; rm -rf /tmp`, `a; xrm -rf /`; `ask exact("rm -rf /")` asks for `a; rm -rf /`.
- `:*`: `deny prefix("git push ", "Bash(git push:*)")` fires on `git push`, `x; git push origin`, not on `git pushd`; `deny prefix("npm run check ", "Bash(npm run check:*)")` fires on `npm run check`, `x; npm run check -x`, not on `x; npm run check:docs`; `deny exact("npm run check:docs")` fires on `a; npm run check:docs`, not on `npm run check`.
- `\s`: `deny prefix("git push ")` fires on `x\rgit push`, `"x\u00A0git push"`, `"git push\u00A0origin"`, `x\tgit push`.
- No regex: `deny prefix("grep a.b ")` fires on `grep a.b f`, not on `grep aXb f`; `deny prefix("echo (x) ")` fires on `echo (x) y`; `deny prefix("echo a+b ")`, `prefix("echo [a] ")`, `prefix("echo ^a$ ")` fire on `echo a+b x`, `echo [a] x`, `echo ^a$ x`; the first two do not fire on `echo aab x`, `echo a x`.
- Empty rule text: `deny prefix("")` and `ask prefix("")` match `x; git push`, `git status` and `ls`.
- Known bypasses, each a downgrade (never `allow`): `deny prefix("git push ")` against `bash -c "git push"`, `sh -c 'git push'`, `/usr/bin/git push`, `\\git push`, `git  push`, `git -C . push`; `deny exact("rm -rf /")` against `rm -rf /*`.
- Reporting order with Bash: two matching Bash deny rules in one list → the first.
- Claude Code deny for a Bash call under a matching allow stays the Claude Code deny.
- Unknown Claude Code `decision` (`"maybe"`) with a matching exact deny `rm -rf /` → `deny`, `rule`; with a matching prefix deny → `deny`, `rule`; with only a matching allow → `ask`, `malformed`.
- Bash rules never touch a non-Bash tool on the deny side: deny `exact("rm -rf /")` and deny `prefix("git push ")` with `Read` (input `{ file_path: "x" }`) under Claude Code `ask` → `ask`, `claude-code`.

Malformed Bash (missing `command`: input `{}`; non-string: `{ command: 42 }`; input `null`; input `"ls"`), no `agentId`:

- under allow `Bash` and under allow `*` → `ask`, `malformed` (never `allow`);
- under deny `*` and under deny `Bash` → `deny`, `rule`; under a `deny` guard result → `deny`, `guard`;
- under ask `Bash` → `ask`, `malformed`; under an `ask` guard result → `ask`, `malformed`;
- under deny `prefix("")` (`Bash(*)`) → `ask`, `malformed`;
- with a Claude Code deny → the Claude Code deny.
- Never `allow` on its own: a table test that no malformed row and no unknown-`decision` row in `ROWS` has `verdict` `allow` (later steps' rows of these kinds are covered too).

Chain rows (`withChain: true`):

- `gh issue edit 1 && rm -rf .` under allow `prefix("gh issue edit ")` → downgrade, chain `[{ step: 3, cls: "allow", text: "Bash(gh issue edit *)", profile: "baseline", skipped: "command contains a Bash metacharacter" }]`.
- The same command with a second set allowing `Bash` (whole) → `allow` from the second set; chain: the skipped prefix rule, then the whole-tool entry.
- Protected ask plus metacharacter: allow `prefix("gh issue edit ")`, `gh issue edit 1 && x`, Claude Code ask with `hook` → chain shows the metacharacter reason, not the protected one.
- Unknown decision: `gh issue edit 1 && x` under allow `prefix("gh issue edit ")` with `decision: "maybe"` → `ask`, `malformed`, chain `[]`.
- Malformed Bash (no `command`) under allow `Bash` → `ask`, `malformed`, chain `[]` (no allow entry).

## CHANGELOG

Extend the `decide()` entry: Bash allow rules are strict (exact or prefix, never with a `BASH_METACHARACTERS` entry in the command); Bash deny and ask rules use a boundary-checked substring test; an unmatched Bash call that Claude Code would allow asks (`bash-downgrade`); a Bash call without a string `command` asks (`malformed`) unless a whole-tool deny or a deny guard result denies it.
