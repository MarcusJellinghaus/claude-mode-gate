# Wiring and /gate-on, /gate-off, /gate-status

## Goal

Connect `decide()` to Claude Code in `hooks/register.ts` and add the commands that switch profiles. The wiring stays thin and fails closed.

## Scope

- `session.start`: read `MODE_GATE_PROFILES`, set starting profiles, register commands.
- `tool.check`: return the verdict from `decide`.
- `/gate-on`, `/gate-off` (including `all`) and `/gate-status`, registered `immediate`.
- Per-session state in `$.state`, never `$.store`.
- Profiles cleared on `/clear` and never restored on resume.
- A `.catch` on every gating hook that returns ask or deny.
- No tool that Claude could call to switch profiles.

## Acceptance criteria

- [ ] Wiring tests run through the plugin test kit (or `decide` only, if assumption 4 failed).
- [ ] A guard that throws produces a deny or ask, never allow.
- [ ] After `/clear` no profile is active.
- [ ] A resumed session starts with no profiles beyond `MODE_GATE_PROFILES`.
- [ ] `/gate-on` prints a short summary of what the profile allows.
- [ ] `/gate-on` with an unknown name changes nothing and says so.
- [ ] `npm run check:catch` passes.
- [ ] `npm run arch` passes: nothing imports `register.ts`.

## Depends on

Draft 01, Draft 02, Draft 03

## References

- [Commands](../design.md#commands)
- [Lifetimes](../design.md#lifetimes)
- [Events](../design.md#events)
- [Failure](../design.md#failure)
- [Code structure](../design.md#code-structure)
