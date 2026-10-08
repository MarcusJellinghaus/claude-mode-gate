# Housekeeping: skills, agents and plugin CI

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 10 of 11 (plan: Draft 00). The repo contains workflow files copied from the mcp-coder project that do not fit it yet, and CI lacks the plugin contract checks.

## Design decisions this issue relies on

- Subagents get the baseline plus assigned profiles. The three dedicated agents (`commit-pusher`, `issue-approver`, `issue-updater`) run with `bypassPermissions`, which exists only because there are no profiles yet. Later, agents may declare profiles in their definitions, which would make these "specialist" agents unnecessary.
- Unverified assumption 11: hooks run for `bypassPermissions` agents. If false, those agents skip the mod entirely, so replace them first.
- Testing strategy item 6: `claude plugin validate` and `claude plugin test` join CI once verified (Draft 01), pinned to a Claude Code version, plus a weekly run against the latest.
- Workflow actions are pinned to full commit SHAs (`npm run check:pins`).

## Existing code

- `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`: copied from mcp-coder. `CLAUDE.md` says the Python tools are replaced by `npm run` scripts and the sleep tool is dropped, but they still assume `mcp-coder gh-tool` for issue status and `.claude/knowledge_base/*.md`, which this repo lacks. `issue_analyse_supervisor` has a stale "wait 5 seconds" line.
- `.github/workflows/ci.yml`: jobs `static`, `test` (Ubuntu and Windows, Node 22 and 24), `plugin` (has a TODO for `claude plugin validate` and `claude plugin test`), `docs`, `security`, `mutation` (schedule or manual only). The weekly cron is `0 6 * * 1`.
- `package.json`: `"engines": { "node": ">=22.12" }`. `.github/dependabot.yml`: dependency updates.
- `scripts/check-action-pins.mjs`: requires SHA pins; new actions must comply.

## Goal

Make the copied skills and agents correct for this repo, and add the plugin contract checks to CI.

## Scope

- Decide on `.claude/knowledge_base`: create the files the skills reference, or remove the references.
- Replace `mcp-coder gh-tool` usage (for example `set-status`) with the mcp-workspace GitHub tools or remove the status steps.
- Remove the "wait 5 seconds" line in `issue_analyse_supervisor`.
- Review the three `bypassPermissions` agents. Replace them with profiles once Drafts 06 and 09 exist; until then document why each needs the mode.
- Add `claude plugin validate` and `claude plugin test` to the `plugin` CI job, pinned to a Claude Code version, plus a weekly run against the latest.
- Check that the Node floor (`>=22.12`) matches what dependencies need; fix the engines field and notes if not.

## Out of scope / later

Profiles declared by skills and agents. Listing in the official plugin directory.

## Acceptance criteria

- [ ] No skill or agent mentions `mcp-coder gh-tool` or a missing knowledge-base file.
- [ ] No skill or agent waits or sleeps.
- [ ] Each agent has a documented reason for its permission mode, or uses a profile.
- [ ] CI runs `claude plugin validate` and `claude plugin test` on a pinned Claude Code version.
- [ ] A weekly job runs the same against the latest version, and a failure there does not block PRs.
- [ ] New actions are SHA-pinned; `npm run check:pins` passes.
- [ ] `engines` and the notes agree.
- [ ] `npm run check` passes.

## How to start

Grep the skills and agents for `gh-tool`, `knowledge_base` and `sleep`/`wait`, list the hits in the issue, then fix them one skill at a time. For CI, first run `claude plugin validate` locally to learn its output and exit codes.

## Working rules

TDD where code exists, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 01 (the CLI commands and Claude Code version). Agent replacement also needs Draft 06 and Draft 09.

## References

- [Work plan](../design.md#work-plan)
- [Subagents](../design.md#subagents)
- [Unverified assumptions](../design.md#unverified-assumptions)
- [Testing](../design.md#testing)
- [Prior art](../design.md#prior-art)
