# Step 8: path helpers, environment filter, config path

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_8.md`) only. Write `tests/config-paths.test.ts` first, as tables with Windows and POSIX fixtures and never `node:path`, then extend `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-paths.test.ts` (new)

## WHAT

```ts
// internal: the tests pass object and array literals, so no test imports these types
interface ModeGateEnv {
  MODE_GATE_PROFILES?: string | undefined;
  MODE_GATE_CONFIG?: string | undefined;
  XDG_CONFIG_HOME?: string | undefined;
  HOME?: string | undefined;
  USERPROFILE?: string | undefined;
}
type EnvName = keyof ModeGateEnv;
const ENV_NAMES: readonly EnvName[] = [
  "MODE_GATE_PROFILES",
  "MODE_GATE_CONFIG",
  "XDG_CONFIG_HOME",
  "HOME",
  "USERPROFILE",
];

export function isAbsolutePath(p: string): boolean; // /…, X:\…, X:/…, \\…
export function joinPath(base: string, child: string): string; // base's separator, no doubled separator, no ".." folding
export function trustedEnv(
  env: ModeGateEnv,
  untrusted: readonly EnvName[],
): { env: ModeGateEnv; warnings: Issue[] };
export function resolveConfigPath(env: ModeGateEnv): { path: string } | { issue: Issue };
```

## HOW

- `trustedEnv` copies only the five `ENV_NAMES` from `env`. It skips names in `untrusted` and empty strings, so any other key of the input object is never read.
- It adds one warning per untrusted name: `source: 'env'`, path `env.<NAME>`, with a message saying the repo's settings set it and it is ignored.
- `resolveConfigPath` works on the filtered env.

## ALGORITHM

```text
isAbsolutePath: /^\//, /^[A-Za-z]:[\\/]/, /^\\\\/ -> true; else false
joinPath: sep = base.includes("\\") ? "\\" : "/"; base ends "\\" or "/" ? base + child : base + sep + child
resolveConfigPath: MODE_GATE_CONFIG set -> absolute ? { path } : { issue: error, source env, path env.MODE_GATE_CONFIG, "must be absolute" }
  XDG_CONFIG_HOME set and absolute -> joinPath(joinPath(xdg, "mode-gate"), "config.json")
  home = first absolute of HOME, USERPROFILE -> joinPath(joinPath(joinPath(home, ".config"), "mode-gate"), "config.json")
  none -> { issue: error, source "user", path "", "no home folder: set HOME or USERPROFILE" }
```

The home case joins the three segments one at a time, `.config`, then `mode-gate`, then `config.json`, so that each gets the home's separator.

## DATA / test rows

- **`isAbsolutePath`:**
  - true for `/home/u`, `C:\x`, `c:/x`, `\\srv\share`;
  - false for `logs`, `./logs`, `..\x`, `C:logs`, `\logs`, `~/x`.
- **`joinPath`:**
  - `C:\` + `logs` gives `C:\logs`;
  - `C:\repo` + `logs` gives `C:\repo\logs`;
  - `/repo/` + `logs` gives `/repo/logs`;
  - `/repo` + `../x` gives `/repo/../x`.
- **`resolveConfigPath`:**
  - `MODE_GATE_CONFIG=/home/u/mg.json` gives that path;
  - an empty `MODE_GATE_CONFIG` falls through to `XDG_CONFIG_HOME`;
  - an empty or relative `XDG_CONFIG_HOME` falls through to the home folder;
  - an empty or relative `HOME` falls through to `USERPROFILE` (`C:\Users\u` gives `C:\Users\u\.config\mode-gate\config.json`);
  - a relative `HOME` and `USERPROFILE`, all values empty, or nothing set each give the no-home issue;
  - a relative `MODE_GATE_CONFIG` gives an error whose message names `MODE_GATE_CONFIG` and says "absolute".
- **`trustedEnv`:**
  - `untrusted` of `MODE_GATE_CONFIG`, of `HOME` and of `MODE_GATE_PROFILES` (one row each) drops that name and gives one warning naming it at `env.<NAME>`;
  - an env object with extra keys (`PATH`, `FOO`) gives a result with only the five names.

## Done when

`npm run check` passes.

Commit message: `feat(config): resolve the config path from the trusted environment`.
