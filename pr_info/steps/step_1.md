# Step 1: Move the plugin into `plugin/`

One commit: the moves and every path edit together. A rename-only commit cannot pass `npm run check`.

## Preconditions

- `tests/policy.test.ts` exists (#5 is merged and in this branch). If not, write one line to `pr_info/.blocked.txt` and stop.
- `.mcp-file-access` contains the rule `read-only   /plugin/.claude-plugin/types/`. If not, write one line to `pr_info/.blocked.txt`, post the owner-request comment (below) and stop. Never edit `.mcp-file-access` yourself.

## Owner-request comment

Post it on issue #12 with `github_issue_comment`, so the owner is asked (issue: "Report to the owner ... otherwise comment on this issue"). Post each version once: skip it if `github_issue_view` already shows it.

- Precondition failed: ask the owner to add `read-only   /plugin/.claude-plugin/types/` to `.mcp-file-access` next to the old rule; say step 1 is blocked and nothing is committed.
- After the step 1 commit: say the move is committed and ask the owner to run `npm install --save-dev --save-exact @anthropic-ai/claude-code@2.1.326` (with the repo's `ignore-scripts=true`), then `node_modules\.bin\claude.cmd --version` (Windows) or `node_modules/.bin/claude --version`, and `npm run audit`, and to report the output. Step 2 is blocked until then.

## WHERE

- Move with `move_file` (check `git status` first):
  - `hooks/hooks.json`, `hooks/policy.ts`, `hooks/register.ts` → `plugin/hooks/`
  - `types/index.d.ts` → `plugin/types/index.d.ts`
  - `.claude-plugin/plugin.json` → `plugin/.claude-plugin/plugin.json`
- Create `plugin/tests/smoke.test.ts`.
- Edit: `.claude-plugin/marketplace.json`, `package.json` (`arch` script only), `tsconfig.json`, `knip.json`, `.dependency-cruiser.cjs`, `vitest.config.ts`, `stryker.config.json`, `eslint.config.js`, `.prettierignore`, `scripts/check-manifests.mjs`, `scripts/check-arch-modules.mjs`, `scripts/check-gating-catch.mjs`, `scripts/lay-types.mjs` (paths only), `tests/check-manifests.test.ts`, `tests/repo-structure.test.ts`, `tests/tsconfig.test.ts`, `tests/policy.test.ts` and `tests/fixtures/policy/*.ts` (import paths), `.claude/CLAUDE.md`, `.claude/knowledge_base/planning_principles.md`, `docs/design.md`, `docs/architecture/architecture.md`, `CHANGELOG.md`.
- Find every other reference with `search_files` for `hooks/`, `types/`, `tests/` and `.claude-plugin` (skip `node_modules`, `pr_info`).

## Tests first

1. `tests/check-manifests.test.ts`: table for the new `findSourceProblems(market, exists)`:
   - one plugin with `source: "./plugin"` and `exists` true → `[]`;
   - no `plugins`, an empty list, two entries, a non-string or empty `source` → `["marketplace.json: must list exactly one plugin with a source folder"]`;
   - `exists` false → `["marketplace.json: source ./plugin holds no .claude-plugin/plugin.json"]`.
   - `exists` is called with the joined path `plugin/.claude-plugin/plugin.json` (normalised to `/`).
2. `tests/tsconfig.test.ts`:
   - `typeRoots` contains `./plugin/.claude-plugin/types`;
   - `include` contains `plugin/hooks`, `plugin/types`, `plugin/tests` and `tests`, and never `plugin` itself (it would pull in the laid `.d.ts` files).
3. `tests/repo-structure.test.ts`: change every path to the new layout (`plugin/hooks/policy.ts`, `plugin/hooks/hooks.json`, `plugin/hooks/register.ts`, `plugin/.claude-plugin/plugin.json`). Keep the `CLAUDE.md` test as is; step 3 retargets it.

Run `npm run test` and see the new tests fail.

## WHAT

`scripts/check-manifests.mjs`:

```js
/** @param {Manifest | undefined} market @returns {string | undefined} the only plugin's source folder */
export function pluginSource(market)
/** @param {Manifest | undefined} market @param {(path: string) => boolean} exists @returns {string[]} */
export function findSourceProblems(market, exists)
```

`findManifestProblems(manifests, moduleExists)` keeps its signature and checks.

`plugin/tests/smoke.test.ts`:

```ts
import { expect, test } from "claude-code/testing";

// Placeholder so `claude plugin test plugin` has a test to run; Draft 12 (#14) adds the wiring tests.
test("the kit runs a test of this plugin", () => {
  expect(true).toBe(true);
});
```

No `node:*` and no vitest imports: it runs in the engine's sandbox.

## ALGORITHM

```text
pluginSource(market):
  plugins = market?.plugins; if not an array of length 1 → undefined
  source = plugins[0].source; return non-empty string ? source : undefined
findSourceProblems(market, exists):
  source = pluginSource(market); if undefined → ["...must list exactly one plugin with a source folder"]
  exists(posix.join(source, ".claude-plugin/plugin.json")) ? [] : ["...source <source> holds no .claude-plugin/plugin.json"]
  // posix.join (from node:path): "/" separators on Windows too, as the test expects
main: market = load(root marketplace); stop on source problems; dir = pluginSource(market)
  plugin = load(dir/.claude-plugin/plugin.json); hooks = load(dir/hooks/hooks.json); moduleExists = entry → existsSync(resolve(dir, "hooks", entry))
```

## HOW (the path edits)

- `marketplace.json`: `"source": "./plugin"`.
- `package.json` `arch`: `depcruise plugin/hooks plugin/types plugin/tests tests --config .dependency-cruiser.cjs && node scripts/check-arch-modules.mjs`.
- `scripts/check-arch-modules.mjs`: `ROOTS = ["plugin/hooks", "plugin/types", "plugin/tests", "tests"]`; update its header comment.
- `tsconfig.json`: `typeRoots: ["./plugin/.claude-plugin/types", "./node_modules/@types"]`; `include: ["plugin/hooks", "plugin/types", "plugin/tests", "tests", "scripts", "vitest.config.ts"]`.
- `knip.json`: `entry` `plugin/hooks/register.ts`, `plugin/hooks/policy.ts`, `scripts/*.mjs`, `tests/**/*.test.ts`, `plugin/tests/**/*.test.ts`; `project` `plugin/hooks/**/*.ts`, `plugin/types/**/*.ts`, `plugin/tests/**/*.ts`, `tests/**/*.ts`, `scripts/**/*.mjs`. If knip reports `claude-code/testing` as unresolved, add it to `ignoreUnresolved`.
- `.dependency-cruiser.cjs`: `^plugin/hooks/policy\\.ts$`, `^plugin/hooks/register\\.ts$`, `from ^plugin/(hooks|types)/` to `^tests/`, `^plugin/hooks/` for dev dependencies.
- `vitest.config.ts`: coverage `include: ["plugin/hooks/policy.ts"]`; keep `include: ["tests/**/*.test.ts"]` so vitest never runs kit tests.
- `stryker.config.json`: `mutate: ["plugin/hooks/policy.ts"]`.
- `eslint.config.js` ignores and `.prettierignore`: `**/.claude-plugin/types/` (also covers the stale root folder until the owner deletes it).
- `scripts/check-gating-catch.mjs`: read `plugin/hooks/register.ts`; update the comment.
- `scripts/lay-types.mjs`: `TYPES_FILE = "plugin/.claude-plugin/types/claude-code/index.d.ts"` and `--plugin-dir plugin`. Nothing else yet.
- `tests/policy.test.ts`, `tests/fixtures/policy/*.ts`: import from `plugin/hooks/policy.ts` with the right relative depth.
- `.claude/CLAUDE.md`: engine API row (`plugin/.claude-plugin/types/claude-code/index.d.ts`), the `.mcp-file-access` sentence (`plugin/.claude-plugin/types/`), the architecture rules (`plugin/hooks/...`, `plugin/types/`).
- `.claude/knowledge_base/planning_principles.md`: `plugin/hooks/policy.ts`.
- `docs/architecture/architecture.md`: the file map and rules with the new paths; add `plugin/tests/` (kit tests).
- `docs/design.md`: threat model, protected paths, code structure (`plugin/types/index.d.ts`, `plugin/hooks/hooks.json`, `plugin/.claude-plugin/types/`, `--plugin-dir plugin`), repo layout (the tree from the summary; `examples/` stays where it is), security-model table, Testing section (kit tests live in `plugin/tests/`). Leave the CI-install sentence and the minimum version for step 4.
- `CHANGELOG.md`: one line under Unreleased: the plugin moved into `plugin/`, the root `.claude-plugin/` holds only `marketplace.json` (source `./plugin`), kit tests live in `plugin/tests/`, vitest stays in `tests/`, and `check:manifests` follows the marketplace source.

## DATA

- `pluginSource` → `string | undefined`.
- `findSourceProblems` → `string[]` (empty when fine).

## Checks and commit

- `npm run format`, then `npm run check`. `typecheck` lays the types into `plugin/.claude-plugin/types/` with the Claude Code on the PATH (the pin comes in step 4). `npm run test` must not run `plugin/tests/smoke.test.ts`.
- `git_commit` with `paths`: the old paths (`hooks`, `types`, `.claude-plugin/plugin.json`), `plugin`, every edited file and `.mcp-file-access`.
- Message: `refactor(plugin): move the plugin into plugin/`
- After the commit, post the "after the step 1 commit" owner-request comment on issue #12.

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_1.md`, and issue #12 for context. Implement step 1 only: check the preconditions, write the tests first and see them fail, then move the plugin into `plugin/` with `move_file` and make every path edit listed, in one commit, then post the owner-request comment on issue #12 asking for the devDependency install, binary check and `npm run audit`. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If a precondition fails, write one line to `pr_info/.blocked.txt`, post the owner-request comment for the `.mcp-file-access` rule if that is the failing one, and stop.
