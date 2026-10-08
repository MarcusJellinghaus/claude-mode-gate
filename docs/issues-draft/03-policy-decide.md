# Policy: pure decide() function

## Goal

Implement `decide()` in `hooks/policy.ts`: the whole decision logic, pure and fully tested. It is the security boundary, so it gets the strictest tests.

## Scope

- Decision order: first match wins.
- Tool-name matching with whole-tool rules.
- Bash prefix rules that match only when the command has none of `& ; | $ ( ) \` < >` or a newline.
- Deny beats ask beats allow across the active set.
- A deny from Claude Code is never overridden. An unmatched call keeps Claude Code's verdict.
- Unknown input falls back to ask or deny, never allow.
- No imports, `$`, state or I/O.

## Acceptance criteria

- [ ] Table-driven tests are written before the code.
- [ ] Every rule in the decision order, and the order itself, has a row.
- [ ] Bash rows cover `&&`, `;`, `|`, `$()`, backticks, newlines and odd spacing.
- [ ] Each security rule has a negative test, for example `gh issue edit 1 && rm -rf .` is not allowed by a prefix rule.
- [ ] A Claude Code deny stays a deny in every row.
- [ ] `npm run test:coverage` reaches 95% on `policy.ts`.
- [ ] `npm run test:mutation` passes a score threshold set in the Stryker config.
- [ ] `npm run arch` passes: `policy.ts` imports nothing.

## Depends on

Draft 01 (input shapes, assumptions 1 and 7). It can start in parallel with Draft 02 against a minimal rule type.

## References

- [Decision order](../design.md#decision-order)
- [Matching](../design.md#matching)
- [Baseline](../design.md#baseline)
- [Testing](../design.md#testing)
