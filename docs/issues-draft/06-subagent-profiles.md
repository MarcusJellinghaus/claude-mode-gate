# Subagent profiles

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. A **subagent** is a Claude run started by another Claude (the parent) through the Agent tool. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 06 of 11 (plan: Draft 00). It makes delegation safe: a subagent gets only what its parent hands down.

## Design decisions this issue relies on

- A subagent gets the baseline plus the profiles its parent assigns at spawn. Its allow rules come from those only.
- **Restrictions are inherited, allows are not.** The `deny` and `ask` lists of the main session's active profiles also apply to every subagent (deny beats ask beats allow as usual). `allow` lists apply to a subagent only when assigned. Reason: a deny-only profile in the main session (for example a read-only profile) must not be escapable by launching a subagent. Authority still only narrows down the tree. A subagent's **effective set** is the baseline, its assigned profiles' rules and the main session's active profiles' deny and ask lists.
- **Assignment channel.** The parent assigns profiles in the prompt of its Agent tool call. The first line of the prompt is `mode-gate-profiles: name1, name2` (names separated by commas). An absent or empty marker means baseline only. The mod reads the marker from the Agent tool call input (assumption 10).
- **Matching a launch to the new agent.** The key is the Agent call's `toolCallId`. The mod keeps a pending assignment record keyed by that id and binds it to the subagent's agent id on the event that carries the new id (assumption 10 also asks which event or field that is, and whether it carries the `toolCallId` or another value linking it to the call). Matching by arrival order or "the only pending record" is forbidden. If the launch cannot be linked to the new agent by a real identifier (no `toolCallId`, no id-bearing event, or an event without a linking value), the subagent gets the baseline only; this is the documented fallback. This prevents parallel spawns from swapping assignments.
- **Binding and revocation.** At bind time the assignment is intersected with the parent's currently held set, so a profile switched off in between is dropped. `/gate-off` and `/clear` also clear pending (not yet bound) records.
- **Who writes the record.** It is written for any Agent call that is not denied, once, idempotently (keyed by `toolCallId`), only on the live decision path. A `tool.call` hook never sees an allow, so the write happens on whichever live hook first sees the call and returns a non-deny verdict; the key keeps a second write harmless. A dry run never writes it (`/gate-explain` uses a no-op for side effects, Draft 08), and neither does an Agent call that was denied or rejected as an invalid assignment.
- **Record fields.** `toolCallId`, the requested profile names and the calling agent's id (`main` for the main session). At bind time the mod intersects the request with the currently held set of that caller (the main session's active profiles, or the calling agent's assigned set), so it knows whose set to use.
- The parent writes the advice to use only the assigned profiles into its own spawn prompt; the mod adds nothing to the prompt. That is advice. The mod's enforcement of the same list is what counts.
- The parent can assign only profiles it holds, so authority only narrows down the tree. The chain ends at the user. A parent's set is the main session's active profiles, or for a nested parent its own assigned set. A child's set is always a subset of its parent's, so nested agents can only narrow.
- **Invalid assignment.** If the marker names a profile the parent does not hold, or one that is not delegable (or unknown), the Agent call is denied. The deny is a guard-sourced result (`source` = `guard`), produced by the pure function `checkAssignment(requested, held, profiles)` in the new module `hooks/assignment.ts` (this issue owns it). It returns the offending names (not held, non-delegable or unknown). `register.ts` wires it as a closure over `$.state` (the calling agent's held set, the config, the delegable flags). Draft 03's closed list of sources and Draft 04's guard context do not change. The message names the offending profiles and who decides: for a profile the parent does not hold, the parent; for a non-delegable profile, the user, via `/gate-on` in the main session.
- **No assignment record** (unknown agent id, wiped state, a spawn without a marker or without a binding): the subagent gets the baseline only (fail closed), still subject to the main session's deny and ask lists. This replaces Draft 04's placeholder, under which subagent calls used the session's active set.
- **Limit of enforcement.** Decision step 1 (the subagent-Bash deny) is Bash-only. A non-Bash call that no rule of the subagent's set matches keeps Claude Code's verdict, which is allow in a `bypassPermissions` agent. What is guaranteed: the allow rules of profiles that were not assigned never apply to a subagent, and the main session's deny and ask lists always do.
- **Revocation.** Switching a profile off in the main session removes it from the assignments of all descendants (children and grandchildren). Assignments are cleared on `/clear` and on `session.start` (reasons `startup`, `resume`, `clear`; like Draft 04, any other reason changes nothing). Switching a profile on again does not bring delegated copies back.
- A denied subagent call returns a message with a **profile hint** (below). The subagent stops and reports. The parent decides; profiles marked non-delegable go to the user. There is no request tool.
- **Profile hint.** Owned by this draft and added in `register.ts` from the full decision. It reuses Draft 04's per-profile `decide` probe (run `decide` with one more profile in the active set) to name the delegable profiles whose allow rules would match the call. "Available" means held by the parent: the parent's held, delegable profiles. For a non-delegable profile that would match, it says to ask the user to run `/gate-on <name>`. Otherwise the message is generic. **For a subagent call this hint is the whole profile text of the deny message, also in a headless run**: it replaces Draft 04's headless list of all defined, switched-off profiles, which stays correct for main-session calls.
- Decision order step 1: a subagent calls Bash and no active allow rule matches this call: deny, with the redirect message (Draft 05). Then protected paths, then deny beats ask beats allow across the subagent's set.
- Security model row: "A subagent asks for more" is a confused-deputy risk, closed by "the parent decides, and non-delegable profiles go to the user".
- Later (not here): skills and agents declaring profiles in their definitions.

## Depends on unverified API facts

- Assumption 2: `tool.call` and `tool.check` carry an agent id, and main-session and subagent calls are distinguishable.
- Assumption 10: a mod sees the Agent tool call input including the prompt, and some event or field gives the new subagent's agent id together with the call's `toolCallId` or another value linking it to the call.
- Assumption 11: hooks run for `bypassPermissions` agents. The three agents in `.claude/agents/` use that mode.

**If assumption 2, 10 or 11 fails, write the fallback into `docs/design.md` first, before writing code.** Fallbacks:

- Assumption 2 fails (main and subagent calls not distinguishable): the subagent-Bash deny is inert and every call counts as main-session. This is a documented limitation (README and PR).
- Assumption 10 fails (the launch is not visible, or it cannot be linked to the new agent by a real identifier): no assignment is possible, so subagents get the baseline only.
- Assumption 11 fails (hooks do not run for `bypassPermissions` agents): the mod cannot gate them. Stop and ask (see Working rules).

## Existing code

- `hooks/policy.ts`: pure; `decide` from Draft 03 takes the agent context. `hooks/register.ts`: wiring; Draft 04's state in `$.state` (the active profile names, an array in switch-on order) gains a map of pending assignment records keyed by `toolCallId` and a per-agent map from agent id to its parent id and assigned profile names. Draft 04's shared path decides subagent calls with the session's active set; this draft replaces that with the subagent's effective set. Draft 04's shared path takes injected guard functions and side-effect dependencies (a no-op in `/gate-explain`); the assignment check and the record write plug in the same way.
- `hooks/assignment.ts` (new, this issue): `checkAssignment`, pure, imports nothing at runtime, like `hooks/guards.ts` (Draft 05). It is added to the coverage include list in `vitest.config.ts` (95% thresholds), to the `mutate` list in `stryker.config.json` and to a dependency-cruiser purity rule (like `policy-is-pure`).
- `.claude/agents/commit-pusher.md`, `issue-approver.md`, `issue-updater.md`: copied from mcp-coder, run with `bypassPermissions` (Draft 10 reviews them).
- `CLAUDE.md` "Testing strategy": test through `decide`, negative test per security rule.

## Goal

Let a parent assign a subset of the profiles it holds to a subagent through its spawn prompt, enforced by agent id.

## Scope

- Parse the `mode-gate-profiles:` first line of an Agent call's prompt and keep a pending record keyed by `toolCallId`; bind it to the new agent id on the id-bearing event.
- Add `hooks/assignment.ts` with the pure `checkAssignment(requested, held, profiles)`, wired in `register.ts` as a closure over `$.state`, and its three gates.
- Deny an Agent call whose marker is invalid (a guard result from `checkAssignment`); write the record once, idempotently, only on the live path and only for an accepted call.
- Enforce the effective set: baseline plus assigned profiles' rules plus the main session's deny and ask lists; the parent's allow rules are not inherited; no binding means the baseline plus those deny and ask lists.
- Denial message with the profile hint; non-delegable flag honoured (field from Draft 02).
- Bind-time intersection with the parent's current set; revocation cascades to all descendants; clearing of bound and pending records on `/clear`, `/gate-off` (pending) and `session.start`.

## Out of scope / later

A request tool for subagents. Skill and agent declared profiles. Gating non-Bash calls beyond the subagent's rules.

## Acceptance criteria

- [ ] The marker is read from the first line of the Agent call's prompt only: `mode-gate-profiles: a, b` assigns `a` and `b`; the same text on a later line, an absent marker and an empty marker assign nothing (baseline only).
- [ ] A subagent gets the baseline plus its assigned profiles' rules and the main session's active profiles' deny and ask lists; the allow rules of profiles that were not assigned never apply to it, even if the parent holds them.
- [ ] A subagent without assignments is still subject to the main session's deny lists: with a deny-only profile (a read-only profile that denies `Edit`) active in the main session, the subagent's matching call is denied; an `ask` list of an active profile asks.
- [ ] Deny beats ask beats allow in the subagent's effective set: an assigned profile's allow does not override an inherited deny or ask.
- [ ] Two parallel spawns with different markers (`a` and `b`) each keep their own assignment: the first subagent's calls use `a`, the second's use `b`, whatever the order of the id-bearing events.
- [ ] A spawn with no `toolCallId`, or whose id-bearing event carries no linking value or cannot be matched to a pending record, gets the baseline only. With exactly one pending record and an id-bearing event without a linking value, the record is not bound (no matching by arrival order or "the only pending record").
- [ ] At bind time the assignment is intersected with the parent's currently held set: a profile the parent switched off after the spawn started is not bound.
- [ ] A record pending while `/gate-off <p>` (or `/clear`) runs never binds `p`; `/gate-off` and `/clear` leave no pending record for the revoked profile.
- [ ] The assignment record is written once: repeating the same Agent call (same `toolCallId`) leaves one record. A dry run (`/gate-explain` with a no-op side effect) writes none. An Agent call denied for an invalid assignment, or denied by any other rule, writes none.
- [ ] The record is written for any Agent call that is not denied, including one that Claude Code allows or asks about, by whichever live hook first sees the call and returns a non-deny verdict; a `tool.call` then `tool.check` pair for the same `toolCallId` leaves one record.
- [ ] The record stores the calling agent's id, or `main` for the main session. A grandchild's request is intersected at bind time with its parent's currently held set, not the main session's (test: parent holds `a`, main session switched `a` off, so the grandchild's `a` is dropped; with `main` as caller the main session's set is used).
- [ ] The invalid-assignment deny has `source` `guard` and comes from `checkAssignment` called by the wiring as a closure over `$.state`; `decide`'s list of sources and Draft 04's guard context are unchanged.
- [ ] `checkAssignment(requested, held, profiles)` returns exactly the names that are not held, non-delegable or unknown (and nothing for a valid request); table-tested, pure.
- [ ] Gates: `hooks/assignment.ts` imports nothing at runtime and is in the coverage include list of `vitest.config.ts` (`npm run test:coverage` reaches 95% on it), in the Stryker `mutate` list (`npm run test:mutation` stays above the `break` threshold), and under a dependency-cruiser purity rule (`npm run arch` passes).
- [ ] A marker naming a profile the parent does not hold denies the Agent call; the message names the profile and says the parent decides.
- [ ] A marker naming a non-delegable profile denies the Agent call; the message names it and says the user decides via `/gate-on` in the main session. An unknown name also denies the call and names it.
- [ ] A nested agent never holds more than its parent; a grandchild assigned a profile that its parent (itself a subset of the main session's set) does not hold is denied at the Agent call.
- [ ] No assignment record (unknown agent id, wiped state, a spawn without a marker): the subagent gets the baseline only, plus the main session's deny and ask lists.
- [ ] The advice to use only the assigned profiles is in the parent's own prompt; the mod does not change the prompt (test: the hook result for an accepted Agent call carries no modified prompt).
- [ ] After `/gate-off <p>` in the main session, `p` is gone from the assignments of children and grandchildren and its deny and ask lists no longer apply to them; `/gate-on <p>` again does not restore the delegated copy (its deny and ask lists apply again as an active main-session profile).
- [ ] `/clear`, and `session.start` with reason `startup`, `resume` or `clear`, clear all assignments.
- [ ] A denied subagent call carries the profile hint: a profile that is delegable and held by the parent, and whose allow rules match, is named (one the parent does not hold is not); a matching non-delegable profile gives "ask the user to run `/gate-on <name>`"; otherwise a generic message. The message says to stop and report. In a headless run the same hint is used for a subagent call (not Draft 04's list of all switched-off profiles); a main-session call keeps Draft 04's list.
- [ ] A subagent Bash call that no active allow rule matches is denied with the redirect (`source` `subagent-bash`).
- [ ] An unmatched non-Bash subagent call keeps Claude Code's verdict (documented limit).
- [ ] Fallbacks: with assumption 2 failed, every call is decided as main-session; with assumption 10 failed (including no linking value), subagents get the baseline only; with assumption 11 failed, the work stops and asks.
- [ ] README documents the assignment marker and the limit of enforcement (Bash-only deny; an unmatched non-Bash call keeps Claude Code's verdict).
- [ ] `npm run check` passes.

## How to start

Write the fallback note for assumptions 2, 10 and 11 in `docs/design.md` once Draft 01 has results. First failing test: a call with agent id `a1` and no assignment record is denied for `git commit`, while the same call by the user's main agent with `git-write` active is allowed.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

**Stop and ask** (used in this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked, and leave the work uncommitted.

## Depends on

Draft 01 (assumptions 2, 10, 11), Draft 02, Draft 03, Draft 04, Draft 05 (shares the gate files and the guard mechanism), Draft 09 (sets the delegable flags of the built-in profiles)

## References

- [Subagents](../design.md#subagents)
- [Decision order](../design.md#decision-order)
- [Unverified assumptions](../design.md#unverified-assumptions)
- [Security model](../design.md#security-model)
