# Summary: show the total time on the success line of `npm run check` (#43)

## Goal

When every gate passes, `npm run check` (`scripts/check.mjs`) ends with `check: ok (11 gates)`. After this change the line also shows the total time: `check: ok (11 gates, 31.2s)`.

## Design decisions (from the issue)

1. The total is the sum of the raw `seconds` values that the injected `run` returns, formatted with `toFixed(1)` like the per-gate times. It can differ from the sum of the rounded per-gate times: three gates of 1.25 s each print `1.3s`, but the total prints `3.8s`.
2. There is no separate clock. `runGates` stays pure apart from its injected `run` and `print`, so the tests never touch the clock.
3. The failure output is unchanged.
4. `toFixed(1)` is also required by the ESLint rule `restrict-template-expressions`, which rejects a raw number in a template string.

## Architectural / design changes

None at the module level. The change stays inside `runGates`:

- A running sum (`let total = 0; total += seconds`) inside the existing loop. No new function, export, type or dependency.
- The `GateResult` shape, `runGate`, `GATES` and the failure branch stay the same.
- Nothing parses the summary line (`mcp-coder.toml` runs the gates as separate steps), so the new format breaks nothing.
- `.claude/CLAUDE.md` ("one line per gate") stays correct, and README.md does not describe the output, so neither changes.

## Files modified

| File                  | Change                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `scripts/check.mjs`   | `runGates` sums `seconds` and prints the total on the success line                |
| `tests/check.test.ts` | Helper accepts an optional per-gate `seconds`; success test updated; one new test |
| `CHANGELOG.md`        | One line under `## Unreleased`                                                    |

No files or folders are created besides these plan files.

## Steps

- [Step 1](step_1.md): test, implement and document the total (one commit).
