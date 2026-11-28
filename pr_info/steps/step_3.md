# Step 3: Config paths stay live, and `plugin/` ships no dev files

One commit, tests only. Dependency-cruiser rules, Stryker and coverage pass silently on stale paths; these tests make them fail loudly.

## WHERE

- `tests/repo-structure.test.ts` (new `describe("config paths")`, and the `CLAUDE.md` test retargeted).
- `CHANGELOG.md`.

## WHAT

Test helper, local to the test file:

```ts
/** Tracked repo files (`git ls-files`), as `/`-separated paths relative to the root. */
function repoFiles(): string[];
```

Tests:

1. `it.each(["CLAUDE.md", ".mcp.json"])("plugin/ ships no %s", ...)`: `plugin/<name>` does not exist. This replaces "keeps CLAUDE.md under .claude/": its reason, a `CLAUDE.md` failing `validate --strict`, now applies to the plugin folder.
2. Every `stryker.config.json` `mutate` entry is in `repoFiles()`.
3. Every vitest `coverage.include` entry is in `repoFiles()` (import the config: `import config from "../vitest.config"`, no `.ts` extension: `tsconfig.json` does not set `allowImportingTsExtensions`).
4. Every dependency-cruiser rule path matches at least one tracked file: load `.dependency-cruiser.cjs` with `createRequire(import.meta.url)`; for each rule, for `from` and `to`, if `path` is a string, some file in `repoFiles()` matches `new RegExp(path)`. Rules or sides without a `path` (`circular`, `dependencyTypes`, empty `from`) are skipped. Name the rule in the failure message.

## ALGORITHM

```text
repoFiles():
  execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(non-empty)
  // tracked files only: untracked or gitignored files (plugin/.claude-plugin/types/, .scratch/, coverage/) never make a stale path pass
for rule in forbidden: for side in [rule.from, rule.to]:
  if typeof side.path === "string": expect(files.some(f => new RegExp(side.path).test(f)), rule.name).toBe(true)
```

## HOW

- `node:child_process` (`execFileSync`, no shell), `node:fs`, `node:module` (`createRequire`) only; no new dependency. `git ls-files` prints `/`-separated paths on every platform.
- ESLint security rules (`detect-non-literal-fs-filename`, `detect-non-literal-regexp`, `detect-non-literal-require`, `detect-child-process`) may fire: suppress each inline with the rule name and a reason (fixed repo paths, the config's own patterns, a fixed `git` command).
- TDD: write each test, run it and see it pass; then check it would fail by giving it a missing path once in a throwaway local edit of the test input (do not commit that).

## DATA

- `repoFiles` → `string[]` such as `plugin/hooks/policy.ts`, `tests/check.test.ts`.

## Checks and commit

- `npm run format`, then `npm run check`.
- `CHANGELOG.md`: one line: a repo-structure test fails when a Stryker, coverage or dependency-cruiser path points at no tracked file, or when `plugin/` holds a `CLAUDE.md` or `.mcp.json`.
- `git_commit` with `paths`: `tests/repo-structure.test.ts`, `CHANGELOG.md`.
- Message: `test(repo): keep config paths live and plugin/ free of dev files`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_3.md`. Implement step 3 only: add the config-paths tests (tracked files from `git ls-files`) and retarget the `CLAUDE.md` test in `tests/repo-structure.test.ts`, then update the CHANGELOG. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`).
