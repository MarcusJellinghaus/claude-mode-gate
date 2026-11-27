# Step 4: `validateConfig`, structure

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_4.md`) only. Write `tests/config-validate.test.ts` first, as a table with one row per valid or invalid config, then extend `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## Precondition

`hooks/policy.ts` must export the type `Profile` (`{ name, description, delegable, allow, ask, deny }`) and `RuleSet`. If it does not, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-validate.test.ts` (new)

## WHAT

```ts
export type Severity = "error" | "warning";
export type Source = "baseline" | "builtin" | "user" | "project" | "env";
export interface Issue {
  severity: Severity;
  source: Source;
  path: string;
  message: string;
}

export const TOP_LEVEL_KEYS = ["$schema", "logDir", "baseline", "profiles"] as const;
export const BASELINE_KEYS = ["allow", "ask", "deny"] as const;
export const PROFILE_KEYS = ["description", "delegable", "allow", "ask", "deny"] as const;

export function isValidProfileName(name: string): boolean; // /^[a-z][a-z0-9-]*$/ and not reserved
export function validateConfig(input: unknown, source: Source): Issue[]; // = checkFile(input, source).issues

// internal, used by loadConfig later:
interface CheckedFile {
  issues: Issue[];
  logDir?: string;
  baseline?: RuleSet;
  profiles: Record<string, Profile>;
}
function checkFile(input: unknown, source: Source): CheckedFile;
function checkRuleLists(
  raw: unknown,
  prefix: string,
  keys: readonly string[],
  issue: IssueSink,
): RuleSet | undefined;
```

- The issue's "`validateConfig(input, deps)`" reduces to the source, because one file's content needs nothing else. Its signature is decided test-first.
- `RESERVED_NAMES` is `all`, `baseline`, `constructor` and `prototype`.

## HOW

- `IssueSink` is a small closure, `(severity, path, message) => void`, bound to `source`, which pushes onto `issues`.
- `checkFile` checks the top-level keys and `logDir`, then the `baseline` through `checkRuleLists` with `BASELINE_KEYS` and the path prefix `baseline`.
- Each profile goes through `checkRuleLists` with `PROFILE_KEYS` and the path prefix `profiles.<name>`, plus the `description` and `delegable` checks.
- A profile or baseline is returned only when its own checks found no error. That keeps the rule indexes aligned with the issue paths in Step 12, and lets Step 11 use the result as the proposals directly.
- Profiles are read with `Object.keys(input.profiles)`. The name check runs before the insert: `profiles[name] = { name, description, delegable, allow, ask, deny }`.

## ALGORITHM

```text
input not a plain object (null, array, primitive) -> error at "" ; return { issues, profiles: {} }
for key of Object.keys(input) not in TOP_LEVEL_KEYS -> error at key "unknown key"
logDir present: not a non-empty string, or /^[A-Za-z]:(?![\\/])/, /^\\(?!\\)/, /^~/ -> error at "logDir"
baseline present -> checkRuleLists(input.baseline, "baseline", BASELINE_KEYS)
profiles present: must be a plain object; each name: !isValidProfileName -> error at profiles.<name>
  else description non-empty string, delegable boolean if present (default true), lists via checkRuleLists
```

`checkRuleLists`:

- The value must be a plain object, and unknown keys are errors.
- Each present list must be an array, else the error `<prefix>.<list>: expected an array of strings`.
- Each entry must be a string, else an error at `<prefix>.<list>[i]`.
- Each string goes through `parseRule`; a failure is an error at that index with the parse message.
- Absent lists default to `[]`.

## DATA / test rows

- **Valid (no issues):** `{}`, `{ "logDir": "x" }`, `{ "$schema": "…" }`, a profile with only a `description`, and the "How to start" profile with `allow: ["Bash(git add *)"]`. The parsed defaults (`delegable: true`, empty `ask` and `deny`) are asserted in Step 10, through `loadConfig`, so `checkFile` stays internal.
- **Errors naming the field:**
  - `profiles.p.allow` given `"x"`;
  - an object entry in `profiles.p.deny[0]`;
  - `profiles.p.deny[0]` given `Edit(src/**)`;
  - an unknown top-level key;
  - an unknown profile key `name`;
  - `description` or `delegable` inside `baseline`;
  - a missing `description` and an empty `description`;
  - `delegable: "yes"`;
  - `logDir` given `""`, `3`, `C:logs`, `\logs` or `~/logs`;
  - a top-level array, `null` and a string.
- **Rejected names, each error naming the profile:** `Git`, `1x`, `all`, `baseline`, `__proto__` (parsed from JSON text), `constructor`, `prototype`, `toString`.
- **Valid `logDir`:** `C:\logs`, `/var/log/x`, `\\srv\share`, `logs`.
- **Issues** carry `source` as given, `user` or `project`.
- After validating the `__proto__` input, `({} as Record<string, unknown>).polluted` is `undefined`. The fixture is `JSON.parse('{"profiles":{"__proto__":{"polluted":1}}}')`.

## Done when

`npm run check` passes.

Commit message: `feat(config): validate the config file structure`.
