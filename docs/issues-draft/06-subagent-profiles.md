# Subagent profiles

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. A **subagent** is a Claude run started by another Claude (the parent). **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 06 of 11 (plan: Draft 00). It makes delegation safe: a subagent gets only what its parent hands down.

## Design decisions this issue relies on

- A subagent gets the baseline plus the profiles its parent assigns at spawn. Nothing else.
- The parent can assign only profiles it holds, so authority only narrows down the tree. The chain ends at the user. Nested agents only narrow.
- The prompt tells the subagent to use only those profiles. The mod enforces the same list, by agent id.
- A denied call returns a message naming the profile that would be needed. The subagent stops and reports. The parent decides; profiles marked non-delegable go to the user. There is no request tool.
- Revoking a profile also removes the copies delegated from it.
- Decision order step 1: a subagent calls Bash and no active allow rule matches this call: deny, with the redirect message (Draft 05). Then protected paths, then deny beats ask beats allow across the subagent's active set.
- Security model row: "A subagent asks for more" is a confused-deputy risk, closed by "the parent decides, and non-delegable profiles go to the user".
- Later (not here): skills and agents declaring profiles in their definitions.

## Depends on unverified API facts

- Assumption 2: `tool.call` and `tool.check` carry an agent id.
- Assumption 10: a mod sees a subagent launch and its parameters, to record the assigned profiles.
- Assumption 11: hooks run for `bypassPermissions` agents. The three agents in `.claude/agents/` use that mode.

**If assumption 2, 10 or 11 fails, write the fallback design into `docs/design.md` first, before writing code.** Possible fallbacks: without 2, treat every Bash call during a subagent run as a subagent call and deny it, which is coarser; without 10, assignment cannot be recorded, so subagents get the baseline only; without 11, those agents bypass the mod, so stop using `bypassPermissions` (Draft 10).

## Existing code

- `hooks/policy.ts`: pure; `decide` from Draft 03 takes the agent context. `hooks/register.ts`: wiring; Draft 04's state in `$.state` (the active profile names, an array in switch-on order) gains a per-agent profile map.
- `.claude/agents/commit-pusher.md`, `issue-approver.md`, `issue-updater.md`: copied from mcp-coder, run with `bypassPermissions` (Draft 10 reviews them).
- `CLAUDE.md` "Testing strategy": test through `decide`, negative test per security rule.

## Goal

Let a parent assign a subset of the profiles it holds to a subagent, enforced by agent id.

## Scope

- Record assignments at spawn, keyed by agent id.
- Enforce: baseline plus assigned only; the parent's own profiles are not inherited.
- Denial message: names the needed profile and says to stop and report.
- Non-delegable flag honoured (field from Draft 02).
- Revocation cascades to delegated copies; nested agents only narrow.

## Out of scope / later

A request tool for subagents. Skill and agent declared profiles.

## Open questions

- How does a parent express an assignment: in the spawn prompt, or a parameter? Depends on what the spike (Draft 01) finds about launch parameters.

## Acceptance criteria

- [ ] A subagent cannot use a profile its parent does not hold.
- [ ] A subagent cannot use a profile that was not assigned, even if the parent holds it.
- [ ] A non-delegable profile cannot be assigned.
- [ ] The denial names the profile and says to stop and report.
- [ ] `/gate-off` of a profile removes it from subagents that got it from that profile.
- [ ] A nested agent never holds more than its parent.
- [ ] A subagent Bash call that no active allow rule matches is denied with the redirect.
- [ ] `npm run check` passes.

## How to start

Write the fallback note for assumptions 2, 10 and 11 in `docs/design.md` once Draft 01 has results. First failing test: a call with agent id `a1` and no assigned profiles is denied for `git commit`, while the same call by the user's main agent with `git-write` active is allowed.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 01 (assumptions 2, 10, 11), Draft 02, Draft 03, Draft 04

## References

- [Subagents](../design.md#subagents)
- [Decision order](../design.md#decision-order)
- [Unverified assumptions](../design.md#unverified-assumptions)
- [Security model](../design.md#security-model)
