---
name: implement-direct
disable-model-invocation: true
argument-hint: [issue-number]
allowed-tools:
  - mcp__mcp-workspace__github_issue_view
  - "Bash(mcp-coder gh-tool *)"
  - mcp__mcp-workspace__read_file
  - "Bash(npm run format)"
  - "Bash(npm run lint)"
  - "Bash(npm run test)"
  - "Bash(npm run typecheck)"
  - "Bash(npm run check)"
---

# Implement Direct

Implement a small, well-defined issue directly — no planning phase, no task tracker.

## Resolve Issue Number

The user may provide an issue number as the argument (available as `$ARGUMENTS`).
If no issue number is provided:
1. Read `.vscodeclaude_status.txt` and extract the issue number from the `Issue #NNN` line
2. If the file doesn't exist or has no issue number, ask the user

## Steps

1. **Fetch issue details**
   Call `mcp__mcp-workspace__github_issue_view` with the issue number.
   Read the issue title, description, and acceptance criteria carefully.
   **Read linked issues first.** If the issue points to an epic, design doc, dependencies, or sibling issues, read those before implementing — it may not be self-contained, and any "read first" note is mandatory.

2. **Checkout/create issue branch**
   ```bash
   mcp-coder gh-tool checkout-issue-branch <issue_number>
   ```

3. **Understand context**
   - Read relevant source files referenced in the issue
   - Understand the existing code patterns and conventions
   - Identify the minimal set of changes needed

4. **Implement changes**
   - Make the required code changes directly
   - Follow existing code patterns and conventions
   - Keep changes focused and minimal — only what the issue requires

5. **Run quality checks**
   - `npm run typecheck` — fix all issues
   - `npm run lint` — fix all issues
   - `npm run test` — fix all failures

6. **Format code**
   Run `npm run format` to format all code (Prettier). Then run `npm run check` — the full gate must pass before the status update.

7. **Update issue status**
   ```bash
   mcp-coder gh-tool set-status status-07:code-review
   ```

8. **Suggest follow-up steps**
   - `/commit_push` — commit and push changes
   - `/check_branch_status` — verify branch is clean
   - `/implementation_review` — request a review of the implementation

## Scope Guidance

This skill is designed for **small, well-defined issues** that can be implemented in a single pass. If the issue is complex or involves multiple components, recommend the full workflow instead:

1. `/create_plan` — create a detailed implementation plan
2. `/implement` — implement the plan step by step

**Note:** This skill has `disable-model-invocation` — it can only be run by the user typing `/implement_direct`.
