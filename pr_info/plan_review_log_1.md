# review-plan review log 1

## Round 1 — 2026-11-27

**Findings**:

`pr_info/steps/step_10.md:63` — medium — The `logDir` line takes `user.logDir` even when the load fails. Issue #4 says `logDir` must be `logs` resolved against `cwd` when the config is missing or invalid. Use `user.logDir` only when `ok` is true, and add a failure row where the user file has a valid `logDir: "x"` but another error, expecting `/repo/logs`.
`pr_info/steps/step_4.md:28` — medium — Step 4 exports `TOP_LEVEL_KEYS`, `BASELINE_KEYS` and `PROFILE_KEYS`, but no test imports them until Step 5. `knip.json` does not set `ignoreExportsUsedInFile`, so `npm run deadcode` likely fails Step 4. Export them in Step 5, or import them in the Step 4 test.
`pr_info/steps/step_4.md:32` — medium — `isValidProfileName` is exported, but the Step 4 rows go through `validateConfig` and Step 9 calls it only inside the file. knip would report an unused export. Keep it internal or test it directly.
`pr_info/steps/step_7.md:21` — medium — `patternKey` is exported "also used in Step 12", but Step 12 uses it inside `config.ts` and no test imports it. knip would fail Step 7. Keep it internal.
`pr_info/steps/summary.md:102` — medium — "Exports are limited to what tests or later drafts use" contradicts knip: an export kept only for a later draft fails `npm run deadcode` now. Say "only what tests import", and check the exported types too (`Severity`, `Source`, `ParsedRule`, `LoadResult`).
`pr_info/steps/step_10.md:8` — medium — Step 10 is too large for one TDD commit: the fixtures, `readJson`, `buildResult`, baseline selection, the merge, eight fail-closed rows, `logDir`, BOM, start profiles, untrusted env, JSON round-trip, prototype safety, the `decide` baseline row and the default-deps test, all under the per-file 95% gate. Split it, for example into (a) success path, baseline selection and merge, and (b) the fail-closed result, start profiles and the untrusted env.
`pr_info/steps/step_8.md:53` — low — The algorithm joins `".config/mode-gate/config.json"` in one call, while line 57 says to join the three segments one at a time with the home's separator. Make line 53 match line 57, or the Windows row on line 73 fails.
`pr_info/steps/step_14.md:5` — low — Step 14 checks file size after the fact and may split test files then. That is a cleanup step after the work. `check_file_size` is not part of `npm run check`, and Step 14 rules out splitting `hooks/config.ts`. Each step should keep its own new files under the limit, and the plan should say what happens if `hooks/config.ts` itself goes over 600 lines (for example an allowlist entry).
`pr_info/steps/summary.md:112` — low — Ten `tests/config-*.test.ts` files go against the knowledge-base rule "one test file per module", and issue #4's "How to start" names `tests/config.test.ts`. The 600-line limit is a reasonable reason to split, but the plan should name the deviation and keep the first loadConfig rows where the issue puts them, or explain why it doesn't.

**Decisions**:

tasks

- pr_info/steps/step_10.md:63: take `user.logDir` only when the load is `ok`. On any failure, `logDir` must be `logs` resolved against `cwd`, as issue #4 requires. Add a failure row where the user file has a valid `logDir: "x"` plus another error, expecting `/repo/logs`.
- pr_info/steps/step_4.md:28: export `TOP_LEVEL_KEYS`, `BASELINE_KEYS` and `PROFILE_KEYS` in the step where a test first imports them (Step 5), or have the Step 4 test import them, so `npm run deadcode` (knip) passes at Step 4.
- pr_info/steps/step_4.md:32: keep `isValidProfileName` internal (not exported), since only `validateConfig` and Step 9 inside the same file use it. Alternatively, have a test import it directly.
- pr_info/steps/step_7.md:21: keep `patternKey` internal (not exported), because Step 12 uses it only inside `hooks/config.ts` and no test imports it.
- pr_info/steps/summary.md:102: change the export rule to 'export only what tests import at that step'. Check that the exported types `Severity`, `Source`, `ParsedRule` and `LoadResult` follow it at every step, so knip passes after each step.
- pr_info/steps/step_10.md: split Step 10 into two steps: (a) success path, baseline selection and merge; (b) fail-closed result, logDir, start profiles and untrusted env. Spread the other rows (BOM, JSON round-trip, prototype safety, `decide` baseline row, default-deps test) across them sensibly. Renumber the later steps and update their references and summary.md.
- pr_info/steps/step_8.md:53: change the algorithm to join `.config`, `mode-gate` and `config.json` one segment at a time with the home's separator, matching line 57, so the Windows row on line 73 holds.
- pr_info/steps/step_14.md:5: state that each step keeps its own new files under the 600-line limit, instead of a split after the fact. State what happens if `hooks/config.ts` goes over 600 lines (add a `.large-files-allowlist` entry).
- pr_info/steps/summary.md:112: name the deviation from the knowledge-base rule 'one test file per module' and justify it with the 600-line limit. Either keep the first loadConfig rows in `tests/config.test.ts` as issue #4's 'How to start' says, or explain why not.

