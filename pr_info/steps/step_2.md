# Step 2: `USES` without nested quantifiers

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_2.md`). First add the two edge-case tests and confirm they pass against today's regex. Then rewrite `USES` so `security/detect-unsafe-regex` no longer flags it, with identical behaviour. Run `npm run format`, then `npm run check`, then commit as one commit.

## WHERE

- `tests/check-action-pins.test.ts`, `describe("findUnpinned")`
- `scripts/check-action-pins.mjs`, constant `USES` (line 7)

## WHAT

No new functions. `findUnpinned(workflowText: string): string[]` keeps its signature and behaviour. Only the constant changes:

```js
// today, flagged (`+` inside `?`)
const USES = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/gm;
// new
const USES = /^\s*(?:-\s)?\s*uses:\s*["']?([^\s"'#]+)/gm;
```

It stays one regex literal over the whole text with the `gm` flags. Do not split it per line: `\s*` after `uses:` crosses newlines.

## HOW

Tests first (characterisation, so they pass before and after the rewrite):

```ts
it("reports a ref on the line after uses:", () => {
  expect(findUnpinned("- uses:\n  a/b@v1")).toEqual(["a/b@v1"]);
});

it("does not match uses: glued to the dash", () => {
  expect(findUnpinned("-uses: a/b@v1")).toEqual([]);
});
```

## ALGORITHM

```text
line start (m flag), any whitespace
optionally "-" plus one whitespace character, then any whitespace   == "-" plus one or more whitespace, as today
"uses:", any whitespace (crosses newlines), optional quote
capture the ref: characters other than whitespace, quotes and "#"
no quantifier inside the optional group, so star height stays 1
```

## DATA

`findUnpinned` returns the unpinned refs in order, as today.

## Checks

1. `npm run test -- tests/check-action-pins.test.ts` with the new tests, before the rewrite: all pass. If one fails, the test is wrong about today's behaviour; fix the test, not the regex.
2. After the rewrite: the same test file passes, `npm run check:pins` passes, and `npm run lint` no longer shows `detect-unsafe-regex` for `scripts/check-action-pins.mjs`.
3. If no single regex literal passes both, write one line to `pr_info/.blocked.txt` and stop.
4. `npm run format`, `npm run check`, commit.

Commit message: `refactor(pins): make USES pass detect-unsafe-regex`
