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

### Step 1: show the total time on the success line

See [step_1.md](./steps/step_1.md).

- [x] Implementation: update `tests/check.test.ts` (failing tests first), then sum `seconds` in `runGates` in `scripts/check.mjs` and add the CHANGELOG line
- [x] Quality checks: `npm run format`, then `npm run check` — fix all issues
- [x] Commit message prepared: `feat: show the total time on the success line of npm run check`

## Pull Request

- [ ] PR review: review the full branch diff against `main`
- [ ] PR summary prepared
