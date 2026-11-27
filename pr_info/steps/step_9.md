# Step 9: `parseStartProfiles`

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_9.md`) only. Write `tests/config-start-profiles.test.ts` first, then extend `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-start-profiles.test.ts` (new)

## WHAT

```ts
export function parseStartProfiles(env: ModeGateEnv): { names: string[]; warnings: Issue[] };
```

## HOW

- It takes the env already filtered by `trustedEnv` (Step 8), so a repo-set value arrives as unset.
- It uses `isValidProfileName` from Step 4, the same check as for the config file.

## ALGORITHM

```text
value = env.MODE_GATE_PROFILES; if undefined -> { names: [], warnings: [] }
entries = value.split(",").map(trim).filter(non-empty)
for each entry not yet seen: valid name -> push to names; else warning
  { severity "warning", source "env", path "env.MODE_GATE_PROFILES", message "invalid profile name `<entry>`" }
```

## DATA / test rows

- `"issues, git-write"` gives `["issues", "git-write"]`.
- `"issues,,issues, "` gives `["issues"]`.
- Unset gives `[]`.
- `constructor`, `all`, `baseline`, `prototype`, `Git` and `__proto__` each give one invalid-name warning at `env.MODE_GATE_PROFILES` and no name, with no crash.
- `"issues,ALL"` gives `["issues"]` and one warning.

## Done when

`npm run check` passes.

Commit message: `feat(config): parse starting profiles from MODE_GATE_PROFILES`.
