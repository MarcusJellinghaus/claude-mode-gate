# Issue #12: Plugin CI: plugin subfolder, pinned Claude Code, `claude plugin validate` and `test`

Draft 10 of the plan in #16. Read the issue body for the full decisions, constraints and acceptance criteria; this summary is the implementation view.

## Goal

A load failure of the hooks module leaves every call ungated (`docs/design.md`, assumption 18). So `claude plugin validate --strict` and `claude plugin test` must run in `npm run check` and in CI, against one pinned Claude Code version. Today `validate --strict` fails on the repo root, because the engine type-checks and runs the vitest files, and it ships the dev `.mcp.json`. The fix is to move the plugin into its own folder and pin Claude Code as a devDependency.

## Architectural and design changes

1. **The plugin lives in `plugin/`.** The repo root stops being the plugin folder. Only `plugin/` ships and only `plugin/` is scanned by `claude plugin validate` and `test`, so the vitest suite and the dev `.mcp.json` can no longer clash with the engine.

   ```text
   .claude-plugin/marketplace.json   stays at the root; the plugin source is "./plugin"
   plugin/.claude-plugin/plugin.json
   plugin/.claude-plugin/types/      laid by Claude Code, never committed (own .gitignore)
   plugin/hooks/                     hooks.json, policy.ts, register.ts
   plugin/types/                     index.d.ts
   plugin/tests/                     kit tests only (*.test.ts, claude-code/testing)
   tests/                            vitest, unchanged names (*.test.ts)
   scripts/, docs/, .claude/, .mcp*.json   never shipped, never scanned
   ```

   Config files name `plugin/hooks`, `plugin/types` and `plugin/tests` one by one, never `plugin` as a whole, so the laid `plugin/.claude-plugin/types/*.d.ts` stay out of `tsc`, depcruise and knip.

2. **One way to start Claude Code: `scripts/claude.mjs`.** It resolves the pinned binary from `@anthropic-ai/claude-code/package.json` (its `bin` field) and starts it without a shell: with `node` for a JS target, directly for a native one. It sets `DISABLE_AUTOUPDATER=1`. The resolution is a pure, table-tested function. No `package.json` script calls a bare `claude`, because on Windows `cmd.exe` would find the repo's own `claude.bat` first.

3. **Claude Code is an exact devDependency** (`@anthropic-ai/claude-code` `2.1.326`). `npm ci` installs it in every CI job; the global CI install goes. The supported Claude Code version is the pin; docs say "the version pinned in `package.json`", never a literal number (evidence lines keep theirs).

4. **The engine types follow the pin.** `scripts/lay-types.mjs` lays from `plugin/` through `scripts/claude.mjs`. One rule replaces the existence check: the types are fine when the version on the laid file's first line equals the pin. Otherwise it lays, checks again (after every lay, `--force` included) and fails with "run `npm ci`" on a mismatch. It prints the laid version.

5. **Two new gates**, `plugin:validate` (`--strict`) and `plugin:test`, on `plugin/` only. They join `scripts/check.mjs` `GATES` (after `check:docs`), the CI `push-checks` matrix, `mcp-coder.toml`, the agents' Bash guards and the allow rules. A placeholder kit test in `plugin/tests/` gives `plugin:test` something to run.

6. **`check:manifests` follows the marketplace source.** The marketplace lists exactly one plugin; its `source` must hold `.claude-plugin/plugin.json`, and `plugin.json` and `hooks/hooks.json` are read from there (no fixed `plugin/...` paths).

7. **Config paths stay live.** A repo-structure test fails when a Stryker `mutate` entry, a vitest `coverage.include` entry or a dependency-cruiser rule path points at no tracked file, and when `plugin/` holds a dev file (`CLAUDE.md`, `.mcp.json`).

8. **Dependabot** gives Claude Code its own PR (`exclude-patterns`) and holds every npm update for 5 days (`cooldown`; left out and reported to the owner if unsupported for npm).

9. **Launcher warning.** `claude.bat` and `claude.sh` warn, without stopping, when the binary they start differs from the pin.

## KISS choices

- Every path-carrying config is edited once, in step 1. The kit smoke test lands there too, so `plugin/tests` holds a file the first time a config names it.
- `lay-types.mjs` has one check (laid version equals pin); a missing file is just "no version".
- `check:manifests` requires exactly one marketplace plugin, so there is no lookup by name.
- The config-paths test lists tracked files with `git ls-files`, not a file walker or `fs.globSync`.
- No extension of the dependency-cruiser rule to `plugin/tests` (optional in the issue, no present need).
- The launchers read the pin with `node -p`, so batch and sh parse no JSON.
- CI keeps its `types` matrix flag; only the install line changes.
- Docs change in the step that changes the behaviour they describe.

