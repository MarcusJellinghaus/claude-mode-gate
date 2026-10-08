# Band, /gate-why and decision log

## Goal

Make the gate visible: the active profiles always show in the band, and every verdict is logged so `/gate-why` can explain it.

## Scope

- `ui.render`: draw the active profile names in the band and keep other mods' content.
- Decision log in a configurable folder (default `logs`).
- An entry holds the timestamp, verdict, rule, profile, agent and tool name. It holds no arguments.
- `/gate-why [n]` shows the last n verdicts from the log.
- The log folder is a protected path.

## Acceptance criteria

- [ ] The band lists the active profile names and updates after `/gate-on` and `/gate-off`.
- [ ] With no profile active, the band says so.
- [ ] Other mods' band content survives.
- [ ] Each verdict adds one log entry with exactly the listed fields.
- [ ] No log entry contains tool input, tested with a Bash command containing a fake secret.
- [ ] `/gate-why` defaults to a sensible n and honours an explicit n.
- [ ] A log write failure does not turn a deny into an allow.
- [ ] The log folder is denied for Edit and Write (shared test with Draft 05).
- [ ] Tests do not use the real clock or home folder.

## Depends on

Draft 04, Draft 05

## References

- [Decision log](../design.md#decision-log)
- [Commands](../design.md#commands)
- [Events](../design.md#events)
- [Lifetimes](../design.md#lifetimes)
