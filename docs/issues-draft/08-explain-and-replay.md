# /gate-explain and offline replay

## Goal

Let the user see why a call would be allowed, asked or denied, before it happens and after the fact. Both reuse `decide()`.

## Scope

- `/gate-explain <tool> <input>`: dry run of one call. It shows the verdict and the rule chain, and does not run the call.
- A command-line replay tool. It reads a Claude Code session transcript (JSONL) and reports what each tool call would have been under a given config.
- Replay reads transcripts, not the decision log.
- Replay performs no I/O beyond reading the transcript and the config.

## Acceptance criteria

- [ ] `/gate-explain` output lists each rule that matched, in order, and the final verdict.
- [ ] `/gate-explain` on a Bash command with metacharacters says why a prefix rule did not match.
- [ ] Explain and the live hook give the same verdict for the same call (shared test).
- [ ] Replay accepts a transcript path and a config path.
- [ ] Replay output has one line per tool call with the verdict and rule.
- [ ] A malformed transcript line is reported and skipped, not fatal.
- [ ] Tests use small transcript fixtures, not real sessions.
- [ ] Replay is documented in the README with an example.

## Depends on

Draft 02, Draft 03, Draft 04

## References

- [Commands](../design.md#commands)
- [Decision log](../design.md#decision-log)
- [Later](../design.md#later)
