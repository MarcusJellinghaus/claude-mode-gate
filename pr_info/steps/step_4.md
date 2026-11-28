# Step 4: Lay the engine types with the pinned Claude Code

One commit: `lay-types.mjs` uses `scripts/claude.mjs` and checks the laid version against the pin; CI drops the global install; the docs name the pin as the supported version.

## WHERE

- `scripts/lay-types.mjs`, `tests/lay-types.test.ts`
- `.github/workflows/ci.yml`, `mcp-coder.toml`
- `.claude/CLAUDE.md`, `docs/design.md`, `CHANGELOG.md`

## WHAT

```js
// scripts/lay-types.mjs (TYPES_FILE is already plugin/... from step 1)
/** @param {string | undefined} text the laid file @returns {string | undefined} X from "// Written by Claude Code X." */
export function laidVersionOf(text)
/** @param {{ devDependencies?: Record<string, string> }} pkg @returns {string | undefined} */
export function pinnedVersion(pkg)
/**
 * @param {{ laidVersion: () => string | undefined, run: () => number, pin: string, force?: boolean }} deps
 * @returns {{ ok: true, version: string } | { ok: false, message: string }}
 */
export function layTypes({ laidVersion, run, pin, force = false })
```

`claudeEnv(env)` stays as is.

## ALGORITHM

```text
laidVersionOf(text): first = text?.split(/\r?\n/, 1)[0]; match /^\/\/ Written by Claude Code (\S+?)\.?$/ → group 1, else undefined
layTypes:
  if (!force && laidVersion() === pin) return { ok: true, version: pin }
  run()                                         // exit code ignored: the run fails at the login check after laying
  laid = laidVersion(); if (laid === pin) return { ok: true, version: laid }
  return { ok: false, message: laid === undefined ? "<TYPES_FILE> is missing after the lay: run `npm ci`, then `npm run types:lay`."
                                                  : "types laid by Claude Code <laid>, but package.json pins <pin>: run `npm ci`." }
main: pin = pinnedVersion(package.json) or fail "package.json pins no @anthropic-ai/claude-code"; print "lay-types: ok (<version>)"
```

## HOW

- `main` wires: `laidVersion = () => existsSync(TYPES_FILE) ? laidVersionOf(readFileSync(TYPES_FILE, "utf8")) : undefined`; `run = () => runClaude(["-p", "ok", "--plugin-dir", "plugin", "--strict-mcp-config"], { env: claudeEnv(process.env), stdio: "ignore" })` imported from `./claude.mjs`. The bare `spawnSync("claude", ...)` goes.
- Update the file's header comment (the pinned Claude Code, laid from `plugin/`).
- `.github/workflows/ci.yml`: the "Lay the engine types" step runs only `npm run types:lay`; remove `npm install --global @anthropic-ai/claude-code@2.1.292`. Reword the `push-checks` comment: `npm ci` installs the pinned Claude Code that lays the types. Leave the Draft 10 TODO for step 5.
- `mcp-coder.toml`: the setup comment says `types:lay` uses the pinned Claude Code devDependency that `npm ci` installs (no longer "on the PATH").
- `.claude/CLAUDE.md` Commands, `typecheck` row: "needs Claude Code on the PATH" becomes "with the pinned Claude Code devDependency; run `npm ci` after a bump".
- `docs/design.md`:
  - "Manifest and engine types": replace "CI installs Claude Code 2.1.292 in the static job" with: `npm ci` installs the Claude Code version pinned in `package.json`, `scripts/lay-types.mjs` starts it through `scripts/claude.mjs` and fails with "run `npm ci`" when the laid version differs from the pin.
  - Replace "Minimum Claude Code version: 2.1.292, …" with: mode-gate supports exactly the Claude Code version pinned in `package.json`, which CI tests; Dependabot moves it up. Keep the sentence that the spike tested 2.1.292 (evidence).
  - Evidence lines (assumption rows, `docs/mods-api-notes.md`) keep their numbers.

## Tests first (`tests/lay-types.test.ts`)

Replace the `exists`-based cases:

- `laidVersionOf`: `"// Written by Claude Code 2.1.326.\n// ..."` → `"2.1.326"`; CRLF first line → same; `undefined` → `undefined`; another first line → `undefined`.
- `pinnedVersion`: reads `devDependencies["@anthropic-ai/claude-code"]`; missing → `undefined`.
- `layTypes`:
  - laid equals pin, not forced → `{ ok: true, version }`, `run` not called;
  - missing, then laid at the pin → ok, `run` called once;
  - laid at another version, then at the pin → ok;
  - forced while equal → `run` called once, ok;
  - forced, and still another version after the run → `ok: false`, message contains both versions and "run `npm ci`";
  - still missing after the run → `ok: false`, message contains "run `npm ci`".
- Keep the `claudeEnv` tests.

## DATA

- `layTypes` → `{ ok: true, version }` or `{ ok: false, message }`.

## Checks and commit

- Run `npm run types:lay` once (it forces a lay) and confirm it prints `lay-types: ok (2.1.326)`. The types laid in step 1 already match the pin, so `typecheck` alone would not start the pinned binary through `runClaude`.
- `npm run format`, then `npm run check`. `typecheck` prints `lay-types: ok (2.1.326)`.
- `CHANGELOG.md`: `npm run typecheck` and `types:lay` lay the types with the pinned Claude Code, print its version and fail with "run `npm ci`" when the laid types differ from the pin; CI no longer installs Claude Code globally; the supported version is the pin.
- `git_commit` with `paths`: `scripts/lay-types.mjs`, `tests/lay-types.test.ts`, `.github/workflows/ci.yml`, `mcp-coder.toml`, `.claude/CLAUDE.md`, `docs/design.md`, `CHANGELOG.md`.
- Message: `build(types): lay the engine types with the pinned Claude Code`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_4.md`. Implement step 4 only: rewrite the `tests/lay-types.test.ts` cases first and see them fail, then change `scripts/lay-types.mjs` to start the pinned Claude Code through `scripts/claude.mjs` and check the laid version against the pin; drop the global install from CI and update the docs listed. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`).
