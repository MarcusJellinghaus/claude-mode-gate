# Task Status Tracker

## Instructions for LLM

This tracks **Feature Implementation** consisting of multiple **Tasks**.

**Summary:** See [summary.md](./steps/summary.md) for implementation overview.

**How to update tasks:**

1. Change [ ] to [x] when implementation step is fully complete (code + checks pass)
2. Change [x] to [ ] if task needs to be reopened
3. Add brief notes in the linked detail files if needed
4. Keep it simple - just GitHub-style checkboxes

**Task format:**

- [x] = Task complete (code + all checks pass)
- [ ] = Task not complete
- Each task links to a detail file in steps/ folder

---

## Tasks

### Step 1: Move the plugin into `plugin/` — [step_1.md](./steps/step_1.md)

- [ ] Implementation: preconditions checked, tests first (`findSourceProblems`, tsconfig, repo-structure paths), moves with `move_file`, every path edit, kit smoke test, docs and CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `refactor(plugin): move the plugin into plugin/` (then post the owner-request comment on issue #12)

### Step 2: Pin Claude Code and add `scripts/claude.mjs` — [step_2.md](./steps/step_2.md)

- [ ] Implementation: preconditions on the owner's install checked, `tests/claude.test.ts` first, then `scripts/claude.mjs`, CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` (knip counts the devDependency, `npm run audit`) — fix all issues
- [ ] Commit message prepared: `build(deps): pin Claude Code and start it through scripts/claude.mjs`

### Step 3: Config paths stay live, and `plugin/` ships no dev files — [step_3.md](./steps/step_3.md)

- [ ] Implementation: config-paths tests (`repoFiles()` via `git ls-files`), "plugin/ ships no dev files" test, CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `test(repo): keep config paths live and plugin/ free of dev files`

### Step 4: Lay the engine types with the pinned Claude Code — [step_4.md](./steps/step_4.md)

- [ ] Implementation: `tests/lay-types.test.ts` first, then `scripts/lay-types.mjs` via `scripts/claude.mjs` with the pin check, CI drops the global install, `mcp-coder.toml`, docs and CHANGELOG
- [ ] Quality checks: `npm run types:lay` prints `lay-types: ok (2.1.326)`, `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `build(types): lay the engine types with the pinned Claude Code`

### Step 5: Add the `plugin:validate` and `plugin:test` gates — [step_5.md](./steps/step_5.md)

- [ ] Implementation: `.claude/settings.json` precondition checked, tests first (`GATES`, no bare `claude` script), npm scripts, `GATES`, CI matrix, `mcp-coder.toml`, agent Bash guards, docs and CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` (both plugin gates pass), Linux CI jobs checked after push — fix all issues
- [ ] Commit message prepared: `ci(plugin): run claude plugin validate and test`

### Step 6: Dependabot gives Claude Code its own PR, with a cooldown — [step_6.md](./steps/step_6.md)

- [ ] Implementation: `cooldown` and `exclude-patterns` keys confirmed (or gap reported on issue #12), `.github/dependabot.yml`, CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `ci(dependabot): separate Claude Code PR and a 5-day cooldown`

### Step 7: Launcher warning when Claude Code differs from the pin — [step_7.md](./steps/step_7.md)

- [ ] Implementation: version warning in `claude.bat` and `claude.sh`, CHANGELOG
- [ ] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `chore(launcher): warn when Claude Code differs from the pin`

### Step 8: Drop the old `.mcp-file-access` types rule — [step_8.md](./steps/step_8.md)

- [ ] Implementation: owner steps comment posted on issue #12 (once), precondition checked, no live reference to the root `.claude-plugin/types/` left
- [ ] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [ ] Commit message prepared: `chore: drop the root engine-types rule from .mcp-file-access`

## Pull Request

- [ ] PR review: review the full branch diff against `main` and address findings
- [ ] PR summary prepared: conventional title and a short description of the changes
