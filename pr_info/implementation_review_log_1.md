# review-implementation review log 1

## Round 1 — 2026-11-28

**Findings**:

hooks/config.ts:383 — medium — A rule list error found at set level (the same pattern in two lists, for example `allow: ["Read"], deny: ["Read"]`) does not invalidate the lists: `checkRuleLists` still returns them after `checkSetFindings`. So a project proposal with this error ends up in `config.proposals`, but issue #4 says a proposal with any error-severity finding is left out. No test in `tests/config-proposals.test.ts` covers this case.
docs/design.md:53 — low — "Where profiles live" still says one built-in profile, `git-write`, ships with the mod. `hooks/builtin-profiles.ts` now ships both `git-write` and `issues`, and the Concepts update required by issue #4 leaves this line inaccurate.
docs/design.md:60 — low — The "Not set up" paragraph says that without a user file the mod gates nothing. The updated Concepts and Baseline sections, and the loader, say that a missing user file applies the shipped default baseline. The design now contradicts itself on what a missing user file means.

**Decisions**:

tasks

- In hooks/config.ts (around line 383, checkRuleLists), make an error-severity set-level finding from checkSetFindings, such as the same pattern in both allow and deny, invalidate the rule lists so that a project proposal with that error is left out of config.proposals, as issue #4 requires. First add a failing test to tests/config-proposals.test.ts with a project proposal whose allow and deny lists both contain "Read", and assert that the proposal is not in config.proposals and that the error finding is reported.
- In docs/design.md line 53 ("Where profiles live"), state that the mod ships two built-in profiles, `git-write` and `issues`, to match hooks/builtin-profiles.ts.
- In docs/design.md line 60 ("Not set up" paragraph), replace the statement that the mod gates nothing without a user file with what the loader and the updated Concepts and Baseline sections say: a missing user file applies the shipped default baseline.

**Changes**:

applied
applied
applied
applied
