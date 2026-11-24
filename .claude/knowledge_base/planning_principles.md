# Planning Principles

## Step Design

- **Merge tiny or intertwined steps.** Steps that are trivially small or tightly coupled should be combined. However, prefer several small steps over fewer large ones — small steps fit better in LLM context windows.
- **Split large steps.** Ideally each step can be completed such that `npm run check` still passes afterward.
- **One step = one commit.** Each step should produce exactly one commit: write tests, implement, verify checks pass. If a step needs multiple fix-and-commit cycles, split it into smaller steps.
- **No separate "fix all issues" steps.** Quality checks passing is an exit criterion for each step, not a separate step.
- **No "verify everything" cleanup steps.** If each step leaves checks green, a final verification step is unnecessary. If you find yourself planning one, the earlier steps are too large.
- **Every step must have tangible results.** No preparation steps like "read docs" or "explore codebase" — analysis happens as part of implementation.
- **No need to fill in task tracker during planning.** This is done automatically as step 0 of implementation.
- **No rollback options needed.** Don't plan for how to undo steps.

## Testing

- **No manual tests.** All tests must be automated.
- **One test file per module.** Tests for `hooks/policy.ts` go in `tests/policy.test.ts`.
- **Table-driven tests** (`it.each`) are a good idea to reduce the number of required test functions while covering more cases.

## Code Quality

- **If uncertain about the codebase, analyze it.** Don't guess — read the code and understand before planning changes.
- **If a question implies worsening code quality**, include small refactorings in the plan to actually improve it.

## Documentation

- **Comments** explain why, not what (see CLAUDE.md "Principles").
- **Behaviour changes** update README.md and CHANGELOG.md in the same commit.
