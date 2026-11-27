# Step 1: dependency-cruiser rules for the config modules

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_1.md`) only. It changes the configuration of an architecture gate and has no unit test: `npm run arch` is the check. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `.dependency-cruiser.cjs` (modified)

## WHAT

1. Set `tsPreCompilationDeps: true` in `options`, so that dependency-cruiser sees type-only imports.
2. Add three rules to `forbidden`:

```js
{
  name: "data-files-import-only-policy",
  comment: "baseline.ts and builtin-profiles.ts hold data: they may import only types from policy.ts.",
  severity: "error",
  from: { path: "^hooks/(baseline|builtin-profiles)\\.ts$" },
  to: { pathNot: "^hooks/policy\\.ts$" },
},
{
  name: "data-files-no-runtime-imports",
  severity: "error",
  from: { path: "^hooks/(baseline|builtin-profiles)\\.ts$" },
  to: { dependencyTypesNot: ["type-only"] },
},
{
  name: "config-imports-only-its-modules",
  comment: "config.ts may import only policy.ts, baseline.ts and builtin-profiles.ts.",
  severity: "error",
  from: { path: "^hooks/config\\.ts$" },
  to: { pathNot: "^hooks/(baseline|builtin-profiles|policy)\\.ts$" },
},
```

## HOW

- The rules match files that don't exist yet (Steps 2 and 3 create them), so they pass vacuously now and bind as soon as the files appear.
- The existing rules stay unchanged.

## ALGORITHM

None.

## DATA

None.

## Precondition

Run `npm run arch` with only `tsPreCompilationDeps: true` added, before adding the new rules. If an existing rule now fails, write one line naming the failing rule to `pr_info/.blocked.txt` and stop, without committing.

## Done when

`npm run check` passes.

Commit message: `build(arch): add dependency rules for the config modules`.
