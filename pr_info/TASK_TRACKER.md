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

### Step 1: `ONE_TEST_FILE` without nested quantifiers — [step_1.md](./steps/step_1.md)

- [x] Implementation: edge-case rows in `tests/agent-bash-guard.test.ts` (pass on today's regex), then rewrite `ONE_TEST_FILE` in `scripts/agent-bash-guard.mjs`
- [x] Quality checks: `npm run format`, `npm run check` — fix all issues
- [x] Commit message prepared: `refactor(guard): make ONE_TEST_FILE pass detect-unsafe-regex`

### Step 2: `USES` without nested quantifiers — [step_2.md](./steps/step_2.md)

- [ ] Implementation: two edge-case tests in `tests/check-action-pins.test.ts` (pass on today's regex), then rewrite `USES` in `scripts/check-action-pins.mjs`
- [ ] Quality checks: `npm run format`, `npm run check` — fix all issues
- [ ] Commit message prepared: `refactor(pins): make USES pass detect-unsafe-regex`

### Step 3: Suppress the remaining security findings inline — [step_3.md](./steps/step_3.md)

- [ ] Implementation: one inline `eslint-disable-next-line security/<rule> -- <why>` per remaining hit reported by `npm run lint`, until 0 warnings
- [ ] Quality checks: `npm run format`, `npm run check` — fix all issues
- [ ] Commit message prepared: `chore(lint): justify the remaining eslint-plugin-security findings`

### Step 4: Fail lint on warnings, and document it — [step_4.md](./steps/step_4.md)

- [ ] Implementation: pin `lint` in `tests/check.test.ts` (fails first), set `"lint": "eslint . --max-warnings 0"` in `package.json`, update `.claude/CLAUDE.md` and `CHANGELOG.md`
- [ ] Quality checks: `npm run format`, `npm run check` — fix all issues
- [ ] Commit message prepared: `chore(lint): fail lint on warnings and document eslint-plugin-security`

## Pull Request

- [ ] PR review: review the full branch diff against `main`
- [ ] PR summary prepared
