# Post-merge repo setup: rulesets and CodeQL

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls through a fixed baseline plus switchable profiles (each with `allow`, `ask` and `deny` lists; switched by `/gate-on` and `/gate-off`). Because it is a security tool, the repository itself needs to resist tampering.

This is Draft 11 of 11 (plan: Draft 00). It is repository administration, not code. It needs admin rights and the GitHub API, so the owner does it, or an agent with the owner's explicit approval. It happens after PR #1 (branch `feature/initial-repo-setup`) is merged.

## Design decisions this issue relies on

- Open item in the design: "Repo setup: apply the ruleset on `main` (PR and CI required, admins included), CodeQL, action pinning." Action pinning is done (`npm run check:pins`).
- Rulesets and scanning are the repo-level counterpart of the security model: a PR is the only route to `main`, CI is the gate, and releases cannot be altered.
- Workflow actions stay pinned to full SHAs. CodeQL uses the default setup, so no workflow file is added.
- mcp-workspace has no repo-settings tool. The admin calls use `gh api` through Bash, and the owner approves each settings change before it is applied.

## Existing code

- `.github/workflows/ci.yml`: triggers `push` to `main`, `pull_request`, weekly `schedule`, `workflow_dispatch`. There is no path filter and no `merge_group`, so no required check is skipped and merge queue is out of scope. Job `name:` values:
  - `static`: `Static checks (types, lint, format, architecture, dead code)`
  - `test`: `Unit tests and coverage (Node ${{ matrix.node }}, ${{ matrix.os }})`, matrix `os` ubuntu-latest and windows-latest, `node` 22 and 24
  - `plugin`: `Plugin manifests and fail-closed guard`
  - `docs`: `Documentation`
  - `security`: `Dependency audit and secret scan`
  - `mutation`: `Mutation tests (policy.ts)`, runs only on `schedule` or `workflow_dispatch`
- Draft 10 adds `claude plugin validate` and `claude plugin test` to the `plugin` job and may add or rename a plugin check, so the names are confirmed again before the ruleset is applied.
- `.github/dependabot.yml`, `SECURITY.md` (owned by Draft 09), `LICENSE` (MIT), `CHANGELOG.md`, `CLAUDE.md` (Workflow section).

## Goal

Protect `main` with a ruleset, enable code scanning, and protect release tags.

## Scope

Do the steps in this order.

1. **Confirm the check names.** Read the check list of a real CI run on `main` or a PR (`gh api repos/{owner}/{repo}/commits/{sha}/check-runs`). The expected required contexts are exactly these eight names (four jobs, plus the four matrix combinations of `test`):
   - `Static checks (types, lint, format, architecture, dead code)`
   - `Plugin manifests and fail-closed guard`
   - `Documentation`
   - `Dependency audit and secret scan`
   - `Unit tests and coverage (Node 22, ubuntu-latest)`
   - `Unit tests and coverage (Node 22, windows-latest)`
   - `Unit tests and coverage (Node 24, ubuntu-latest)`
   - `Unit tests and coverage (Node 24, windows-latest)`

   Only checks that run on `pull_request` and block merge are required. Jobs that run only on `schedule` or `workflow_dispatch` are excluded. If the run shows a different name (Draft 10 changed one, or added a check), use the name from the run. A wrong name makes a required check wait forever. Not required: `Mutation tests (policy.ts)` and the weekly latest-Claude-Code-version job from Draft 10, which do not run on pull requests.

2. **Ruleset on `main`** (`POST /repos/{owner}/{repo}/rulesets`, `target: branch`, include `~DEFAULT_BRANCH`), with `enforcement: active` and `bypass_actors: []`: nobody bypasses, admins included. Rules:
   - `pull_request` with `required_approving_review_count: 0` and `allowed_merge_methods: ["squash"]`
   - `required_status_checks` with `strict_required_status_checks_policy: true`, the contexts from step 1, and each context pinned to the GitHub Actions app (`integration_id` of `github-actions`, read from the check-run `app.id`)
   - `required_linear_history`
   - `non_fast_forward`
   - `deletion`

   The session reads the API response back and checks that `bypass_actors` is empty and `enforcement` is `active`.

