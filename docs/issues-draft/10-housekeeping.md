# Housekeeping: skills, agents and plugin CI

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. A parent assigns them with the first line of the Agent call prompt, `mode-gate-profiles: name1, name2` (Draft 06). **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 10 of 11 (plan: Draft 00). The repo contains workflow files copied from the mcp-coder project that do not fit it yet, and CI lacks the plugin contract checks.

## Design decisions this issue relies on

- The owner decided to **keep all copied skills and agents**. The mcp-coder dependency is documented in one place, `.claude/README.md`, not removed. Only what blocks this repo is adapted: (a) the three `bypassPermissions` agents, (b) the timed waits, (c) the commit message form.
- Subagents get the baseline plus assigned profiles. The three dedicated agents (`commit-pusher`, `issue-approver`, `issue-updater`) run with `bypassPermissions`, which exists only because there were no profiles. They are replaced: the supervisor skills launch a plain subagent whose Agent call prompt starts with `mode-gate-profiles: git-write` (commit and push) or `mode-gate-profiles: issues` (issue edits and comments). Both built-in profiles come from Draft 09.
- A subagent's Bash call that no allow rule matches is denied (decision-order step 1). So the replacement skills use the typed tools `github_issue_edit`, `github_issue_comment` and `github_issue_create` instead of `gh issue ...` through Bash. Cross-repo issues use their `reference_name` argument instead of `--repo` (`issue_approve`, `issue_update`, the supervisor skills): the repo name must match a configured reference project, found with `get_reference_projects`. If none matches, the skill stops and asks the owner (see Stop and ask).
- A subagent launched with the marker needs the profile held by the parent, or the marker is denied (Draft 06). A skill cannot run `/gate-status` (a user command), so it does not check first. It launches the subagent with the marker. If the marker is denied (the profile is not held), the denial message names who decides; the skill then tells the user to run `/gate-on git-write` or `/gate-on issues` and stops (see Stop and ask).
- Pushes: `git-write` allows only plain `git push`. A new branch needs `git config push.autoSetupRemote true` once, so no skill runs `git push -u origin HEAD`.
- Commits: this repo adds no Co-Authored-By trailer (`attribution` is empty in `.claude/settings.json`), so no message file is needed. An allow rule for Bash never matches a command with a shell metacharacter (`& ; | $ ( ) \` < >`or a newline). The commit step therefore runs`git commit -m "<message>"`with a one-line message free of these characters (parentheses included), never a heredoc. A subagent's ask is a deny, so the skill rewrites a message that needs one. The existing`commit_push`"no attribution" wording stays. The commit step stages explicit paths only (never`git add -A`). A typed commit tool (a "Later" item in `docs/design.md`) would lift the limit.
- Unverified assumption 11: hooks run for `bypassPermissions` agents. If false, those agents skip the mod entirely and cannot be gated. Then **stop and ask the owner at once**. Draft 10 does not wait for Drafts 06 and 09 in that case, and it must not leave the three agents running ungated. Drafts 01 and 06 say the same.
- Testing strategy item 6: `claude plugin validate` and `claude plugin test` join CI once verified (Draft 01), pinned to a Claude Code version, plus a weekly run against the latest.
- Workflow actions are pinned to full commit SHAs (`npm run check:pins`).

## Existing code

