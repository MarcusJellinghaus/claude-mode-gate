# Step 5: Add the `plugin:validate` and `plugin:test` gates

One commit: the two npm scripts and every place that lists the gates.

## Preconditions

- `.claude/settings.json` `permissions.allow` contains `Bash(npm run plugin:validate)` and `Bash(npm run plugin:test)` (added by the main session; MCP cannot write the file). If not, write one line to `pr_info/.blocked.txt` and stop. Never edit `.claude/settings.json` yourself.

## WHERE

- `package.json`, `scripts/check.mjs`, `tests/check.test.ts`, `tests/repo-structure.test.ts`
- `.github/workflows/ci.yml`, `mcp-coder.toml`, `scripts/check-manifests.mjs` (header comment)
- `.claude/agents/code-engineer.md`, `.claude/agents/issue-analyst.md`, `.claude/agents/plan-engineer.md`
- `.claude/CLAUDE.md`, `docs/design.md`, `CHANGELOG.md`
- Commit the main session's `.claude/settings.json`.

## WHAT

`package.json` scripts:

```json
"plugin:validate": "node scripts/claude.mjs plugin validate plugin --strict",
"plugin:test": "node scripts/claude.mjs plugin test plugin"
```

`scripts/check.mjs` `GATES`: insert `"plugin:validate"`, `"plugin:test"` after `"check:docs"`, before `"test:coverage"`.

## Tests first

1. `tests/check.test.ts` (`describe("GATES")`):
   - `scripts["plugin:validate"]` and `scripts["plugin:test"]` equal the strings above;
   - in `GATES`, both come after `check:docs` and before `test:coverage`.
2. `tests/repo-structure.test.ts`: "no package.json script calls a bare `claude`" (on Windows `cmd.exe` would run the root `claude.bat`).

```text
for [name, script] of Object.entries(scripts):
  commands = script.split(/&&|\|\||[;|&]/).map(trim)
  expect(commands.filter(c => /^claude(\s|$)/.test(c)), name).toEqual([])
```

Run `npm run test` and see test 1 fail. Test 2 passes from the start: check it fails once on a throwaway local edit of its input (do not commit that).

## HOW

- `.github/workflows/ci.yml` `push-checks` matrix: add `{ name: "plugin:validate", types: true }` and `{ name: "plugin:test", types: true }`. Remove the "TODO (Draft 10)" comment lines.
- `mcp-coder.toml` `check.standard`: append `{ argv = ["npm", "run", "plugin:validate"] }` and `{ argv = ["npm", "run", "plugin:test"] }` after `check:docs`.
- The three agent files: append `plugin:validate plugin:test` to the `agent-bash-guard.mjs` argument list (`commit-pusher` unchanged).
- `scripts/check-manifests.mjs`: the header comment drops "until `claude plugin validate` is wired into CI"; it checks the root marketplace offline, which `plugin:validate` on `plugin/` does not.
- `.claude/CLAUDE.md`:
  - Commands table: rows for `npm run plugin:validate` (`claude plugin validate plugin --strict` with the pinned Claude Code) and `npm run plugin:test` (kit tests in `plugin/tests/`, in the engine's sandbox).
  - Testing strategy item 6: `claude plugin validate --strict` and `claude plugin test` run on `plugin/` in `npm run check` and CI, with the Claude Code version pinned in `package.json`; drop "join CI once verified" and "plus a weekly run against the latest" (Dependabot replaces it).
  - Agent Bash guard paragraph: no change needed unless it lists gate names.
- `docs/design.md` "Impact on the drafts", row 10: `claude plugin validate --strict` and `claude plugin test` run on `plugin/` only; on the repo root `--strict` passed on 2.1.292 and fails on 2.1.326, because the engine type-checks and runs the vitest files.

## Verify

- `npm run check` runs both gates as child processes (it works whatever the agent's own Bash guard allows) and both pass.
- If `plugin:validate` reports an error that is not a path issue fixable in this step, or `plugin:test` fails, write one line to `pr_info/.blocked.txt` and stop.
- Linux CI: after the commit, `git_push`, then read the push-checks jobs `typecheck` (pinned since step 4), `plugin:validate` and `plugin:test` with `check_branch_status`. If one fails on Linux but passes on Windows, write one line to `pr_info/.blocked.txt`, post a stop-and-ask comment on issue #12 with `github_issue_comment` (which job, the failing output, and that the Windows run passes), and stop.

## DATA

- No new data structures; `GATES` grows to 13 entries.

## Checks and commit

- `npm run format`, then `npm run check`.
- `CHANGELOG.md`: `npm run check` and CI run `claude plugin validate --strict` and `claude plugin test` on `plugin/` (`npm run plugin:validate`, `npm run plugin:test`) with the pinned Claude Code; a placeholder kit test gives `plugin:test` a test to run.
- `git_commit` with `paths`: `package.json`, `scripts/check.mjs`, `scripts/check-manifests.mjs`, `tests/check.test.ts`, `tests/repo-structure.test.ts`, `.github/workflows/ci.yml`, `mcp-coder.toml`, the three agent files, `.claude/CLAUDE.md`, `.claude/settings.json`, `docs/design.md`, `CHANGELOG.md`.
- Message: `ci(plugin): run claude plugin validate and test`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_5.md`. Implement step 5 only: check the `.claude/settings.json` precondition, write the tests first and see them fail, then add the two npm scripts and list them in `GATES`, CI, `mcp-coder.toml`, the three agents' Bash guards and the docs. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If the precondition fails or a plugin gate fails for a reason outside this step, write one line to `pr_info/.blocked.txt` and stop.
