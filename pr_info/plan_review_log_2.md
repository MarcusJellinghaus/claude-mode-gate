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
