# Step 4: Fail lint on warnings, and document it

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_4.md`). First add the test that pins the `lint` script to `eslint . --max-warnings 0` and confirm it fails. Then change the script so it passes, and update `.claude/CLAUDE.md` and `CHANGELOG.md`. Run `npm run format`, then `npm run check`, then commit as one commit.

## WHERE

- `tests/check.test.ts`, `describe("GATES")`, the existing test
- `package.json`, `scripts.lint`
- `.claude/CLAUDE.md`: Commands table row `npm run lint` (line 94) and Testing strategy item 8 (line 126)
- `CHANGELOG.md`, top of `## Unreleased`

## WHAT

Test, one line next to the existing `check` pin:

```ts
expect(scripts["lint"]).toBe("eslint . --max-warnings 0");
```

Script:

```json
"lint": "eslint . --max-warnings 0",
```

## HOW

Docs (keep the wording short):

- `.claude/CLAUDE.md`, `npm run lint` row: append to the existing text so it reads "ESLint, type-aware `strictTypeChecked` rules and eslint-plugin-security's recommended rules; any warning fails". Keep the table aligned (`npm run format` does it).
- `.claude/CLAUDE.md`, item 8: prepend that `npm run lint` runs eslint-plugin-security's recommended rules, where any warning fails and each suppression is inline and names the rule and a reason; keep the existing `npm audit`, gitleaks and SECURITY.md text.
- `CHANGELOG.md`, new first bullet under `## Unreleased`: eslint-plugin-security's recommended rules run in `npm run lint`, which now fails on any warning (`--max-warnings 0`); findings are fixed or suppressed inline with a reason. `.npmrc` sets `ignore-scripts=true`, so dependency install scripts do not run.
- Do not edit `docs/design.md` or `README.md`. If one seems to need a change, write one line to `pr_info/.blocked.txt` and stop.

## ALGORITHM

```text
add the lint pin to the GATES test
npm run test -- tests/check.test.ts   -> fails (lint is "eslint .")
set package.json lint to "eslint . --max-warnings 0"
npm run test -- tests/check.test.ts   -> passes
update CLAUDE.md and CHANGELOG.md
```

## DATA

None.

## Checks

1. The new assertion fails before the script change and passes after it.
2. `npm run lint` passes with `--max-warnings 0`. If it fails on a warning, step 3 missed a hit: if the warning has a safe, nameable reason, add the inline suppression here; otherwise write one line to `pr_info/.blocked.txt` and stop.
3. `npm run docs:lint` passes.
4. `npm run format`, `npm run check`, commit.

Commit message: `chore(lint): fail lint on warnings and document eslint-plugin-security`
