# Refactoring Principles

Rules for moving code without changing it. Repo-specific details (size limits, allowlists, import contracts) live in the repo's own docs.

## Key Rules

- **Move, don't change.** Logic changes belong in a separate PR.
- **Move whole statements** as described in **How to move**, and update every import.
- **Clean deletion, no legacy artifacts.** No stubs, no re-exports for backward compatibility.
- **Small steps.** A step is one commit or plan step; after each step the code works and the tests pass. Keep each PR's compact diff short enough to review in one pass; if it isn't, split the PR.
- **Merge two steps when the state between them is not solid** — if the code doesn't work or the tests can't pass after the first step.
- **Tests mirror source structure.**

## Allowed edits

Besides moved code, a pure move may only contain:

- Import and export statements
- Mock targets (`vi.mock` paths) that must follow a moved symbol
- Module-level boilerplate a new file needs, such as a header comment
- Test setup files needed by the move — no re-exports kept for backward compatibility
- Stale names in comments and docstrings — replace the names only
- Removing comments left with nothing under them
- Size-check allowlist entries

Anything else is a code change: stop and report.

## How to move

Move whole top-level statements and change nothing inside them except the edits listed under **Allowed edits**.

## Plan the layout

- **Map each test to the module it calls**, not the one it patches. Misplaced tests move to their module's test file.
- **Check the hard constraints first:** a file that is one big class, a single unit larger than the size budget, file-local fixtures that tests depend on, definitions that must stay above their users. Choose a layout that respects them; if none can, stop and report.
- **Prefer layouts that keep shared helpers in place and move only whole classes or functions.**
- **Import cycles:** `npm run arch` forbids them. A value both sides need goes into a dependency-free module.

## Verify

- **Compact diff:** only moves, imports and allowed edits remain.
- **A green test run doesn't prove a pure move.** Check that nothing was silently lost: test count, mock targets that still resolve but mock nothing, setup no longer applied, names shadowed in the destination.
- Run all checks — `npm run check`.

## Refactoring issues

- **Link to these rules;** don't copy them into each issue.
- **Name any extra allowed edits explicitly** — anything beyond **Allowed edits** that the issue permits.
