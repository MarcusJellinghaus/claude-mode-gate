# review-plan review log 2

## Round 1 — 2026-11-28

**Findings**:

pr_info/steps/step_3.md:30 — medium — `repoFiles()` uses plain `git ls-files`, which lists only files in the index. A new file created with `save_file` is not in the index until `git_commit` stages it. So a config entry (Stryker `mutate`, coverage `include`, a dependency-cruiser path) that names a file added in the same step fails `npm run check` before the commit, and the implementer cannot `git add`. Later drafts that add `plugin/hooks/*.ts` modules will hit this. It also departs from the issue, which says to walk the file system and skip `node_modules`. Fix: use `git ls-files --cached --others --exclude-standard`, which adds untracked files and still leaves out gitignored ones such as the laid types, `.scratch/` and `coverage/`.
pr_info/steps/step_1.md:75 — low — The algorithm builds the path with `join(source, ".claude-plugin/plugin.json")`, but the test at step_1.md:33 expects `exists` to get `plugin/.claude-plugin/plugin.json` with `/` separators. On Windows, `join` returns backslashes, so the test as specified fails. Fix: use `posix.join`, or normalise to `/` before calling `exists`.
pr_info/steps/step_6.md:7 — low — The key check depends on `WebFetch`. No approved route grants it to a headless implementer, and the step gives no fallback if the fetch is denied. The step can then stall before the `exclude-patterns` change. Fix: if the docs cannot be fetched, commit `exclude-patterns` and `cooldown` as written, and say in the #12 comment that the key was not checked, so GitHub's validation on push becomes the check.

**Decisions**:

tasks

- In pr_info/steps/step_3.md:30, change `repoFiles()` to use `git ls-files --cached --others --exclude-standard` instead of plain `git ls-files`, so files created in the same step but not yet committed are listed while gitignored paths (laid types, `.scratch/`, `coverage/`) stay excluded. Note in the step that this matches the issue's intent to walk the file system without `node_modules`.
- In pr_info/steps/step_1.md:75, build the manifest path with `posix.join(source, ".claude-plugin/plugin.json")` (or normalise to `/` before calling `exists`), so the test at step_1.md:33, which expects `plugin/.claude-plugin/plugin.json`, also passes on Windows.
- In pr_info/steps/step_6.md:7, add a fallback for when `WebFetch` is denied or the docs cannot be fetched: commit `exclude-patterns` and `cooldown` as written, and say in the #12 comment that the key was not checked, so GitHub's validation on push does that check.

**Changes**:

applied
applied
applied
applied

## Round 2 — 2026-11-28

**Findings**:

pr_info/steps/step_2.md:53 — low — `runClaude` returns `status ?? 1` and never prints `result.error`. If the spawn fails (for example ENOENT or EACCES when the `bin` target is missing on Linux CI, which the Windows-only precondition at step_2.md:11 cannot catch), `plugin:validate`, `plugin:test` and `types:lay` exit 1 with no output, and `check.mjs` shows only "(no output)". Fix: when `result.error` is set, write its message to stderr before returning 1, and add one table row for that path in `tests/claude.test.ts` if it becomes a pure helper.
pr_info/steps/step_5.md:57 — low — Every verify step runs on Windows only. No step pushes and reads the Linux CI result with `check_branch_status`, although the issue says "Linux is checked through CI" and to stop and ask if `plugin:validate` or `plugin:test` behaves differently there. Step 8 hands that comparison to the owner (step_8.md:12). Fix: after pushing steps 4 and 5, check the push-checks jobs `typecheck`, `plugin:validate` and `plugin:test` with `check_branch_status`. If one fails on Linux only, write `.blocked.txt` and post the stop-and-ask comment on #12.

**Decisions**:

tasks

- In pr_info/steps/step_2.md:53, have `runClaude` write `result.error.message` to stderr when `result.error` is set, then return 1, so a failed spawn (ENOENT or EACCES) in `plugin:validate`, `plugin:test` or `types:lay` shows the cause instead of '(no output)'. If that logic is a pure helper, add a table row for the spawn-error path in `tests/claude.test.ts`.
- In pr_info/steps/step_5.md:57, add a verify step after pushing steps 4 and 5: read the Linux CI push-checks jobs `typecheck`, `plugin:validate` and `plugin:test` with `check_branch_status`. If any of them fails on Linux but passes on Windows, write `.blocked.txt` and post the stop-and-ask comment on #12, as the issue requires. Update step_8.md:12 to match.

**Changes**:

applied
applied
applied

## Round 3 — 2026-11-28

**Findings**:

`pr_info/steps/step_2.md:11` — medium — The precondition stops step 2 whenever the package has a `preinstall`, `install` or `postinstall` script. The issue stops only if the package *needs* that script to work under `ignore-scripts=true`. The owner's `claude --version` check after the install proves whether the binary works without it. As written, a harmless script would block the pin and every later step. Fix: block only when the `bin` target is missing or is a placeholder, or when the owner's `--version` check failed.

**Decisions**:

dismiss

**Changes**:

dismiss
