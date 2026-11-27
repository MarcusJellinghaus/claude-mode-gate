# Step 10: `loadConfig`, success path, baseline selection and merge

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_10.md`) only.

1. Write `tests/config-fixtures.ts` (the shared fake deps).
2. Write `tests/config.test.ts`, starting with the two "How to start" rows of issue #4, then one row per case below, and watch them fail.
3. Implement `loadConfig` in `hooks/config.ts`. The fail-closed cases, the user `logDir`, the start profiles and the untrusted env come in Step 11. Project proposals (Step 12) and cross-layer findings (Step 13) are not part of this step either: `proposals` is `{}` for now.

Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-fixtures.ts` (new; a helper, not a `*.test.ts`)
- `tests/config.test.ts` (new; the file issue #4's "How to start" names)

## WHAT

```ts
import { baseline as defaultBaseline } from "./baseline";
import { builtinProfiles } from "./builtin-profiles";

interface RawRuleLists { allow?: string[]; ask?: string[]; deny?: string[] }
interface RawProfile extends RawRuleLists { description: string; delegable?: boolean }

export interface LoadDeps { // exported: tests/config-fixtures.ts imports it
  readFile: (path: string) => Promise<string | undefined>;
  env: ModeGateEnv; untrustedEnv: readonly EnvName[]; cwd: string;
  baseline?: RawRuleLists; builtins?: Record<string, RawProfile>;
}
type LoadResult = /* as in summary.md */; // internal: no test imports it
export async function loadConfig(deps: LoadDeps): Promise<LoadResult>;

async function readJson(readFile, path, source): Promise<{ value?: unknown; issues: Issue[] }>;
function buildResult(parts): LoadResult; // the one place that shapes both results
```

```ts
// tests/config-fixtures.ts
export function fakeDeps(
  files: Record<string, string | Error>,
  overrides?: Partial<LoadDeps>,
): LoadDeps;
// reader: string -> resolve, Error -> reject, absent -> undefined.
// Defaults: env { MODE_GATE_CONFIG: "/home/u/mode-gate.json" }, untrustedEnv [], cwd "/repo",
// baseline { allow: ["Edit"] }, builtins { "git-write": { description: "g", delegable: true, allow: [], ask: [], deny: [] } }.
```

## HOW

- `deps.baseline` and `deps.builtins` default to the shipped data through destructuring defaults. That type-checks the data files against `RawRuleLists` and `RawProfile` and keeps them reachable for knip.
- The default baseline is validated as `checkFile({ baseline: deps.baseline }, "baseline")`, and the built-ins as `checkFile({ profiles: deps.builtins }, "builtin")`.
- Profile lookups use `Object.hasOwn`.
- `buildResult` already shapes both results here, because the second "How to start" row needs `ok: false`. Step 11 tests every failure kind against it.
- In this step `logDir` is always `joinPath(cwd, "logs")` and `startProfiles` is always `[]`. Step 11 adds the user `logDir`, `parseStartProfiles` and `trustedEnv`.

## ALGORITHM

```text
defaults = checkFile(baseline), checkFile(builtins)
cp = resolveConfigPath(deps.env); if cp.issue: issues += cp.issue
if cp.path: read = readJson(cp.path, "user"); user = read.value === undefined ? none : checkFile(read.value, "user")
baseline = user file has a "baseline" key ? user.baseline : defaults.baseline; profiles = { ...builtins.profiles, ...user.profiles }
logDir = joinPath(cwd, "logs"); startProfiles = []
issues = all of the above; ok = no error
buildResult: ok -> { ok, config: { baseline, profiles, proposals: {} }, configPath?, logDir, startProfiles, warnings }
             !ok -> { ok, errors, baseline: { name: "baseline", allow: [], ask: [], deny: [] }, configPath?, logDir, startProfiles: [], warnings }
```

`readJson` rules:

- If `readFile` rejects, the result is an error at path `''` naming the file.
- `undefined` means the file is missing, and gives no issue.
- A leading U+FEFF is stripped before `JSON.parse`. A parse failure is an error at path `''`.
- `configPath` is omitted, not set to `undefined`, when it can't be resolved.

## DATA / test rows

- **How to start:**
  - The reader returns the `git-write` profile with `allow: ["Bash(git add *)"]`. `config.profiles["git-write"]` then has `delegable: true` and empty `ask` and `deny`.
  - With `"allow": "x"`, the result is `ok: false` with an error at `profiles.p.allow`.
- **Types:** a user profile and a built-in are both found under their name, with `Profile.name` equal to the key.
- **Success shape:**
  - `configPath` is `/home/u/mode-gate.json` and `logDir` is `/repo/logs`;
  - the baseline is `{ name: "baseline", allow, ask, deny }` with `raw` on every rule;
  - warnings alone (for example `Bassh`) still give `ok: true`.
- **Baseline selection:**
  - a missing user file gives the default baseline;
  - a user file without `baseline` gives the default;
  - a user `baseline` with one allow rule gives only that rule (replaced whole).
- **A user profile with a built-in's name** replaces it whole: the built-in's rules are gone.
- **BOM:** a file starting with U+FEFF parses.
- **JSON round-trip:** `JSON.parse(JSON.stringify(r))` is `toStrictEqual(r)` for a success result.
- **Baseline `ask` and `deny` reach `decide`:** a user `baseline` with `deny: ["Bash(git push *)"]`, passed as `sets: [config.baseline]`, makes `decide` deny `git push origin`.
- **Default deps:** one test omits `baseline` and `builtins`, so the shipped data is used. `config.baseline.allow` has 41 rules, and `profiles` has `git-write` and `issues`.

## Precondition

If the baseline row above fails because `decide` ignores the `ask` or `deny` lists of the baseline set, write one line to `pr_info/.blocked.txt` and stop, without committing.

## Done when

`npm run check` passes, with `hooks/config.ts` at 95% or more coverage on its own.

Commit message: `feat(config): load the user config, baseline and profiles`.
