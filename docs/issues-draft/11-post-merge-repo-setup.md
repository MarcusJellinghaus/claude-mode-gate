# Post-merge repo setup: rulesets and CodeQL

## Goal

Protect `main` and turn on code scanning once PR #1 is merged. These steps need repository admin rights and the GitHub API, so the owner does them.

## Scope

- Ruleset on `main`: PR required, required status checks, squash only, linear history, no force-push, no deletion, admins included.
- Confirm the exact check names from a real PR before requiring them.
- CodeQL default setup for `javascript-typescript` and `actions`.
- Before the first release: a tag ruleset for `v*` and immutable releases.

## Acceptance criteria

- [ ] A direct push to `main` is rejected, including for admins.
- [ ] A PR cannot merge while a required check fails.
- [ ] Only squash merge is offered.
- [ ] Force-push and deletion of `main` are rejected.
- [ ] The required check names match those shown on a real PR.
- [ ] CodeQL runs for both languages and reports on a PR.
- [ ] Before release: a `v*` tag cannot be moved or deleted, and releases are immutable.
- [ ] The settings are written down in `docs/` or `CONTRIBUTING`, so they can be reproduced.

## Depends on

PR #1 merged. Not part of the Drafts 01 to 10 build chain.

## References

- [Open items](../design.md#open-items)
- [Work plan](../design.md#work-plan)
- [Security model](../design.md#security-model)
