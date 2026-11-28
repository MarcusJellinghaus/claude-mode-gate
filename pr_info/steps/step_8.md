# Step 8: Drop the old `.mcp-file-access` types rule

The PR's last commit. The root `.claude-plugin/types/` folder is gone, so its read-only rule goes too.

## Owner steps comment (first, before the precondition)

Post the end-of-PR owner steps on issue #12 with `github_issue_comment`, so the owner is asked (acceptance criterion). Post it once: skip it if `github_issue_view` shows the comment already. It lists:

- Check the launcher warning by hand in `claude.bat` and `claude.sh` (a matching and a differing version).
- On Windows, check once that `npm run plugin:validate` runs the pinned binary, not `claude.bat`.
- Run one `/plugin install mode-gate` from the local marketplace to confirm the `./plugin` source installs end to end.
- Compare the Linux CI runs of `plugin:validate` and `plugin:test` with Windows; if they differ, tell the implementer.
- Add the new adaptations (the `planning_principles.md` path, the agent gate lists) to the refresh list (wiki `Processes/Chore Implementation`, step 3), or ask the main session to.
- Delete the old gitignored root `.claude-plugin/types/` folder and remove its `.mcp-file-access` rule, if not done yet (this step's precondition).

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

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_8.md`. Implement step 8 only: post the owner steps comment on issue #12 (once), then check that the owner removed the old root `.claude-plugin/types/` rule from `.mcp-file-access`, check that no live reference to the root types folder is left, and commit the file. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If the precondition fails, write one line to `pr_info/.blocked.txt` and stop.
