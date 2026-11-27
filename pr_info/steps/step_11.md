# Step 11: `loadConfig`, fail-closed result, `logDir`, start profiles, untrusted env

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_11.md`) only. Write `tests/config-fail.test.ts` first (using `fakeDeps` from `tests/config-fixtures.ts`), one row per case below, and watch them fail. Then extend `loadConfig` in `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-fail.test.ts` (new)

## WHAT

No new exports. `loadConfig` gains:

- `trustedEnv(deps.env, deps.untrustedEnv)` (Step 8) as its first call. Its env feeds `resolveConfigPath` and `parseStartProfiles`, and its warnings go into the result.
- The user `logDir`, used only when the load is `ok`.
- `parseStartProfiles` (Step 9) and the unknown-profile check.

## ALGORITHM

```text
{ env, warnings } = trustedEnv(deps.env, deps.untrustedEnv)
... Step 10 load, with env in place of deps.env ...
start = parseStartProfiles(env); issues += start.warnings
ok = no error
logDir = ok && user.logDir ? (isAbsolutePath(user.logDir) ? user.logDir : joinPath(cwd, user.logDir)) : joinPath(cwd, "logs")
if ok: startProfiles = start.names with Object.hasOwn(profiles, n); each other name -> warning
       { source "env", path "env.MODE_GATE_PROFILES", "unknown profile `<n>`" }
else:  startProfiles = [] (buildResult already does this)
```

`ok` is computed before `logDir` and the unknown-profile check, because both depend on it. The unknown-profile warnings never change `ok`.

## DATA / test rows

- **Fail-closed rows.** Each gives `ok: false`, an empty baseline and `startProfiles: []`, with a valid user `baseline` present where a file is read:
  - no home folder;
  - `untrustedEnv: ["HOME"]` with only `HOME` set;
  - a relative `MODE_GATE_CONFIG`, which also has no `configPath` key;
  - an unreadable file (the reader rejects);
  - a UNC `MODE_GATE_CONFIG` (`\\srv\share\mg.json`) whose read rejects;
  - a malformed user file (unparsable JSON, for example `{ "profiles": `), which gives an error with `source: 'user'` at path `''`;
  - a user file that parses but fails validation (`{ "profiles": { "p": { "description": "d", "allow": "x" } } }`), which gives an error at `profiles.p.allow`;
  - a built-in with `Edit(x)`, which gives an issue with `source: 'builtin'`;
  - an injected default baseline with `Bash(git*)`, which puts the parse error in `errors` with `source: 'baseline'`.
- **Failure result details:**
  - it carries `errors`, `warnings`, `configPath` and `logDir`, with `logDir` still `/repo/logs`;
  - `MODE_GATE_PROFILES=git-write` still gives `startProfiles: []`.
- **`logDir`:**
  - relative `x` gives `/repo/x`;
  - absolute `/var/log/mg` is kept;
  - with `cwd` `C:\repo` the default is `C:\repo\logs`;
  - a user file with a valid `logDir: "x"` plus another error (for example `allow: "x"`) gives `ok: false` and `logDir` `/repo/logs`.
- **Start profiles:**
  - `MODE_GATE_PROFILES="git-write,nope"` gives `["git-write"]` plus an unknown-profile warning at `env.MODE_GATE_PROFILES`;
  - with an invalid user file, `nope` gives no unknown-profile warning, while `Bad!` still gives its invalid-name warning.
- **Untrusted:** `untrustedEnv: ["MODE_GATE_PROFILES"]` gives one warning and no start profiles.
- **JSON round-trip:** `JSON.parse(JSON.stringify(r))` is `toStrictEqual(r)` for a failure result.
- **Prototype safety:** after loading a file with profiles `__proto__` (JSON text) and `constructor`, the result is `ok: false`, each error names its profile, and `({}).polluted` is `undefined`.

## Done when

`npm run check` passes, with `hooks/config.ts` at 95% or more coverage on its own.

Commit message: `feat(config): fail closed, resolve logDir and start profiles`.
