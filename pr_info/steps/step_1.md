# Step 1: Prettier formats `pr_info/` except the logs

See [summary.md](./summary.md) for the goal and design.

## LLM prompt

> Read `pr_info/steps/summary.md` and this file, `pr_info/steps/step_1.md`. Implement step 1 only: replace the `pr_info/` entry in `.prettierignore` with the two commented patterns below, and add the CHANGELOG line. Change nothing else. Run the project's quality checks and fix any findings in the files you changed. Write the commit message to `pr_info/.commit_message.txt`.

## Precondition

`.prettierignore` contains the line `pr_info/` with the comment line directly above it (shown under WHAT). If it does not, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `.prettierignore` (repo root)
- `CHANGELOG.md` (repo root), section `## Unreleased`

## WHAT

In `.prettierignore`, replace these two lines:

```text
# mcp-coder's working files: it commits some without formatting, and the folder is deleted before merge (markdownlint skips it too).
pr_info/
```

with these four:

```text
# Review logs: mcp-coder's scoped round-log flushes commit them unformatted.
pr_info/*_review_log_*.md
# issue_analyse_supervisor's local log: its agents cannot run npm run format.
pr_info/issue_analysis_log*.md
```

In `CHANGELOG.md`, add this as the first bullet under `## Unreleased`:

```markdown
- Prettier formats and checks mcp-coder's `pr_info/` plan files and task tracker; review logs (`pr_info/*_review_log_*.md`) and the local issue-analysis log stay excluded.
```

## HOW

There are no imports or integration points. Prettier reads `.prettierignore` automatically, for both `npm run format` and `npm run format:check`. The patterns use gitignore syntax: they contain a slash, so they are anchored to the repo root, and `*` does not cross `/`.

## ALGORITHM

None (configuration only).

## DATA

None. Expected effect: mcp-coder's `format@apply` before this step's commit reformats the existing `pr_info/` plan files. Those changes belong in this commit.

## Tests

No unit test (see summary.md, Verification). The workflow's check and test steps must pass. The rest of `.prettierignore`, `mcp-coder.toml` and the other CHANGELOG lines stay unchanged.

## Commit message

```text
chore: format mcp-coder's pr_info/ plan files with Prettier
```