- `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`: copied from mcp-coder. `CLAUDE.md` says the Python tools are replaced by `npm run` scripts and the sleep tool is dropped. What the grep finds today:
  - `mcp-coder gh-tool set-status` (and `allowed-tools` entries for it) in `implementation_approve`, `implementation_needs_rework`, `plan_approve`; `mcp-coder gh-tool checkout-issue-branch` and `set-status` in `implement_direct`; `mcp-coder implement` in `implementation_needs_rework`; `mcp-coder rebase` in `rebase/rebase_design.md`.
  - `.vscodeclaude_status.txt` in `implement_direct`, `issue_analyse`, `issue_approve`, `issue_analyse_supervisor`.
  - `.claude/knowledge_base/*.md` (`software_engineering_principles`, `planning_principles`, `refactoring_principles`, `python`) in `implementation_review_supervisor`, `issue_analyse_supervisor`, `plan_review`, `plan_review_supervisor`. The directory does not exist here.
  - `gh issue view|comment|create|edit` through Bash in `issue_approve`, `issue_create`, `issue_update`, and in the `issue-approver` and `issue-updater` agents.
  - Timed waits: `issue_analyse_supervisor` step 8, Finalize ("wait 5 seconds for the GitHub Action"), and the `issue-approver` agent's "post-approval wait". `issue_approve` steps 4 and 5 are already reworded in the working tree as "fetch again" (no timed wait).
  - Confirmation waits that stay: `rebase` ("wait for explicit approval" of the base branch) and the supervisor skills' "ask the user".
  - `commit_push` says "No Claude Code footer or attribution in commit message" (to become: follow the project's CLAUDE.md for trailers) and uses `git push` forms; `commit-pusher` says multi-line messages need a heredoc.
  - Each agent ends with "Rationale and limits: `docs/repository-setup/agent-permissions.md` in the mcp-coder repository", a file this repo does not have.
- `.github/workflows/ci.yml`: jobs `static`, `test` (Ubuntu and Windows, Node 22 and 24), `plugin` (has a TODO for `claude plugin validate` and `claude plugin test`), `docs`, `security`, `mutation` (schedule or manual only). The weekly cron is `0 6 * * 1`. The link check covers `./*.md` only and excludes `.claude/skills` and `.claude/agents`.
- `package.json`: `"engines": { "node": ">=22.12" }`. `.github/dependabot.yml`: dependency updates.
- `scripts/check-action-pins.mjs`: requires SHA pins; new actions must comply.

## Goal

Make the copied skills and agents work in this repo without the three `bypassPermissions` agents, document what still needs mcp-coder, and add the plugin contract checks to CI.

## Scope

- Create `.claude/README.md`, the one place that lists the mcp-coder dependency. It names, per skill, what needs mcp-coder: its `mcp-coder` CLI (`gh-tool set-status`, `gh-tool checkout-issue-branch`, `implement`, `rebase`), the `status-0x` labels, the GitHub Action behind an `/approve` comment, `.vscodeclaude_status.txt`, and `.claude/knowledge_base/*.md` (does not exist here). It says these skills are kept as they are and work only with mcp-coder's setup. It also says the three `bypassPermissions` agents are gone and why, and that a supervisor skill launches its subagent with the marker; if the marker is denied (the profile is not held), the denial message names who decides, and the skill tells the user to run `/gate-on git-write` or `/gate-on issues` and stops. Other skills and agents carry no mcp-coder text that the README does not list.
- Replace the three agents. Edit `issue_analyse_supervisor`, `implementation_review_supervisor` and `plan_review_supervisor` to launch a plain subagent with the first prompt line `mode-gate-profiles: git-write` (commit and push) or `mode-gate-profiles: issues` (issue update and approval), and the instructions the old agent file carried (scope check, report). The launching steps are: `implementation_review_supervisor` steps 5, 9 and 11 and `plan_review_supervisor` steps 5 and 7 (each says "the commit agent", meaning `commit-pusher`; `git-write`), and `issue_analyse_supervisor` step 5 (`issue-updater`; `issues`) and step 8, Finalize (`issue-approver`; `issues`). If the marker is denied, the skill tells the user to run `/gate-on <name>` and stops. Replace `gh issue ...` in `issue_approve`, `issue_update` and `issue_create` with `github_issue_comment`, `github_issue_edit` and `github_issue_create`, and update their `allowed-tools`. Replace the heredoc in the commit step with a one-line `git commit -m "<message>"` free of shell metacharacters (see Design decisions), and `git push -u origin HEAD` in `commit_push` with `git push`. Delete the three agent files once no skill launches them.
- Remove the timed waits: `issue_analyse_supervisor` step 8's "wait 5 seconds" (and the agent's "post-approval wait" with the agent file). A check that depends on the GitHub Action is a retry-the-fetch instruction, as `issue_approve` steps 4 and 5 already read. Waiting for the user's confirmation stays (`rebase`, the supervisor skills).
- Each remaining agent file (if any) states its permission mode and the reason itself, with no pointer to a file in the mcp-coder repository.
- If assumption 11 failed: stop and ask the owner before anything else in this scope (see Working rules). This scope item does not wait for Drafts 06 and 09 then.
- Add `claude plugin validate` and `claude plugin test` to the `plugin` CI job. The Claude Code version is pinned in the repo file `.claude-code-version`, which the workflow reads. Add a weekly run against the latest. If these CLI commands need an API key or login in CI, stop and ask the owner; no secret is added to pull-request runs.
- Check that the Node floor (`>=22.12`) matches what dependencies need; fix the engines field and notes if not.

