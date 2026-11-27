# Step 12: project proposals from `.mode-gate.json`

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_12.md`) only. Write `tests/config-proposals.test.ts` first (using `fakeDeps` from `tests/config-fixtures.ts`), then extend `loadConfig` in `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-proposals.test.ts` (new)

## WHAT

```ts
async function loadProposals(
  readFile,
  cwd: string,
): Promise<{ proposals: Record<string, Profile>; warnings: Issue[] }>;
const toWarning = (i: Issue): Issue => ({ ...i, severity: "warning" });
```

## HOW

- `loadConfig` calls `loadProposals(deps.readFile, deps.cwd)`, puts `proposals` into `config.proposals` and adds `warnings` to the result's warnings.
- Proposals never reach `profiles`, `startProfiles` or the cross-layer pass.
- The issues already carry `source: 'project'` from `checkFile` and `readJson`.

## ALGORITHM

```text
path = joinPath(cwd, ".mode-gate.json"); read = readJson(readFile, path, "project")
if read.value is undefined -> { proposals: {}, warnings: read.issues.map(toWarning) }
if read.value is a plain object: for key "logDir", "baseline" present -> warning at key "ignored in a project file"; copy without them
checked = checkFile(copy, "project")      // returns only profiles with no error (Step 4)
return { proposals: checked.profiles, warnings: [...ignored, ...read.issues, ...checked.issues].map(toWarning) }
```

## DATA / test rows

- A missing project file gives no issue and `proposals: {}`.
- An unreadable project file (the reader rejects) and a malformed one (bad JSON) each give a warning, and the result stays `ok: true`.
- An invalid project file (an unknown key, a bad rule) gives only warnings. The user config stays valid (`ok: true`), and its profiles are unchanged.
- A valid proposal `p` is in `config.proposals.p` with `name: "p"`, and is not in `config.profiles`.
- A `logDir` in the project file gives a warning, and the resolved `logDir` stays `/repo/logs`.
- A `baseline` in the project file gives a warning, and the resolved baseline is unchanged.
- A proposal named `constructor` and a proposal with `Bash(git*)` are absent from `proposals`, and their findings appear as warnings with `source: 'project'`.
- `MODE_GATE_PROFILES=p`, where `p` exists only as a proposal, gives the unknown-profile warning and is not in `startProfiles`.

## Done when

`npm run check` passes.

Commit message: `feat(config): read project profiles as proposals only`.
