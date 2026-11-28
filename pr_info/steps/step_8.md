# Step 8: Drop the old `.mcp-file-access` types rule

The PR's last commit. The root `.claude-plugin/types/` folder is gone, so its read-only rule goes too.

## Preconditions

- `.mcp-file-access` has no rule for `/.claude-plugin/types/` (the root one) and still has `read-only   /plugin/.claude-plugin/types/`. If not, write one line to `pr_info/.blocked.txt` and stop. Never edit `.mcp-file-access` yourself: the owner removes the rule and deletes the old folder.

## WHERE

- `.mcp-file-access` (owner-edited, committed here).
- `.claude/CLAUDE.md`: only if its `.mcp-file-access` sentence still names the root `.claude-plugin/types/` (step 1 should have changed it).

## WHAT

No code change. Confirm with `search_files` that nothing outside `pr_info/` and `CHANGELOG.md` still names the root `.claude-plugin/types/` as a live path (the `**/.claude-plugin/types/` ignores in `eslint.config.js` and `.prettierignore` stay: they match the laid folder under `plugin/`).

## ALGORITHM

None.

## DATA

None.

## Checks and commit

- `npm run format`, then `npm run check`.
- `git_commit` with `paths`: `.mcp-file-access` (and `.claude/CLAUDE.md` if changed).
- Message: `chore: drop the root engine-types rule from .mcp-file-access`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_8.md`. Implement step 8 only: check that the owner removed the old root `.claude-plugin/types/` rule from `.mcp-file-access`, check that no live reference to the root types folder is left, and commit the file. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If the precondition fails, write one line to `pr_info/.blocked.txt` and stop.
