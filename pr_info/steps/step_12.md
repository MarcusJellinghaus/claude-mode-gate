# Step 12: cross-layer duplicate findings

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_12.md`) only. Write `tests/config-layers.test.ts` first (using `fakeDeps`), then extend `loadConfig` in `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-layers.test.ts` (new)

## WHAT

```ts
interface Layer {
  set: RuleSet;
  source: Source;
  prefix: string;
}
function crossLayerFindings(layers: readonly Layer[]): Issue[];
```

## HOW

`loadConfig` builds the layers in order:

1. The baseline in effect: `source: 'user'` if it came from the user file, else `'baseline'`. Prefix `baseline`.
2. Each built-in whose name is not among the user profiles (`Object.hasOwn`): `source: 'builtin'`, prefix `profiles.<name>`.
3. Each user profile: `source: 'user'`, prefix `profiles.<name>`.

The replaced default baseline, the replaced built-ins and the proposals are not layers. Layers come from `checkFile` output, which holds only sets without errors, so the rule indexes match the original file paths. The returned warnings are added to the result's warnings.

## ALGORITHM

```text
first = new Map<string, { layer: number; path: string }>()
for each layer index n, list of ["allow", "ask", "deny"], rule at i:
  key = list + "|" + patternKey(rule); path = `${prefix}.${list}[${i}]`
  seen = first.get(key); if !seen -> first.set(key, { layer: n, path })
  else if seen.layer !== n -> warning { source: layer.source, path, message: `same pattern as ${seen.path}` }
```

Same-layer repeats are skipped here, because Step 7 already reports them. Only the same list type is compared, so a deny in one profile against an allow in another never gives a finding.

## DATA / test rows

- An injected built-in `git-write` with `allow: ["Bash(git add *)"]` and a user profile `p` with the same rule give exactly one warning: `source: 'user'`, path `profiles.p.allow[0]`, and a message containing `same pattern as profiles.git-write.allow[0]`.
- A user profile `git-write` that replaces the built-in and repeats its rule gives no duplicate warning.
- A proposal that repeats a user rule gives no warning.
- The same rule in the default baseline's allow and a built-in's allow gives a warning with `source: 'builtin'`, which names `baseline.allow[j]`.
- A user `baseline` that replaces the default: a user profile repeating a rule of the replaced default gives no warning, while one repeating a rule of the user `baseline` does.
- Negative rows, with no warning of any kind:
  - a restriction profile with `deny: ["mcp__mcp-workspace__save_file"]` against a baseline that allows it;
  - a user `deny: ["Bash(git push)"]` against another profile's `allow: ["Bash(git push)"]`.
- `ask`/`ask` and `deny`/`deny` duplicates across two profiles each give a warning.

## Done when

`npm run check` passes.

Commit message: `feat(config): report the same pattern across profiles`.
