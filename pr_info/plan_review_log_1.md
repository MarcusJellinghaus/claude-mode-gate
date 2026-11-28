# review-plan review log 1

## Round 1 — 2026-11-28

**Findings**:

pr_info/steps/step_4.md:71 — medium — The row "allow `prefix("git status ")` does not match `git status -s`" uses an invisible literal NBSP. Read as a normal space, it contradicts the row at line 69 (`git status -s` matches), and a copied test would fail or be vacuous. Write it as `"git\u00A0status -s"`.
pr_info/steps/step_4.md:84 — medium — The NBSP rows (`x` + NBSP + `git push`, `git push` + NBSP + `origin`) are written with literal NBSP characters, not escapes. They look like plain spaces, so the issue's required NBSP rows could end up as duplicate plain-space rows that test nothing. Spell them `"x\u00A0git push"` and `"git push\u00A0origin"`.
pr_info/steps/summary.md:109 — low — The escape list "(` `, `\r`, `\t`)" shows a literal NBSP where `\u00A0` was meant, so the instruction defeats itself. Write `\u00A0`.
pr_info/steps/step_5.md:48 — medium — No row covers the order between decision-order step 1 and step 2. The issue's criterion says "and so does the order itself". Add a row: an unheld subagent Bash call with a `deny` guard result gives `{ verdict: "deny", source: "subagent-bash" }`, not `guard`.

**Decisions**:

tasks

- In pr_info/steps/step_4.md:71, replace the literal NBSP in the row "allow `prefix("git status ")` does not match `git status -s`" with an explicit escape, writing the input as `"git\u00A0status -s"`, so it no longer looks like the plain-space row at line 69.
- In pr_info/steps/step_4.md:84, replace the literal NBSP characters in the NBSP rows with explicit escapes: `"x\u00A0git push"` and `"git push\u00A0origin"`.
- In pr_info/steps/summary.md:109, replace the literal NBSP in the escape list with the text `\u00A0`, so the list reads `\u00A0`, `\r`, `\t`.
- In pr_info/steps/step_5.md (around line 48), add a decision-order row for steps 1 and 2: an unheld subagent Bash call with a `deny` guard result must give `{ verdict: "deny", source: "subagent-bash" }`, not source `guard`.

**Changes**:

applied
applied
applied
applied
applied

## Round 2 — 2026-11-28

**Findings**:

pr_info/steps/step_4.md:34 — medium — `npm run check` runs `test:coverage` with a 95% branch threshold on `hooks/policy.ts` at every step (`scripts/check.mjs`, `vitest.config.ts`), but step 4 adds code that no step-4 row exercises. Nothing tests `commandOf`'s null, non-object, missing-key or non-string branches, or the `command === undefined` path of `matches`/`allowMatch`, until step 5. No row tests an exact or prefix deny/ask rule against a non-Bash tool either. So the step-4 commit may fail the gate. The same gap also leaves a Bash call with no `command` under `allow Bash` or `allow *` returning `allow` after step 4. Fix: move the malformed-`command` flag and its rows from step 5 into step 4, and add a non-Bash row for an exact deny rule.
pr_info/steps/step_5.md:5 — low — Step 5 adds the largest tables but only says to commit "any `tests/fixtures/policy/*.ts`". Unlike step 4, it never says to move the tables into fixtures if `tests/policy.test.ts` now passes 750 lines, which the issue requires (Constraints, Tests).

**Decisions**:

tasks

- In pr_info/steps/step_4.md (around line 34), move the malformed-`command` handling and its test rows from step 5 into step 4. That covers `commandOf` with a null, non-object, missing-key or non-string `command`, and the `command === undefined` path of `matches`/`allowMatch`. Make sure a Bash call with no `command` under `allow Bash` or `allow *` does not return `allow` after step 4. Also add a step-4 row that tests an exact deny rule against a non-Bash tool, so the 95% coverage gate passes at the step-4 commit. Remove the moved items from pr_info/steps/step_5.md.
- In pr_info/steps/step_5.md (around line 5), add an instruction like step 4's: if `tests/policy.test.ts` goes over 750 lines, move the tables into `tests/fixtures/policy/*.ts`, as the issue's constraints require.

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
