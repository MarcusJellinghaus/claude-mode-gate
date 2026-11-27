# Step 2: `parseRule` and the per-file coverage gate

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_2.md`) only. Write `tests/config-rule.test.ts` first, as a table with one row per rule string, and watch it fail. Then write `hooks/config.ts` with `parseRule` and update the gate configs. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## Precondition

`hooks/policy.ts` must export the type `Rule` (`{ tool, kind: 'whole' | 'exact' | 'prefix', arg?, raw }`; issue #5). If it does not, write one line to `pr_info/.blocked.txt` and stop.

## WHERE

- `hooks/config.ts` (new)
- `tests/config-rule.test.ts` (new)
- `vitest.config.ts`: `coverage.include` becomes `["hooks/policy.ts", "hooks/config.ts"]`, and `thresholds` gains `perFile: true`. The 95% values stay.
- `stryker.config.json`: `mutate` becomes `["hooks/policy.ts", "hooks/config.ts"]`.

## WHAT

```ts
import type { Rule } from "./policy";
export type ParsedRule = { ok: true; rule: Rule } | { ok: false; message: string };
export function parseRule(raw: string): ParsedRule;
```

Three message constants, each used for one class of rule error:

- `ARG_ON_NON_BASH`: only Bash rules may take an argument; use the path guards (protected paths) for path-based protection.
- `STAR_POSITION`: only a trailing ` *` or `:*` is supported (a subset of Claude Code's rule syntax).
- `ARG_WHITESPACE`: no whitespace at the edges of the argument, and no empty argument; only a trailing ` *` or `:*` is supported.

Bad tool names and a missing `)` get a plain message that quotes the rule. No message names a draft number.

## ALGORITHM

```text
if raw has \s at start or end -> error
open = raw.indexOf("("); if none: tool = raw, check tool name -> { tool, kind: "whole", raw } (no arg key)
if !raw.endsWith(")") -> error; tool = raw.slice(0, open); arg = raw.slice(open + 1, -1); check tool name
if tool !== "Bash" -> ARG_ON_NON_BASH
if arg ends ":*": body = arg.slice(0,-2); body empty or \s at either edge -> ARG_WHITESPACE; prefix = body + " "
elif arg ends "*": body = arg.slice(0,-1); leading \s or whitespace-only body -> ARG_WHITESPACE;
     body !== "" and not ending " " -> STAR_POSITION; prefix = body
else exact: arg empty or \s at either edge -> ARG_WHITESPACE; text = arg
"*" anywhere in prefix or exact text -> STAR_POSITION (whitespace checks run first)
```

- Tool names:
  - `*`;
  - a plain name `^[A-Za-z0-9_-]+$` that does not start with `mcp__`;
  - or `^mcp__S(__T)?$`, where server `S` and tool `T` are runs of `[A-Za-z0-9-]` joined by single `_`.
- So `mcp__`, `mcp__s__` and `mcp__s___t` fail, while `mcp__mcp-workspace__read_file` parses.
- Edge whitespace always means the JavaScript `\s` class.

## DATA

- `*` gives `{ tool: "*", kind: "whole", raw: "*" }`, with no `arg` key.
- `Bash(*)` gives `{ tool: "Bash", kind: "prefix", arg: "", raw }`.
- `raw` is always the input string, `:*` spelling included.

## Test rows (all from issue #4)

Valid:

| Rule                                                                | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| `Edit`, `*`, `mcp__s`, `mcp__s__t`, `mcp__mcp-workspace__read_file` | whole                                      |
| `Bash(npm run check)`                                               | exact                                      |
| `Bash(npm run check:docs)`                                          | exact, `arg` `npm run check:docs`          |
| `Bash(git commit *)`                                                | prefix `git commit `                       |
| `Bash(git commit:*)`                                                | same `kind` and `arg` as above, `raw` kept |
| `Bash(git push:origin *)`                                           | prefix `git push:origin `                  |
| `Bash(echo (x) *)`                                                  | prefix `echo (x) `                         |
| `Bash(npm run test -- *)`                                           | prefix                                     |
| `Bash(*)`                                                           | prefix `""`                                |

Errors, each row also asserting the message class:

- tool names and syntax: `mcp__`, `mcp__s__`, `" Bash"`, `Bash(git push`;
- `ARG_ON_NON_BASH`: `Skill(x)`, `WebFetch(domain:*)`, `Edit(src/**)`, `Read(./.env)`, `Write(*)`, `mcp__s__t(x)`;
- `STAR_POSITION`: `Bash(git * push)`, `Bash(* push)`, `Bash(git **)`, `Bash(git push * --force)`, `Bash(git*)`, `Bash(npm run check*)`;
- `ARG_WHITESPACE`: `Bash( git push *)`, `Bash()`, `Bash(  )`, `Bash( *)`, `Bash(:*)`, `Bash(git push :*)`, `Bash(git status )`, and `Bash( git push *)` (a non-breaking space).

One more test asserts that no message contains "Draft".

## Done when

- `npm run check` passes, including `test:coverage`, so `hooks/config.ts` is at 95% or more on its own.
- `npm run arch` and `npm run deadcode` pass. knip sees `parseRule` through the test entry.

Commit message: `feat(config): parse rules in the supported subset`.
