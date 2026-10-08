# claude-mode-gate: plan and overview

## Goal

Build claude-mode-gate v1: a Claude Code mod that limits what Claude may do through a fixed baseline plus profiles the user switches on and off. This issue tracks the child issues and their order.

## Scope

**Problem.** Claude Code asks too often or allows too much. Bash is the weak spot: a prefix rule can be fooled by chained commands.

**Idea.** A baseline allows reads, undoable project writes and the check scripts. Profiles such as `git-write` add allow, ask and deny rules. `/gate-on` and `/gate-off` switch them, and the band always shows which are active. Everything else still asks.

**Subagents and headless.** A subagent gets the baseline plus the profiles its parent assigns, enforced by agent id. Headless runs read starting profiles from `MODE_GATE_PROFILES`, and a call that would ask is denied.

**In v1.** Baseline, profiles, the commands, guards, subagent profiles, band, log, explain and replay, two first profiles.

**Later.** Parameterised profiles, skill-declared profiles, a typed commit tool, enforce mode, a log with arguments, directory listing.

**Principles.** TDD, KISS, clean code, concise writing (see CLAUDE.md).

| Draft | Title                                  | Purpose                                  |
| ----- | -------------------------------------- | ---------------------------------------- |
| 01    | Spike: verify the Claude Code API      | Check the 15 assumptions, get type files |
| 02    | Config schema, loader and validator    | Profile data, `/gate-check`              |
| 03    | Policy: `decide()`                     | Pure decision logic                      |
| 04    | Wiring and `/gate-*` commands          | Hooks, session state, fail-closed        |
| 05    | Guards: protected paths, Bash redirect | Deny list and redirect hints             |
| 06    | Subagent profiles                      | Delegation by agent id                   |
| 07    | Band, `/gate-why` and decision log     | Visibility                               |
| 08    | `/gate-explain` and replay             | Dry run and offline replay               |
| 09    | First profiles and README              | `git-write`, `issues`, docs              |
| 10    | Housekeeping                           | Adapt skills, agents and CI              |
| 11    | Post-merge repo setup                  | Rulesets and CodeQL                      |

## Acceptance criteria

- [ ] Draft 01 Spike: verify the Claude Code API
- [ ] Draft 02 Config schema, loader and validator
- [ ] Draft 03 Policy: `decide()`
- [ ] Draft 04 Wiring and `/gate-*` commands
- [ ] Draft 05 Guards: protected paths, Bash redirect
- [ ] Draft 06 Subagent profiles
- [ ] Draft 07 Band, `/gate-why` and decision log
- [ ] Draft 08 `/gate-explain` and replay
- [ ] Draft 09 First profiles and README
- [ ] Draft 10 Housekeeping
- [ ] Draft 11 Post-merge repo setup

## Depends on

none

## References

- [Summary](../design.md#summary)
- [Work plan](../design.md#work-plan)
- [Later](../design.md#later)

Order of work: Draft 01 first. Drafts 02 and 03 can then run in parallel. Draft 04 needs 02 and 03, and 05 needs 03 and 04. Drafts 06, 07 and 08 follow, 09 after 02 to 05, and 10 any time after 01. Draft 11 waits for the first merged PR.
