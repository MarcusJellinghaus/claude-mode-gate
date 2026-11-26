# Step 1: show the total time on the success line

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_1.md`) with TDD. First update `tests/check.test.ts` and confirm with `npm run test -- tests/check.test.ts` that the changed and the new test fail. Then change `runGates` in `scripts/check.mjs` so they pass, and add the CHANGELOG line. Do not change the failure output or any other file. Finish with `npm run format`, then `npm run check`. Make one commit with only the three files below.

## WHERE

- `tests/check.test.ts`: the `check` helper and the `runGates` describe block
- `scripts/check.mjs`: `runGates`
- `CHANGELOG.md`: `## Unreleased`

## WHAT

The signature does not change:

```js
/** @returns {number} the exit code: 0, or the failing gate's */
export function runGates(gates, run, print)
```

Test helper type:

```ts
type Outcome = { status: number | null; output?: string; seconds?: number };
```

## HOW

### 1. Tests first (`tests/check.test.ts`)

- Add `seconds?: number` to `Outcome`. In the `run` stub, destructure `seconds = 1.25` alongside `status` and `output = ""`, and return `{ status, output, seconds }`. Every existing test keeps its 1.25 s per gate.
- In "prints one line per gate and a summary when all pass", change the last expected line from `"check: ok (3 gates)"` to `"check: ok (3 gates, 3.8s)"`.
- Add a test after it:

  ```ts
  it("sums the gates' raw times on the summary line", () => {
    const { printed } = check({ a: { status: 0, seconds: 0.5 } }, ["a", "b"]);
    expect(printed.at(-1)).toBe("check: ok (2 gates, 1.8s)");
  });
  ```

- Leave the failure tests unchanged.
- Run `npm run test -- tests/check.test.ts`: the two success tests fail and the rest pass.

### 2. Implementation (`scripts/check.mjs`)

Change only `runGates`: keep a running sum in the existing loop and print it on the success line. Leave the failure branch, `lastLines`, `runGate` and `GATES` unchanged. Keep the header comment ("one line per gate" still holds).

### 3. CHANGELOG (`CHANGELOG.md`)

Add as the first bullet under `## Unreleased`:

```md
- `npm run check` shows the total time on its success line: `check: ok (11 gates, 31.2s)`, the sum of the per-gate times.
```

## ALGORITHM

```text
total = 0
for each gate:
    { status, output, seconds } = run(gate)
    total += seconds
    (existing ok / FAIL handling, unchanged)
print `check: ok (${String(gates.length)} gates, ${total.toFixed(1)}s)`
return 0
```

## DATA

- `run(gate)` still returns `GateResult = { status, output, seconds }`.
- `runGates` still returns `0` on success and the failing gate's exit code (or `1`) on failure.
- Success summary line: `check: ok (<n> gates, <total>s)`, where `<total>` is the sum of the raw `seconds`, formatted with `toFixed(1)`.
- Expected values: 3 × 1.25 = 3.75 → `3.8s`; 0.5 + 1.25 = 1.75 → `1.8s`. Both sums are exact in binary floating point, and `toFixed` rounds an exact half up (the existing tests already expect `1.25` → `1.3`).

## Checks and commit

1. `npm run format`
2. `npm run check`: all gates pass.
3. `git_commit` with `paths: ["scripts/check.mjs", "tests/check.test.ts", "CHANGELOG.md"]`, message `feat: show the total time on the success line of npm run check`.

If the changed tests do not fail before the implementation, or still fail after it, write one line to `pr_info/.blocked.txt` and stop.
