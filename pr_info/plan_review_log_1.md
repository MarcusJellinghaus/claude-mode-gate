# review-plan review log 1

## Round 1 — 2026-11-28

**Findings**:

pr_info/steps/summary.md:94 — medium — The plan puts the owner's Claude Code install between plan steps 2 and 3. The issue says to install right after the move commit, which is plan step 1. If the owner follows the issue, `package.json` lists `@anthropic-ai/claude-code` while step 2 runs, and nothing uses it until `scripts/claude.mjs` lands in step 3. So knip flags the dependency as unused and step 2's `npm run check` fails. Fix: swap steps 2 and 3, so the pin and `scripts/claude.mjs` come straight after the move. Or give step 2 a precondition that the devDependency is not installed yet.
pr_info/steps/summary.md:98 — medium — No step asks the owner to do the end-of-PR owner steps. These are the launcher check by hand, the Windows check of `plugin:validate`, the `/plugin install` check, the Linux CI comparison and the refresh-list wiki edits. The issue requires a report in the session chat or a comment on the issue, and an acceptance criterion says "the owner was asked". The summary only lists these checks. Fix: give the last step (or step 7) a task to post them as a comment on #12.
pr_info/steps/step_6.md:7 — low — The issue decides that if `cooldown` is not supported for npm, the key is left out and the owner is told. The plan instead writes to `.blocked.txt` and stops, which blocks the `exclude-patterns` change as well. Fix: commit `exclude-patterns` without `cooldown` and report the gap.
pr_info/steps/step_2.md:16 — low — `repoFiles()` walks every file, including gitignored and untracked ones such as the laid `plugin/.claude-plugin/types/`, `.scratch/` and `coverage/`. The issue asks that each dependency-cruiser rule path match at least one tracked file. An untracked file could therefore keep a stale rule path passing. Fix: skip gitignored folders, or list the files with `git ls-files`.
pr_info/steps/step_5.md:53 — low — The new "Impact on the drafts" row says `--strict` "failed from 2.1.326 on". The issue only shows that it passed on 2.1.292 and failed on 2.1.326, so the change happened somewhere between them. Fix: say it fails on 2.1.326 and passed on 2.1.292.

**Decisions**:

tasks

- pr_info/steps/summary.md:94 — Fix the step order so step 2's `npm run check` does not fail on knip's unused-dependency check. Move the owner's Claude Code install out of the gap between plan steps 1 and 2. Do this one of two ways: swap steps 2 and 3, so the `@anthropic-ai/claude-code` pin and `scripts/claude.mjs` come straight after the move commit, or give step 2 an explicit precondition that the devDependency is not installed yet. Update summary.md and the affected step files to match.
- pr_info/steps/summary.md:98 — Add a task to the last plan step that has the implementer post the end-of-PR owner steps as a comment on issue #12. The comment covers the launcher check by hand, the Windows `plugin:validate` check, the `/plugin install` check, the Linux CI comparison and the refresh-list wiki edits. This meets the 'the owner was asked' acceptance criterion.
- pr_info/steps/step_6.md:7 — Replace the `.blocked.txt`-and-stop branch. If `cooldown` is not supported for npm, leave the key out, still commit the `exclude-patterns` change, and report the gap to the owner, as the issue decides.
- pr_info/steps/step_2.md:16 — Change `repoFiles()` to list tracked files only, using `git ls-files`. The rule-path check then cannot pass because of untracked or gitignored files such as `plugin/.claude-plugin/types/`, `.scratch/` or `coverage/`.
- pr_info/steps/step_5.md:53 — Reword the 'Impact on the drafts' row: `--strict` passed on 2.1.292 and fails on 2.1.326. Drop the 'from 2.1.326 on' claim.

**Changes**:

applied
applied
applied
applied
applied
applied
