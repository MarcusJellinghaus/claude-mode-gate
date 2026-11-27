# Step 1: `ONE_TEST_FILE` without nested quantifiers

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_1.md`). First add the edge-case test rows and confirm they pass against today's regex. Then rewrite `ONE_TEST_FILE` so `security/detect-unsafe-regex` no longer flags it, with identical behaviour. Run `npm run format`, then `npm run check`, then commit as one commit.

## WHERE

- `tests/agent-bash-guard.test.ts`, `describe("one test file")`
- `scripts/agent-bash-guard.mjs`, constant `ONE_TEST_FILE` (line 9)

## WHAT

No new functions. `denyReason(input, allowedScripts): string | undefined` keeps its signature and behaviour. Only the constant changes:

```js
// today, flagged (`+` inside `*`)
const ONE_TEST_FILE = /^npm run test -- tests\/(?:[\w-]+\/)*[\w.-]+\.test\.ts$/;
// new
const ONE_TEST_FILE = /^npm run test -- tests\/(?:[\w-]|(?<=[\w-])\/)*[\w.-]+\.test\.ts$/;
```

Keep the comment above it ("Directory names without dots, so no `..`; nothing a shell would expand."). It still holds.

## HOW

Tests first (characterisation: they pin today's behaviour, so they pass before and after the rewrite):

- Add to the existing "lets %j through when test is allowed" `it.each` list:
  - `"npm run test -- tests/a/b/x.test.ts"` (more than one directory level)
  - `"npm run test -- tests/a.b.test.ts"` (dots in the file stem)
  - `"npm run test -- tests/..test.ts"` (a stem of only a dot)
- Add to the existing "denies %s" `it.each` table in the same `describe`:
  - `["a dotted directory", "npm run test -- tests/a.b/x.test.ts"]`
  - `["an empty segment", "npm run test -- tests//x.test.ts"]`
  - `["an empty file stem", "npm run test -- tests/.test.ts"]`

## ALGORITHM

```text
after "tests/": a run of [\w-] characters and "/" characters
  where a "/" is allowed only right after a [\w-] character   -> no leading "/", no "//", no dot in directories
then the file name [\w.-]+ followed by ".test.ts" at the end
a trailing directory run without "/" merges into the file name, which [\w.-]+ already allows
lookbehind holds no quantifier, so star height stays 1
```

## DATA

`denyReason` returns `undefined` (let through) or the deny reason string, as today.

## Checks

1. `npm run test -- tests/agent-bash-guard.test.ts` with the new rows, before the rewrite: all pass. If a new row fails, the row is wrong about today's behaviour; fix the row, not the regex.
2. After the rewrite: the same test file passes, and `npm run lint` no longer shows `detect-unsafe-regex` for `scripts/agent-bash-guard.mjs`.
3. If no regex passes both, replace the regex with a non-regex check of the path that passes the same tests. If that fails too, write one line to `pr_info/.blocked.txt` and stop.
4. `npm run format`, `npm run check` (other security warnings are still allowed here), commit.

Commit message: `refactor(guard): make ONE_TEST_FILE pass detect-unsafe-regex`
