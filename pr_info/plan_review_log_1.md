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
