# Post-merge repo setup: rulesets and CodeQL

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls through a fixed baseline plus switchable profiles (each with `allow`, `ask` and `deny` lists; switched by `/gate-on` and `/gate-off`). Because it is a security tool, the repository itself needs to resist tampering.

This is Draft 11 of 11 (plan: Draft 00). It is repository administration, not code. It needs admin rights and the GitHub API, so the owner does it, or an agent with the owner's explicit approval. It happens after PR #1 (branch `feature/initial-repo-setup`) is merged.

## Design decisions this issue relies on

- Open item in the design: "Repo setup: apply the ruleset on `main` (PR and CI required, admins included), CodeQL, action pinning." Action pinning is done (`npm run check:pins`).
- Rulesets and scanning are the repo-level counterpart of the security model: a PR is the only route to `main`, CI is the gate (`npm run check` equivalents), and releases cannot be altered.
- Workflow actions must stay pinned to full SHAs, including any CodeQL workflow added.

## Existing code

- `.github/workflows/ci.yml`: jobs `static`, `test` (matrix: ubuntu-latest and windows-latest, Node 22 and 24), `plugin`, `docs`, `security`, `mutation`. Required-check names come from these job names; confirm the exact names on a real PR, since a matrix job shows as `Unit tests and coverage (Node 22, ubuntu-latest)` and so on.
- `.github/dependabot.yml`, `SECURITY.md`, `LICENSE` (MIT), `CHANGELOG.md`, `CLAUDE.md` (Workflow section).

## Goal

Protect `main` with a ruleset, enable code scanning, and prepare release protection.

## Scope

- Ruleset on `main`: pull request required, required status checks, squash merge only, linear history, no force-push, no deletion, admins included.
- Confirm the exact required check names from a real PR first.
- CodeQL default setup for `javascript-typescript` and `actions`.
- Before the first release: a tag ruleset for `v*`, and immutable releases.
- Record the settings in `SECURITY.md` or a short doc, so they can be reproduced.

## Out of scope / later

Branch protection for other branches. Signed commits.

## Open questions

- Which checks are required? Recommend all jobs except `mutation`, which runs only on schedule.
- Is one approving review required? Solo-owner repos cannot approve their own PR; recommend zero required reviews with PR required.

## Acceptance criteria

- [ ] A direct push to `main` is rejected, including for admins.
- [ ] A PR cannot merge while a required check fails.
- [ ] Only squash merge is offered, and history is linear.
- [ ] Force-push and deletion of `main` are rejected.
- [ ] Required check names match those shown on a real PR.
- [ ] CodeQL runs for both languages and reports on a PR.
- [ ] Before release: a `v*` tag cannot be moved or deleted, and releases are immutable.
- [ ] The settings are documented.
- [ ] Any workflow added keeps `npm run check:pins` passing.

## How to start

Merge PR #1, open a trivial second PR, read the check names in its status list, then create the ruleset with `gh api` (needs admin) or the repository settings page.

## Working rules

Concise writing. Use the mcp-workspace tools for file work. Do not change settings without the owner's go-ahead. Run `npm run check` before committing any file change.

## Depends on

PR #1 merged. Not part of the Drafts 01 to 10 build chain.

## References

- [Open items](../design.md#open-items)
- [Work plan](../design.md#work-plan)
- [Security model](../design.md#security-model)