3. **CodeQL default setup only**: `PATCH /repos/{owner}/{repo}/code-scanning/default-setup` with `state: configured`, `query_suite: default` and `languages: ["javascript-typescript", "actions"]`. Do not add a CodeQL workflow file; it would conflict with the default setup. CodeQL is not made a required check. After enabling, note its expected check name on a PR as "confirm from a real run"; do not guess a name.
4. **Documentation through a PR (first of two).** Write `docs/repo-settings.md`: the `main` ruleset JSON body, the CodeQL default-setup state and the line "immutable releases: pending", so they can be reproduced. It must pass `npm run docs:lint` and `npm run check:docs`. SECURITY.md is not touched (Draft 09 owns it). Open it as a pull request, let the required checks pass, and merge it by squash. It merges after the ruleset exists, so this PR is also the test that the ruleset works.
5. **Before the first release tag**: a tag ruleset (`target: tag`, include `refs/tags/v*`, `bypass_actors: []`, rules `deletion`, `non_fast_forward`, `update`), and immutable releases. Immutable releases is a repository setting. Check the GitHub documentation for an API. If none exists, stop and ask the owner to enable it on the repository settings page (see Stop and ask). Add the tag ruleset JSON body and the immutable-releases state to `docs/repo-settings.md` through a second PR.

## Out of scope / later

Branch protection for other branches. Signed commits. Merge queue (CI has no `merge_group` trigger). Making CodeQL a required check before its names are confirmed.

## Open questions

None. Decided: zero required approving reviews (a solo owner cannot approve their own PR), only `pull_request` checks are required (not the `schedule`/`workflow_dispatch` jobs), nobody bypasses the rulesets.

## Acceptance criteria

- [ ] The required contexts equal the check names of a real run, confirmed immediately before the ruleset is applied; `Mutation tests (policy.ts)` is not required.
- [ ] The API response for the `main` ruleset shows `enforcement: active` and no bypass actors.
- [ ] A direct push to `main` is rejected, including for admins.
- [ ] A PR cannot merge while a required check fails or is missing, and a PR behind `main` must be updated first (strict policy).
- [ ] Only squash merge is offered, and history is linear.
- [ ] Force-push and deletion of `main` are rejected.
- [ ] CodeQL default setup is `configured` for `javascript-typescript` and `actions`, and reports on a PR. No CodeQL workflow file exists.
- [ ] The docs PR (`docs/repo-settings.md`) passed all required checks and merged by squash.
- [ ] The first docs PR's `docs/repo-settings.md` holds the `main` ruleset JSON body, the CodeQL state and "immutable releases: pending"; `npm run docs:lint` and `npm run check:docs` pass.
- [ ] Before the first release: a `v*` tag cannot be moved or deleted (including by admins), and releases are immutable, or the owner was asked to enable them. A second docs PR adds the tag ruleset JSON body and the immutable-releases state to `docs/repo-settings.md`.
- [ ] Any workflow added keeps `npm run check:pins` passing.

## How to start

Merge PR #1 and Draft 10, then read the check names from a real run. Show the owner each `gh api` call and its JSON body, and run it only after approval.

## Working rules

Concise writing. Use the mcp-workspace tools for file work; Bash only for `gh api` admin calls (no MCP tool exists) and git add, commit and push. Do not change settings without the owner's go-ahead. Run `npm run check` before committing any file change.

**Stop and ask** means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and change no further settings.

## Depends on

PR #1 merged. Draft 10 merged first, so the plugin check names are final. Not part of the Drafts 01 to 09 build chain.

## References

- [Open items](../design.md#open-items)
- [Work plan](../design.md#work-plan)
- [Security model](../design.md#security-model)
