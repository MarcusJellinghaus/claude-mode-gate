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

## Round 2 — 2026-11-28

**Findings**:

pr_info/steps/step_3.md:23 — medium — `import config from "../vitest.config.ts"` will likely fail `npm run typecheck` with TS5097. `tsconfig.json` has no `allowImportingTsExtensions`, and no existing test imports a path ending in `.ts` (they import `.mjs`, with `moduleResolution: Bundler`). Use `import config from "../vitest.config"` (analytical).
pr_info/steps/summary.md:91 — medium — The only signal for the mid-PR owner steps is a line in `pr_info/.blocked.txt`. These are the new `.mcp-file-access` rule before step 1 and the devDependency install, binary check and `npm run audit` after the move commit. The issue says to report "in the session chat if one is attached, otherwise comment on this issue", and an acceptance criterion requires that "the owner was asked" for both. Fix: when step 1's precondition fails, or once step 1 is committed, post a comment on #12 that asks for the install and the probe output. Step 8 already does this for the end-of-PR steps.
pr_info/steps/step_4.md:74 — low — Locally the types laid in step 1 already match the pin, so `npm run typecheck` in step 4 lays nothing and never starts the pinned binary through `runClaude` on Windows. Step 2 (line 66) claims that step 4 runs it for real. Fix: have step 4 run `npm run types:lay` once (it forces a lay and is pre-approved) and confirm it prints `lay-types: ok (2.1.326)`.
pr_info/steps/step_2.md:51 — low — knip may not recognise the inline `createRequire(import.meta.url).resolve("@anthropic-ai/claude-code/package.json")` as a use of the package. It would then report the devDependency as unused and hit the stop at line 72. Bind it to a variable as `const require = createRequire(import.meta.url); require.resolve(...)`, or use `import.meta.resolve(...)`, which knip is more likely to detect (analytical).

**Decisions**:

tasks

- pr_info/steps/step_3.md:23 — Change the import to `import config from "../vitest.config"` (no `.ts` extension). `tsconfig.json` does not set `allowImportingTsExtensions`, so the `.ts` path would fail `npm run typecheck` with TS5097.
- pr_info/steps/summary.md:91 — Report the mid-PR owner steps as the issue requires: the new `.mcp-file-access` rule before step 1, then the devDependency install, binary check and `npm run audit` after the move commit. In step 1, add a task to post a comment on #12 asking for these, both when step 1's precondition fails and once step 1 is committed, as step 8 does for the end-of-PR steps. `pr_info/.blocked.txt` stays, but it is no longer the only signal. Update summary.md to match.
- pr_info/steps/step_4.md:74 — Add a task to step 4 to run `npm run types:lay` once and confirm it prints `lay-types: ok (2.1.326)`. This makes step 4 really start the pinned binary through `runClaude` on Windows, as step_2.md:66 claims.

**Changes**:

applied
applied
applied
applied
