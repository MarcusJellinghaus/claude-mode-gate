# review-implementation review log 1

## Round 1 — 2026-11-28

**Findings**:

tests/fixtures/policy/core.ts:168 — medium — No test calls a non-Bash tool whose input has a `command` field: here and at `bash.ts:255` the input is `{}` or `{ file_path }`. Deleting `name !== "Bash"` from `hooks/policy.ts:166` would therefore pass every test, yet it would let `allow Bash(npm run check)` allow any tool whose input is `{ command: "npm run check" }`. The same gap leaves `hooks/policy.ts:152` unchecked on the deny/ask side. Add negative rows, e.g. `call("mcp__srv__run", { command: "npm run check" })` under an exact allow, and under an exact deny.
tests/fixtures/policy/bash.ts:104 — medium — The command contains a literal NBSP (U+00A0), not `\u00A0`. This breaks the issue's "Escapes in tests" rule, and the row reads as `allow Bash(git status *)` failing to match `git status -s`, which looks like a wrong expectation.
tests/fixtures/policy/bash.ts:187 — medium — `"x git push"` and `"git push origin"` contain literal NBSP characters instead of `\u00A0`. These whitespace rows can't be read or checked at review, and an editor or formatter could silently turn the NBSP into a plain space without any test failing.
hooks/policy.ts:271 — low — `allowWalk` takes a `malformed` parameter that is always `false`, because `core` returns at line 104 before it calls `allowWalk`. It is dead data passed to `allowMatch`; drop it from `allowWalk` and pass `false`, or move the malformed check into `subagentBash`.
hooks/policy.ts:297 — low — The `rule.kind !== "whole"` branch in `wholeMatches` can never run, because both callers check `kind === "whole"` first. Typing the parameter as the whole-rule variant (`Extract<Rule, { kind: "whole" }>`) removes the branch and an equivalent mutant.
CHANGELOG.md:5 — low — "`withChain` adds the rule or guard result that decided as a `chain`" is wrong. The chain also lists allow rules skipped for a metacharacter or under a protected ask, and it can hold entries when nothing fired (`bash-downgrade`).
tests/fixtures/policy/subagent.ts:45 — low — `MALFORMED_INPUTS`, `CHECK` and `GIT_PUSH` are copies of the ones in `bash.ts:269` and `bash.ts:63-68`. Define them once in `builders.ts` (DRY).

**Decisions**:

tasks

- Add negative test rows for a non-Bash tool whose input has a `command` field (e.g. `call("mcp__srv__run", { command: "npm run check" })`). Under an exact `allow Bash(npm run check)` it must not be allowed. Under an exact `deny Bash(npm run check)` and an exact ask it must not be denied or asked by the Bash rule. These rows cover the `name !== "Bash"` checks at hooks/policy.ts:166 and hooks/policy.ts:152; put them next to tests/fixtures/policy/core.ts:168 or tests/fixtures/policy/bash.ts:255.
- In tests/fixtures/policy/bash.ts:104, replace the literal NBSP (U+00A0) in the command string with the `\u00A0` escape, per the issue's "Escapes in tests" rule. If the row is meant to show that NBSP does not count as a word separator, say so in the row's description.
- In tests/fixtures/policy/bash.ts:187, replace the literal NBSP characters in `"x git push"` and `"git push origin"` with `\u00A0` escapes. Then check the whole tests/ tree for any other literal non-ASCII whitespace and escape it too.
- Remove the always-false `malformed` parameter from `allowWalk` (hooks/policy.ts:271). Either pass `false` straight to `allowMatch`, or move the malformed check to the one place it can apply, so no dead data is passed through.
- Type the parameter of `wholeMatches` (hooks/policy.ts:297) as `Extract<Rule, { kind: "whole" }>` and delete the unreachable `rule.kind !== "whole"` branch.
- Correct CHANGELOG.md:5. The `withChain` chain lists the rule or guard result that decided plus the allow rules skipped for a metacharacter or under a protected ask, and it can hold entries even when no rule fired (e.g. `bash-downgrade`).
- Move `MALFORMED_INPUTS`, `CHECK` and `GIT_PUSH` into tests/fixtures/policy/builders.ts once, and import them in both tests/fixtures/policy/bash.ts and tests/fixtures/policy/subagent.ts in place of the duplicate definitions.

**Changes**:

applied
applied
applied
applied
applied
applied
applied
applied

## Round 2 — 2026-11-28

**Findings**:

I found two low-severity gaps and nothing above low. Both are untested branches in `hooks/policy.ts`, which would let Stryker mutants survive. The fix for each is one test row; `policy.ts` itself needs no change.

hooks/policy.ts:301 — low — No test reaches the `name === undefined` guard in `wholeMatches` through an `mcp__` rule. A call with no tool name only meets `*` and `Bash` deny rules (`core.ts:225-232`). If the guard were deleted, a malformed call under `deny mcp__srv` would throw a TypeError instead of returning `ask`/`malformed`, and no test would fail. Fix: add one row, a call with no tool name under `deny mcp__srv`, expecting `MALFORMED`.
hooks/policy.ts:303 — low — No test covers the `startsWith("mcp__")` check for plain tool names. `allowCase("Skill", "SkillX", false)` never builds the `Skill__…` name the server prefix would match, so removing the check passes every test while `allow Skill` would then allow `Skill__x`. Fix: add `allowCase("Skill", "Skill__x", false)` and `denyCase("Edit", "Edit__x", false)` next to `core.ts:93`.

**Decisions**:

tasks

- Add a test row for a call with no tool name under a `deny mcp__srv` rule, expecting `MALFORMED`. This covers the `name === undefined` guard in `wholeMatches` (hooks/policy.ts:301). Put it next to the existing no-name rows at tests/fixtures/policy/core.ts:225-232.
- Add negative rows `allowCase("Skill", "Skill__x", false)` and `denyCase("Edit", "Edit__x", false)` next to tests/fixtures/policy/core.ts:93. They cover the `startsWith("mcp__")` check for plain tool names in hooks/policy.ts:303, so the server-prefix match cannot apply to non-mcp tool names.

**Changes**:

applied
applied
applied

## Round 3 — 2026-11-28

**Findings**:

NO FINDINGS

**Decisions**:

dismiss

**Changes**:

dismiss