## Out of scope / later

Profiles declared by skills and agents. Listing in the official plugin directory. A typed commit tool. Adapting the mcp-coder-only skills to this repo.

## Acceptance criteria

- [ ] `.claude/README.md` exists and lists the mcp-coder dependency as defined in Scope (CLI commands, `status-0x` labels, the Action behind `/approve`, `.vscodeclaude_status.txt`, the missing `.claude/knowledge_base/*.md`).
- [ ] Every `mcp-coder` reference in `.claude/skills` and `.claude/agents` (`gh-tool`, `implement`, `rebase`, and any other) is either removed or listed in `.claude/README.md`. The grep for `mcp-coder` shows no unlisted hit.
- [ ] No skill or agent calls `gh` through Bash, and none uses a heredoc or `<<` for a commit message.
- [ ] No timed wait remains: a grep for `sleep` and `wait N seconds` finds nothing. Waiting for the user's confirmation (`rebase`, the supervisor skills) stays and is not checked.
- [ ] `commit-pusher.md`, `issue-approver.md` and `issue-updater.md` are deleted, and no skill names them: a grep of `.claude/skills` for `commit-pusher`, `issue-updater`, `issue-approver` and the phrase "commit agent" has zero hits that launch a `bypassPermissions` agent. The three supervisor skills launch a plain subagent with `mode-gate-profiles: git-write` or `mode-gate-profiles: issues` as the first prompt line.
- [ ] The commit step runs `git commit -m "<one-line message>"` with no shell metacharacter; the command matches `Bash(git commit *)` with `git-write` active (test row from Draft 09's table, or a `/gate-explain` run). `commit_push` pushes with plain `git push`.
- [ ] No agent file has `permissionMode: bypassPermissions`. Any remaining agent file states its mode and reason itself.
- [ ] If assumption 11 failed, the owner was told first and no commit leaves the three agents in place and ungated.
- [ ] The commit step stages explicit paths only (no `git add -A`).
- [ ] Each supervisor skill launches its subagent with the marker. If the marker is denied (the profile is not held), the skill tells the user to run `/gate-on git-write` or `/gate-on issues` and stops. No skill tells the model to run `/gate-status`. `.claude/README.md` carries the same sentence.
- [ ] `issue_approve`, `issue_update` and the supervisor skills pass `reference_name` (a name from `get_reference_projects`) instead of `--repo`; with no matching reference project they stop and ask the owner. No `--repo` remains.
- [ ] CI runs `claude plugin validate` and `claude plugin test` on the Claude Code version in `.claude-code-version`, which the workflow reads.
- [ ] No secret is added to pull-request runs; if the commands need auth in CI, the owner was asked first.
- [ ] A weekly job runs the same against the latest version, and a failure there does not block PRs.
- [ ] New actions are SHA-pinned; `npm run check:pins` passes.
- [ ] `engines` and the notes agree.
- [ ] `npm run check` passes.

## How to start

Grep `.claude/skills` and `.claude/agents` for `gh `, `mcp-coder`, `knowledge_base`, `wait`, `sleep` and `<<`, and compare with the list in "Existing code". If Draft 01 marks assumption 11 `failed`, stop and ask first. Write `.claude/README.md`, then fix one skill at a time. For CI, first run `claude plugin validate` locally to learn its output and exit codes.

## Working rules

TDD where code exists, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

**Stop and ask** means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and leave the work uncommitted.

## Depends on

Draft 01 (the CLI commands, the Claude Code version, assumption 11). Replacing the three agents also needs Draft 06 (the marker) and Draft 09 (`git-write` and `issues`), except when assumption 11 failed: then stop and ask at once.

## References

- [Work plan](../design.md#work-plan)
- [Subagents](../design.md#subagents)
- [Unverified assumptions](../design.md#unverified-assumptions)
- [Testing](../design.md#testing)
- [Prior art](../design.md#prior-art)
