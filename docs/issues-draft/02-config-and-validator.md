# Config schema, loader and validator

## Goal

Define the data for the baseline and profiles, load it, and validate it with `/gate-check`. This is pure logic, tested with tables first.

## Scope

- Schema: a profile has a name, a description, `allow`, `ask` and `deny` lists in Claude Code rule syntax, and a non-delegable flag.
- Loader for the user-level config.
- Starting profiles from `MODE_GATE_PROFILES`, read once. A repo cannot set it.
- Validator behind `/gate-check`: conflicts, unknown tools, over-broad rules such as `Bash(*)`.
- Decide where profiles live. A project may only propose profiles, which the user then approves (open item).

## Acceptance criteria

- [ ] Table tests exist before the code, one row per valid and invalid config.
- [ ] A malformed config is rejected with a message naming the field.
- [ ] `Bash(*)` and similar over-broad rules are reported.
- [ ] An unknown tool name is reported.
- [ ] A rule in both `allow` and `deny` of the same profile is reported as a conflict.
- [ ] Unknown names in `MODE_GATE_PROFILES` are reported, and none is activated.
- [ ] A project file cannot activate or approve a profile.
- [ ] The decision on where profiles live is written into `docs/design.md`.

## Depends on

Draft 01

## References

- [Concepts](../design.md#concepts)
- [Headless runs](../design.md#headless-runs)
- [Commands](../design.md#commands)
- [Open items](../design.md#open-items)
