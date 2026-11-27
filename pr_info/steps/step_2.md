# Step 2: correct the markdownlint ignore comment

See [summary.md](./summary.md) for the goal and design.

## LLM prompt

> Read `pr_info/steps/summary.md` and this file, `pr_info/steps/step_2.md`. Implement step 2 only: replace the comment above `"pr_info/**"` in `.markdownlint-cli2.jsonc` with the comment below. Keep the `"pr_info/**"` entry and change nothing else. Run the project's quality checks and fix any findings in the file you changed. Write the commit message to `pr_info/.commit_message.txt`.

## Precondition

`.markdownlint-cli2.jsonc` has the entry `"pr_info/**",` in `ignores`, with the comment shown under WHAT directly above it. If it does not, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `.markdownlint-cli2.jsonc` (repo root), `ignores` array

## WHAT

Replace this line:

```jsonc
    // mcp-coder's plan files, written by the LLM during implement.
```

with:

```jsonc
    // mcp-coder's LLM-written plan files and logs: rules such as MD024 and MD040, which Prettier does not fix, would turn them into check findings.
```

The next line, `"pr_info/**",`, stays as it is.

## HOW

There are no imports or integration points. markdownlint-cli2 reads the file automatically for `npm run docs:lint`. Only a comment changes, so lint behaviour stays the same.

## ALGORITHM

None (comment only).

## DATA

None.

## Tests

No unit test (see summary.md, Verification). The workflow's check steps must pass. `docs:lint` must still skip `pr_info/`, and Prettier also checks this JSONC file.

## Commit message

```text
docs: explain why markdownlint skips pr_info/
```
