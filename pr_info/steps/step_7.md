# Step 7: per-set findings (duplicates, covered allows)

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_7.md`) only. Add the rows to `tests/config-findings.test.ts` first (a table for `covers` and rows through `validateConfig`), then extend `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## Precondition

`decide({ call, sets, guards, claude })` from `hooks/policy.ts` must accept a Bash call `{ toolName: "Bash", input: { command } }`, a single deny-only `RuleSet`, `guards: []` and `claude: { decision: "allow" }`, and return a `Decision` with a `verdict`. If its merged signature can't express this call, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-findings.test.ts` (extended)

## WHAT

```ts
import { decide } from "./policy";

export function patternKey(rule: Rule): string; // `${tool}|${kind}|${arg ?? ""}`; also used in Step 12
export function covers(p: Rule, q: Rule): boolean; // exported for the table test
function checkSetFindings(set: RuleSet, prefix: string, issue: IssueSink): void;
```

## HOW

`checkRuleLists` calls `checkSetFindings` once all three lists of a profile or the baseline are parsed. For the baseline the prefix is `baseline`; for a profile it is `profiles.<name>`.

## ALGORITHM

```text
covers(p, q): p.kind === "whole" -> p.tool === "*" || p.tool === q.tool || q.tool.startsWith(p.tool + "__")
              q.tool !== "Bash" || q.kind === "whole" -> false
              else decide({ call: { toolName: "Bash", input: { command: q.arg } },
                            sets: [{ name: "covers", allow: [], ask: [], deny: [p] }], guards: [],
                            claude: { decision: "allow" } }).verdict === "deny"
checkSetFindings: first = map patternKey -> { list, i }; for each list, each rule i:
  seen in the same list -> warning "duplicate of <list>[j]"; seen in another list -> error, and mark the allow key
  for each allow rule not marked: some ask/deny rule with a different key covers it -> warning "covered by <list>[j]"
```

`p.tool + "__"` in `covers` only matters when P is a bare server, `mcp__s`. A plain tool name never has `__` after it.

## DATA / test rows

`covers` table, with P as a deny rule:

| P                  | Q                              | covers |
| ------------------ | ------------------------------ | ------ |
| `Bash(git push *)` | `Bash(git push origin)`        | true   |
| `Bash(git push *)` | `Bash(git push)` (exact)       | true   |
| `Bash(git push)`   | `Bash(git push origin)`        | true   |
| `Bash(git push)`   | `Bash(git pu)`                 | false  |
| `*`                | `Edit`, `Bash(x)`, `mcp__s__t` | true   |
| `Bash`             | `Bash(git status)`             | true   |
| `Edit`             | `Write`                        | false  |
| `mcp__s`           | `mcp__s__t`                    | true   |
| `mcp__s`           | `mcp__other__t`                | false  |
| `Bash(git push *)` | `Edit`                         | false  |

Rows through `validateConfig`:

- The same pattern twice in `allow` is a warning.
- `allow: ["Bash(git push:*)"]` with `deny: ["Bash(git push *)"]` is one error and no covered-allow warning.
- `allow: ["Bash(git push)"]` with `deny: ["Bash(git push *)"]` is a covered-allow warning at `profiles.p.allow[0]`.
- The same rows in a user `baseline`: a duplicate across `baseline.allow` and `baseline.deny` is an error, and a covered allow is a warning.
- A deny in one profile against an allow in another profile of the same file gives no finding from this step. Cross-set findings come in Step 12 and compare only the same list type.

## Done when

`npm run check` passes.

Commit message: `feat(config): flag duplicate patterns and covered allows`.
