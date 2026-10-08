# Spike: verify the Claude Code API

## Goal

Check the 15 unverified assumptions against a real Claude Code, so the build rests on facts. Generate the real type declarations and record what changes in the design.

## Scope

- Check the Claude Code version.
- Load a minimal probe mod and read the generated declarations.
- Test at runtime:
  - agent id on `tool.call` and `tool.check` (2)
  - subagent launch and its parameters (10)
  - hooks under `bypassPermissions` agents (11) and under `claude -p` (12)
  - skill start and end (15)
  - a slot below the entry box (13)
  - command argument completion (14)
  - tool input visible in `tool.check` (1)
  - permission mode readable (6)
- Check the remaining assumptions (3, 4, 5, 7, 8, 9) from the declarations and docs.
- Read the sec-default source for fail-closed patterns.

## Acceptance criteria

- [ ] The assumptions table in `docs/design.md` marks each of the 15 as verified or failed.
- [ ] Every failed assumption has a design change or a documented fallback.
- [ ] `types/index.d.ts` is committed from the generated declarations.
- [ ] The minimum Claude Code version is recorded.
- [ ] Fail-closed patterns from sec-default are summarised in the design.
- [ ] The probe mod is not committed, or lives outside production code.

## Depends on

none

## References

- [Unverified assumptions](../design.md#unverified-assumptions)
- [Work plan](../design.md#work-plan)
- [Prior art](../design.md#prior-art)
- [Open items](../design.md#open-items)
