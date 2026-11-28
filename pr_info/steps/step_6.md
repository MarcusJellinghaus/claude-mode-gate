# Step 6: Dependabot gives Claude Code its own PR, with a cooldown

One commit. A red CI run on a Claude Code bump is then clearly Claude Code's, and only versions out for 5 days are proposed.

## Key check

- Confirm with `WebFetch` on GitHub's Dependabot options reference (docs.github.com, "Dependabot options reference") that `cooldown` with `default-days` is supported for the `npm` ecosystem, and that `exclude-patterns` is a `groups` key.
- If `cooldown` is not supported for npm (as the issue decides): leave the `cooldown` key out, still make and commit the `exclude-patterns` change, drop the cooldown half of the CHANGELOG line, and report the gap to the owner with `github_issue_comment` on issue #12 (one sentence: `cooldown` is unsupported for npm Dependabot updates, so it was left out).

## WHERE

- `.github/dependabot.yml`, `CHANGELOG.md`

## WHAT

In the `npm` update entry:

```yaml
groups:
  npm-minor-and-patch:
    patterns: ["*"]
    exclude-patterns: ["@anthropic-ai/claude-code"]
    update-types: [minor, patch]
cooldown:
  default-days: 5
```

The `github-actions` entry is unchanged.

## HOW

- `cooldown` sits on the npm update entry (same level as `schedule`), so it applies to all npm dependencies, Claude Code included.
- No unit test: no gate parses `dependabot.yml`, and adding a YAML parser dependency for one check is not worth it (KISS). GitHub validates the file on push; check the Dependabot status of the push.

## ALGORITHM

None.

## DATA

None.

## Checks and commit

- `npm run format`, then `npm run check`.
- `CHANGELOG.md`: Dependabot opens a separate PR for `@anthropic-ai/claude-code` and proposes npm updates only after they have been out for 5 days.
- `git_commit` with `paths`: `.github/dependabot.yml`, `CHANGELOG.md`.
- Message: `ci(dependabot): separate Claude Code PR and a 5-day cooldown`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_6.md`. Implement step 6 only: confirm the `cooldown` and `exclude-patterns` keys in GitHub's docs, then edit `.github/dependabot.yml` and the CHANGELOG. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If `cooldown` is unsupported for npm, leave it out, commit the `exclude-patterns` change and report the gap in a comment on issue #12.