## Files

Moved (with `move_file`, history kept):

- `hooks/hooks.json`, `hooks/policy.ts`, `hooks/register.ts` → `plugin/hooks/`
- `types/index.d.ts` → `plugin/types/index.d.ts`
- `.claude-plugin/plugin.json` → `plugin/.claude-plugin/plugin.json`

Created:

- `plugin/tests/smoke.test.ts`: the placeholder kit test
- `scripts/claude.mjs`: starts the pinned Claude Code
- `tests/claude.test.ts`: unit tests for `scripts/claude.mjs`

Modified:

- Manifests and package: `.claude-plugin/marketplace.json`, `package.json`, `package-lock.json`
- Config: `tsconfig.json`, `knip.json`, `.dependency-cruiser.cjs`, `vitest.config.ts`, `stryker.config.json`, `eslint.config.js`, `.prettierignore`, `mcp-coder.toml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Scripts: `scripts/check-manifests.mjs`, `scripts/check-arch-modules.mjs`, `scripts/check-gating-catch.mjs`, `scripts/lay-types.mjs`, `scripts/check.mjs`
- Tests: `tests/repo-structure.test.ts`, `tests/check-manifests.test.ts`, `tests/tsconfig.test.ts`, `tests/lay-types.test.ts`, `tests/check.test.ts`, `tests/policy.test.ts` and `tests/fixtures/policy/*.ts` (import paths, after #5)
- Launchers: `claude.bat`, `claude.sh`
- Agents: `.claude/agents/code-engineer.md`, `.claude/agents/issue-analyst.md`, `.claude/agents/plan-engineer.md`
- Docs: `.claude/CLAUDE.md`, `.claude/knowledge_base/planning_principles.md`, `docs/design.md`, `docs/architecture/architecture.md`, `CHANGELOG.md`
- Owner- or main-session-edited, committed by the implementer: `.mcp-file-access` (steps 1 and 8), `.claude/settings.json` (step 5)

## Steps

1. Move the plugin into `plugin/` (all path edits, kit smoke test, `check:manifests` follows the source).
2. Pin Claude Code as an exact devDependency and add `scripts/claude.mjs` (straight after the move, so no commit sees the devDependency unused).
3. Config-paths and "no dev files in `plugin/`" repo-structure tests.
4. Lay the engine types with the pinned Claude Code; drop the global CI install.
5. Add the `plugin:validate` and `plugin:test` gates everywhere.
6. Dependabot: own PR for Claude Code, 5-day cooldown.
7. Launcher version warning.
8. Post the owner steps on issue #12, then commit the removal of the old `.mcp-file-access` types rule.

## Prerequisites outside the implementer's reach

Each step checks its own precondition and, if it does not hold, writes one line to `pr_info/.blocked.txt` and stops.

- Before step 1: #5 is merged and in this branch; the owner adds `read-only   /plugin/.claude-plugin/types/` to `.mcp-file-access` next to the old rule.
- Between steps 1 and 2 (after the move commit, as the issue says): the owner runs `npm install --save-dev --save-exact @anthropic-ai/claude-code@2.1.326` (with the repo's `ignore-scripts=true`) and `node_modules\.bin\claude.cmd --version` (Windows) or `node_modules/.bin/claude --version`.
- Before step 5: the main session adds `Bash(npm run plugin:validate)` and `Bash(npm run plugin:test)` to `.claude/settings.json` with native Edit (owner permission quoted in the issue).
- Before step 8: the owner deletes the old gitignored root `.claude-plugin/types/` folder and removes the old `read-only   /.claude-plugin/types/` rule.

## Owner checks after the last step

Step 8 posts these as a comment on issue #12.

- The launcher warning, by hand, in `claude.bat` and `claude.sh`.
- On Windows, `npm run plugin:validate` runs the pinned binary, not `claude.bat`.
- One `/plugin install mode-gate` from the local marketplace installs the `./plugin` source.
- `plugin:validate` and `plugin:test` behave the same on Linux CI as on Windows.
- The refresh list (wiki `Processes/Chore Implementation`, step 3) names the new adaptations: the `planning_principles.md` path and the agent gate lists.
- After merge: the next Dependabot run opens a separate PR for `@anthropic-ai/claude-code`.
