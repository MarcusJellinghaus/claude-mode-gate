# Step 3: Suppress the remaining security findings inline

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_3.md`). Run `npm run format`, then `npm run lint`. For each remaining `security/detect-non-literal-fs-filename` and `security/detect-object-injection` warning, add one inline `eslint-disable-next-line` comment that names the rule and says why the hit is safe. `npm run lint` must end with 0 warnings. Run `npm run format`, then `npm run check`, then commit as one commit.

## WHERE

The files `npm run lint` reports. Expected (from reading the code, not a run):

| File:line                                             | Rule                             | Why it is safe                                                                      |
| ----------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/check-action-pins.mjs:23` (maybe also `:21`) | `detect-non-literal-fs-filename` | a file name listed from the fixed `.github/workflows` directory                     |
| `scripts/check-arch-modules.mjs:30`                   | `detect-non-literal-fs-filename` | walks the fixed `ROOTS` directories                                                 |
| `scripts/check-docs.mjs:34`                           | `detect-non-literal-fs-filename` | paths come from the fixed list of required docs                                     |
| `scripts/check-manifests.mjs:106`                     | `detect-non-literal-fs-filename` | called only with the fixed manifest paths                                           |
| `scripts/check-manifests.mjs:121`                     | `detect-non-literal-fs-filename` | the module entry from the repo's own `hooks/hooks.json`, checked for existence only |
| `scripts/check-manifests.mjs:18`                      | `detect-object-injection`        | the key comes from the fixed list `["name", "version", "description"]`              |
| `tests/repo-structure.test.ts:4`                      | `detect-non-literal-fs-filename` | test helper, called only with literal repo paths                                    |
| `tests/check.test.ts:16`                              | `detect-object-injection`        | the gate name comes from the test's own gate list                                   |
| `tests/check-docs.test.ts:19`                         | `detect-object-injection`        | lookup in a test fixture                                                            |
| `tests/check-manifests.test.ts:19`                    | `detect-object-injection`        | the key comes from the test table                                                   |
| `tests/tsconfig.test.ts:24`                           | `detect-object-injection`        | the flag comes from the test table                                                  |

The `npm run lint` output is the source of truth. A line missing from it gets no comment; a hit missing from the table gets one.

## WHAT

No code changes, only comments of this form, on the line directly above the flagged line:

```js
// eslint-disable-next-line security/detect-object-injection -- key comes from the fixed list above
```

## HOW

- Always name the rule. Never a bare `eslint-disable-next-line`.
- Inline only: no `/* eslint-disable */` blocks and no overrides in `eslint.config.js`.
- Write the reason as a short sentence fragment about where the value comes from.
- Run `npm run format` before placing comments. Prettier can move a flagged expression to another line. If the flagged expression is inside a multi-line expression, put the comment right above the line ESLint reports.

## ALGORITHM

```text
npm run format
npm run lint -> list of (file, line, rule)
for each hit: insert "// eslint-disable-next-line security/<rule> -- <why>" above the reported line
npm run format; npm run lint
repeat until 0 warnings (an unused or misplaced directive also shows as a warning: move or remove it)
```

## DATA

None.

## Checks

1. `npm run lint` shows 0 errors and 0 warnings.
2. If a hit can be neither fixed simply nor justified (its value can come from outside the repo), write one line to `pr_info/.blocked.txt` and stop.
3. `npm run format`, `npm run check`, commit.

Commit message: `chore(lint): justify the remaining eslint-plugin-security findings`
