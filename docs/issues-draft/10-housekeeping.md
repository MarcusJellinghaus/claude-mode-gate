# Housekeeping: skills, agents and plugin CI

## Goal

Make the skills and agents copied from mcp-coder fit this repo, and check the plugin contract in CI.

## Scope

- Decide on `.claude/knowledge_base`: create it or remove the references.
- Replace `mcp-coder gh-tool` usage.
- Remove the stale "wait 5 seconds" line in `issue_analyse_supervisor`.
- Review the three `bypassPermissions` agents. Replace them with profiles once available.
- Add `claude plugin validate` and `claude plugin test` to CI, pinned to a Claude Code version, plus a weekly run against the latest.
- Check the Node floor in `engines` against what the dependencies need, and fix the note if wrong.

## Acceptance criteria

- [ ] No skill or agent mentions `mcp-coder gh-tool` or a missing knowledge base file.
- [ ] No skill or agent waits or sleeps.
- [ ] Each agent has a documented reason for its permission mode, or uses a profile.
- [ ] CI runs `claude plugin validate` and `claude plugin test` on a pinned version.
- [ ] A weekly scheduled job runs the same against the latest version.
- [ ] The CI action references stay pinned (`npm run check:pins` passes).
- [ ] `engines` and the CLAUDE.md or README note agree.
- [ ] `npm run check` passes.

## Depends on

Draft 01 (the validate and test commands). Agent replacement also needs Draft 06 and Draft 09.

## References

- [Work plan](../design.md#work-plan)
- [Subagents](../design.md#subagents)
- [Prior art](../design.md#prior-art)
- [Testing](../design.md#testing)
