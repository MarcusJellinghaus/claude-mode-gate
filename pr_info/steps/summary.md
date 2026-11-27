# Summary: eslint-plugin-security enforced, ignore-scripts kept (#29)

## Goal

Finish issue #29. The prep commit `9b91d7b` on this branch already installed `eslint-plugin-security` 4.2.1, loads its recommended preset in `eslint.config.js` (every rule `warn`), and set `ignore-scripts=true` in `.npmrc`. This PR fixes the preset's findings, makes any lint warning fail `npm run lint`, and documents it. save-exact and a pre-commit hook are rejected (see the issue); nothing is added for them.

## Architectural / design changes

- **No runtime change.** `hooks/policy.ts` and `hooks/register.ts` are untouched. The change is to tooling only.
- **Lint gate is stricter.** `npm run lint` becomes `eslint . --max-warnings 0`. With the security preset at `warn`, any warning, and any unused `eslint-disable` directive (ESLint 10 reports those as warnings), now fails lint, `npm run check` and CI's lint job. No new CI job; the 16 required checks stay the same.
- **Pinned by a test.** `tests/check.test.ts` pins the exact `lint` script value, as it already pins `check`.
- **Two regexes rewritten for `security/detect-unsafe-regex`** (no nested quantifiers), with identical behaviour, pinned by new edge-case tests:
  - `ONE_TEST_FILE` in `scripts/agent-bash-guard.mjs` (the Bash agents' own `PreToolUse` guard).
  - `USES` in `scripts/check-action-pins.mjs`.
- **Suppression policy.** The other security findings (`detect-non-literal-fs-filename`, `detect-object-injection`) are silenced only inline, one `// eslint-disable-next-line security/<rule> -- <why it is safe>` per hit. No file, folder or repo-wide rule overrides in `eslint.config.js`.
- **Unchanged on purpose:** `docs/design.md`, `package-lock.json`, `.npmrc`, `eslint.config.js`, `README.md`, CI workflows. No `pre*`, `post*` or `prepare` scripts (`ignore-scripts` would skip them).

## Files modified

| File                                                                                                                                         | Step | Change                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `tests/agent-bash-guard.test.ts`                                                                                                             | 1    | Edge-case rows for one test file                                       |
| `scripts/agent-bash-guard.mjs`                                                                                                               | 1    | `ONE_TEST_FILE` without nested quantifiers                             |
| `tests/check-action-pins.test.ts`                                                                                                            | 2    | Two edge-case tests for `uses:`                                        |
| `scripts/check-action-pins.mjs`                                                                                                              | 2    | `USES` without nested quantifiers; maybe one suppression in step 3     |
| `scripts/check-arch-modules.mjs`, `scripts/check-docs.mjs`, `scripts/check-manifests.mjs`                                                    | 3    | Inline suppressions                                                    |
| `tests/repo-structure.test.ts`, `tests/check.test.ts`, `tests/check-docs.test.ts`, `tests/check-manifests.test.ts`, `tests/tsconfig.test.ts` | 3    | Inline suppressions (the real list is whatever `npm run lint` reports) |
| `tests/check.test.ts`                                                                                                                        | 4    | Pin `lint` script value                                                |
| `package.json`                                                                                                                               | 4    | `"lint": "eslint . --max-warnings 0"`                                  |
| `.claude/CLAUDE.md`                                                                                                                          | 4    | Testing strategy item 8, `npm run lint` row                            |
| `CHANGELOG.md`                                                                                                                               | 4    | Entry under `## Unreleased`                                            |

No files or folders are created by the implementation.

## Steps

1. `ONE_TEST_FILE`: pin edge cases, then rewrite the regex.
2. `USES`: pin edge cases, then rewrite the regex.
3. Suppress the remaining security findings inline; `npm run lint` shows 0 warnings.
4. Enforce `--max-warnings 0` (test first) and update the docs.

Each step is one commit and leaves `npm run check` green. Before each commit: `npm run format`, then `npm run check`.

## Shared rules for every step

- **Precondition:** `npm run lint` must load `eslint-plugin-security`. If it fails with a "Cannot find package 'eslint-plugin-security'" error, write one line to `pr_info/.blocked.txt` and stop (`npm ci` is needed; do not run `npm install`, do not touch `package-lock.json`).
- Do not create `.scratch/` files: ESLint lints them. Check a regex by editing it in place and running `npm run lint` plus the test file.
- If an edit to `scripts/agent-bash-guard.mjs` makes `npm run test -- tests/<name>.test.ts` denied, run plain `npm run test`.
- Do not edit `docs/design.md`, `package-lock.json`, `eslint.config.js` or `pr_info/TASK_TRACKER.md`.
- Commit messages: conventional format, no attribution footer.
