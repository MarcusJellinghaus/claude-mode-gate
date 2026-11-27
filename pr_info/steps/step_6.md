# Step 6: per-rule findings (over-broad allow, unknown tool names)

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_6.md`) only. Write the rows in `tests/config-findings.test.ts` first, then extend `checkRuleLists` in `hooks/config.ts`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `hooks/config.ts` (extended)
- `tests/config-findings.test.ts` (new)

## WHAT

```ts
// Copied by hand from the keys of BuiltinToolInputs in .claude-plugin/types/claude-code-tools/index.d.ts,
// written by Claude Code 2.1.326. config.ts may not import engine types, so the list is a copy.
const KNOWN_TOOLS: readonly string[] = [/* every key, nothing else, no "Task" */];

function overBroadSeverity(rule: Rule): Severity | undefined; // allow lists only
function unknownToolMessage(tool: string): string | undefined; // undefined when known, "*" or mcp__…
function editDistance(a: string, b: string): number; // plain Levenshtein
```

## HOW

- Read `BuiltinToolInputs` with `read_file` or `search_files` on `.claude-plugin/types/claude-code-tools/index.d.ts`, and copy its top-level keys exactly.
- In `checkRuleLists`, after each entry parses:
  - in the `allow` list, an over-broad rule is reported at `<prefix>.allow[i]`: an error for `Bash`, `Bash(*)` and `*`, and a warning for a bare `mcp__<server>`;
  - in every list, an unknown tool name is a warning at that path.
- Warnings don't stop a profile from being returned; only errors do.

## ALGORITHM

```text
overBroad: tool "*" whole, or tool "Bash" whole, or Bash prefix arg "" -> "error"
           whole rule matching /^mcp__[^_]+(?:_[^_]+)*$/ (no "__tool" part) -> "warning"
unknown:   tool "*" or startsWith "mcp__" or in KNOWN_TOOLS -> undefined
           tool === "Task" -> "unknown tool `Task`; use `Agent`"
           best = known name with the smallest editDistance; if distance <= 2 -> "…; did you mean `best`?"
           else "unknown tool `<tool>`"
```

## DATA / test rows

Each row goes through `validateConfig`.

- Over-broad allows:
  - `allow: ["Bash"]`, `["Bash(*)"]` and `["*"]` are errors;
  - `allow: ["mcp__s"]` is a warning;
  - `deny: ["*"]` and `deny: ["Bash"]` give no over-broad finding.
- Unknown tool names:
  - `Bassh` gives a warning whose message contains "did you mean `Bash`";
  - `deny: ["Task"]` gives a warning whose message says to use `Agent`;
  - `mcp__unknown__tool` and `mcp__unknown` give no tool-name finding (apart from the bare server's over-broad warning when it is in `allow`);
  - `ask: ["Xyzzyplugh"]` gives a warning without a suggestion.
- The same checks in a user `baseline`: `baseline.allow: ["Bash(*)"]` gives an error at `baseline.allow[0]` with `source: 'user'`, and `baseline.allow: ["mcp__s"]` gives a warning.
- A config whose only findings are warnings has no error-severity issue.

## Done when

`npm run check` passes.

Commit message: `feat(config): flag over-broad allows and unknown tool names`.
