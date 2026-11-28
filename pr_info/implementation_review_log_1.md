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
