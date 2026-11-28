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

## Round 2 — 2026-11-28

**Findings**:

tests/config-rule.test.ts:68 — medium — The acceptance row for JavaScript `\s` edge whitespace is missing: no test checks that `Bash(git push *)` with a non-breaking space (U+00A0) at the start of the argument is a rule error. The code handles it through `LEADING_SPACE` at `hooks/config.ts:52`, but nothing protects that behaviour.
tests/config-fail.test.ts:40 — medium — The "invalid user file" fail-closed row uses `INVALID_USER`, which has no `baseline`. Issue #4 asks for a user file that has a valid `baseline` and is invalid elsewhere, and requires the result's `baseline` to be empty rather than the user's. No test covers that case.
hooks/config.ts:693 — low — The failed result always sets `logDir` to `logs` under `cwd`. Issue #4 asks for `logDir` "as in the success result", so when the user file is valid (for example an absolute `logDir`) but a built-in or the default baseline has an error, the user's resolved `logDir` is dropped and the log lands in the repo.
hooks/config.ts:23 — low — `isMcpSegment` rejects MCP tool names that have `__` or an `_` at the start or end of the tool segment, such as `mcp__s__t__u`. Issue #4 says tool and server names use letters, digits, `_` and `-`, so a deny rule for such a real tool becomes a config error. The grammar here is stricter than the issue specifies.

**Decisions**:

tasks

- Add an acceptance row to tests/config-rule.test.ts (near line 68) asserting that `Bash(git push *)` with a non-breaking space (U+00A0) at the start of the argument is reported as a rule error, so the LEADING_SPACE handling at hooks/config.ts:52 is covered.
- Add a fail-closed row to tests/config-fail.test.ts (near line 40) with a user file that has a valid `baseline` but is invalid elsewhere, and assert that the failed result's `baseline` is empty, not the user's baseline. Write the test first and fix hooks/config.ts if it fails.
- In hooks/config.ts (around line 693), when the user file itself is valid but a built-in profile or the default baseline has an error, set the failed result's `logDir` to the user's resolved `logDir`, as in the success result, instead of always using `logs` under `cwd`. Write a failing test first, for example a valid user file with an absolute `logDir` plus a broken built-in or default baseline.
- In hooks/config.ts (isMcpSegment, around line 23), relax the MCP name check so that tool segments made of letters, digits, `_` and `-` are accepted, including `__` inside the tool segment and `_` at its start or end (for example `mcp__s__t__u`), as issue #4 specifies. Write a failing test in the rule tests first.

**Changes**:

applied
applied
applied
applied
applied
