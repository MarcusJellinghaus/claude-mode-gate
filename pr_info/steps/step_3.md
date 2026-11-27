# Step 3: the shipped data files

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_3.md`) only. Write `tests/config-data.test.ts` first, then the two data files. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## Precondition

`hooks/policy.ts` must export `decide` and the types `RuleSet` and `Call` (issue #5). If it does not, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `hooks/baseline.ts` (new)
- `hooks/builtin-profiles.ts` (new)
- `tests/config-data.test.ts` (new)

## WHAT

```ts
// hooks/baseline.ts — the default baseline, used when the user file has no `baseline`.
export const baseline = { allow: [/* 41 rule strings */] };

// hooks/builtin-profiles.ts — keyed by profile name; the key is the name (no `name` field).
export const builtinProfiles = {
  "git-write": { description: "…", delegable: true, allow: [], ask: [], deny: [] },
  issues: { description: "…", delegable: true, allow: [], ask: [], deny: [] },
};
```

- Plain literals with no annotations, no imports and no `as const`.
- `hooks/config.ts` checks the literals against its raw types in Step 10, where it uses them as `deps` defaults.
- `baseline.ts` has no `name`, `description`, `delegable`, `ask` or `deny` key.
- The placeholder descriptions are short and non-empty. Draft 09 fills in the profiles later.

The 41 allow rules, in this order:

1. 14 read tools, each `mcp__mcp-workspace__<tool>`: `read_file`, `list_directory`, `search_files`, `read_reference_file`, `list_reference_directory`, `search_reference_files`, `get_reference_projects`, `git`, `github_issue_list`, `github_pr_view`, `github_search`, `check_branch_status`, `check_file_size`, `get_base_branch`. Not `github_issue_view`.
2. 6 write tools, each `mcp__mcp-workspace__<tool>`: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`.
3. 4 other tools: `Skill`, `Agent`, `WebFetch`, `WebSearch`.
4. 16 exact rules `Bash(npm run <name>)` for `check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:manifests`, `check:catch`, `check:pins`, `check:docs`, `audit`.
5. 1 prefix rule: `Bash(npm run test -- *)`.

## HOW

- The test imports both files directly, which keeps them reachable for knip until Step 10 imports them in `config.ts`.
- The test parses the strings with `parseRule` and calls `decide` with a set built from the parsed baseline.

## ALGORITHM

Test helper:

```text
rules = baseline.allow.map(parseRule) -> assert every ok, keep .rule
set = { name: "baseline", allow: rules, ask: [], deny: [] }
allowed(cmd) = decide({ call: { toolName: "Bash", input: { command: cmd } }, sets: [set], guards: [],
                         claude: { decision: "allow" } }).verdict === "allow"
```

## DATA / test rows

- `baseline.allow` has length 41, equals the list above, contains no `github_issue_view`, and has only the `allow` key.
- Every baseline and built-in rule string parses.
- The built-ins are exactly `git-write` and `issues`. Each value has the keys `description`, `delegable`, `allow`, `ask` and `deny`, no `name`, and three empty lists.
- Matching:
  - `allowed("npm run test -- tests/x.test.ts")` is true;
  - `allowed("npm install")` is false;
  - `npm run check:manifests`, `npm run check:catch`, `npm run check:pins` and `npm run check:docs` are each allowed;
  - `npm run check:other` and `npm run check:docs -x` are not.

## Done when

`npm run check` passes, with `arch` showing the data-file rules hold.

Commit message: `feat(config): ship the default baseline and built-in profile placeholders`.