**Changes**:

applied
applied
applied
applied
applied
applied
applied
applied
applied
applied

## Round 2 — 2026-11-27

**Findings**:

`pr_info/steps/step_8.md:52` — medium — The algorithm handles `MODE_GATE_CONFIG` whenever it is "set". Only `trustedEnv` drops empty strings (line 43), yet the rows at lines 72 and 75 call `resolveConfigPath` directly with an empty `MODE_GATE_CONFIG` and expect it to fall through to `XDG_CONFIG_HOME` or the no-home issue. Built as written, an empty value hits the "must be absolute" error instead. Either have `resolveConfigPath` treat `""` as unset too, or run those rows through `trustedEnv` first.
`pr_info/steps/step_11.md:43` — medium — No row covers a malformed user file (bad JSON). Issue #4 requires that "an unreadable or malformed user file is an error" that fails closed, with a file-level issue at path `''`. Step 11 has only "an unreadable file" and the vague "an invalid user file", and the only bad-JSON row is for the project file (Step 12). Add a user-file row with unparsable JSON: it should give `ok: false`, an empty baseline and an error with `source: 'user'` at path `''`.
`pr_info/steps/step_7.md:43` — low — The claim "a plain tool name never has `__` after it" is false under Step 2's grammar, where a plain name is `^[A-Za-z0-9_-]+$`. So `covers(Foo, Foo__bar)` returns true while `decide` would not deny `Foo__bar`. That breaks the issue's rule that the validator and `decide` cannot disagree. Apply the server-prefix branch only when `p.tool` starts with `mcp__`.

**Decisions**:

tasks

- pr_info/steps/step_8.md:52: make `resolveConfigPath` treat an empty `MODE_GATE_CONFIG` as unset, so the rows at lines 72 and 75 fall through to `XDG_CONFIG_HOME` or the no-home issue instead of the 'must be absolute' error. State this in the algorithm.
- pr_info/steps/step_11.md:43: add a user-file row with unparsable JSON. Expect `ok: false`, an empty baseline and an error with `source: 'user'` at path `''`, as issue #4 requires. Replace the vague 'an invalid user file' wording with concrete rows.
- pr_info/steps/step_7.md:43: apply the server-prefix (`__`) branch in `covers` only when `p.tool` starts with `mcp__`, so `covers(Foo, Foo__bar)` is false and matches `decide`. Remove the false claim and add a negative row for `Foo` vs `Foo__bar`.

**Changes**:

applied
applied
applied
applied

## Round 3 — 2026-11-27

**Findings**:

`pr_info/steps/step_7.md:28` — medium — `checkSetFindings` runs on the parsed lists, and Step 4's `checkRuleLists` drops entries that are not strings or do not parse. So in a file that already has an error, duplicate and covered-allow findings can name the wrong index (for example `allow: [123, "Bash(git push)"]` with `deny: ["Bash(git push *)"]` reports `allow[0]`, not `allow[1]`). Carry each rule's original index into `checkSetFindings`, as Step 13 already does for its layers.

**Decisions**:

dismiss

**Changes**:

dismiss
