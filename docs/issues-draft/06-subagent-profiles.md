# Subagent profiles

## Goal

Let a parent assign a subset of its own profiles to a subagent, enforced by agent id. Authority only narrows down the tree and ends at the user.

## Scope

- At spawn, the parent assigns profiles it holds. The subagent gets baseline plus those, nothing else.
- The prompt names the allowed profiles, and the mod enforces the same list.
- A denial names the needed profile and tells the agent to stop and report. There is no request tool.
- Non-delegable profiles cannot be assigned. They go to the user.
- Revoking a profile removes the copies delegated from it.
- Nested agents can only narrow.

Depends on the spike: agent id (assumption 2), launch visibility (10) and hooks under `bypassPermissions` agents (11). If these fail, write down the fallback first.

## Acceptance criteria

- [ ] A subagent cannot use a profile its parent does not hold.
- [ ] A subagent cannot use a profile that was not assigned.
- [ ] A non-delegable profile cannot be assigned.
- [ ] The denial message names the profile and says to stop and report.
- [ ] `/gate-off` on a profile also removes it from running subagents.
- [ ] A nested agent never holds more than its parent.
- [ ] Tests cover each case above through `decide`.

## Depends on

Draft 01 (assumptions 2, 10, 11), Draft 03, Draft 04

## References

- [Subagents](../design.md#subagents)
- [Decision order](../design.md#decision-order)
- [Unverified assumptions](../design.md#unverified-assumptions)
- [Security model](../design.md#security-model)
