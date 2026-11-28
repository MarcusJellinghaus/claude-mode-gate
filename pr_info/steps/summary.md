# Summary: pure `decide()` function (issue #5, Draft 03)

`decide()` in `hooks/policy.ts` is the mod's security boundary. It takes one tool call, the active rule sets, the guard results and Claude Code's own verdict, and returns a `Decision`. It is pure: no imports, no `$`, no state, no I/O. Nothing calls it yet. Draft 12 wires it to `tool.call` and `tool.check`, Draft 05 supplies guard results, Draft 06 supplies subagent sets, and Draft 08 reads the `chain`.

The issue text (#5) is the specification. These steps are a simplified route to it; when in doubt, the issue wins.

## Architectural and design changes

- **`hooks/policy.ts` grows from a single type to the policy module.** It owns and exports the types `Verdict` (existing), `Source`, `Rule`, `Profile`, `RuleSet`, `Call`, `GuardResult`, `ClaudeVerdict`, `ChainEntry`, `Decision`, `DecideInput`, the constant `BASH_METACHARACTERS` and the function `decide`. Drafts 02, 05, 06, 07, 08 and 12 import from it. It stays import-free (dependency-cruiser `policy-is-pure`, `tests/repo-structure.test.ts`).
- **One linear decision path.** `decide` reads straight down, first return wins:
  1. Claude Code `deny` → passed through unchanged (`claude-code`).
  2. Subagent Bash call that no allow rule holds → `deny`, `subagent-bash`.
  3. Deny walk: deny guard results, then deny rules → `deny`.
  4. Malformed input or an unknown Claude Code `decision` → `ask`, `malformed`.
  5. Ask walk: ask guard results, then ask rules → `ask`.
  6. Allow walk: allow rules → `allow` (skipped for a metacharacter or a protected Claude Code ask).
  7. Step 4 of the issue: Bash + Claude Code `allow` → `ask`, `bash-downgrade`; otherwise Claude Code's verdict passed through.
- **Special cases fall out of the general rules instead of having their own code:**
  - Guards are the first entries of their class walk, so "guards before rules" is list order, and the issue's step 2 is only the chain label of a deny guard (step 2; everything else in the walks is step 3).
  - "Only whole-tool denies beat malformed input" needs no code: exact and prefix rules never match without a string `command`, and a call without a usable tool name only matches `*`.
  - An unknown `decision` uses the same check as malformed input; it sits after the deny walk, so every deny still wins.
  - A protected Claude Code ask (one carrying `setting`, `hook` or `plugin`) is only a skip reason in the allow walk; the final pass-through then returns Claude Code's ask by itself.
  - Strict allow matches are computed once and serve both the subagent check ("held") and the allow walk.
- **Two Bash matching modes, string operations only.** Allow rules are strict (equality or `startsWith(arg)`, never when the command contains a `BASH_METACHARACTERS` entry). Deny and ask rules use a boundary-checked substring test on the trimmed rule text (boundary = start/end, JavaScript `\s`, or a metacharacter); an empty rule text matches every string command. No regular expression is ever built from rule text.
- **Whole-tool matching, one rule per side.** `*` matches everything; otherwise equality; otherwise, for an `mcp__…` rule, `name.startsWith(rule.tool + "__")`. On the allow side that prefix applies only to a bare server rule (no further `__` after `mcp__`).
- **The chain is recorded by the walks that decide.** `decide` creates `chain` as `[]` only when `withChain` is set (otherwise `undefined`), every recording is `chain?.push(entry)`, and the result gets a `chain` key only when it was created. This follows the issue's "built only when `withChain` is set" literally with a single branch, and the verdict code is identical with and without it.

## Types (exported from `hooks/policy.ts`)

```ts
export type Verdict = "allow" | "ask" | "deny"; // existing
export type Source =
  "rule" | "guard" | "subagent-bash" | "bash-downgrade" | "malformed" | "claude-code";
export type Rule =
  | { tool: string; kind: "whole"; raw: string }
  | { tool: "Bash"; kind: "exact" | "prefix"; arg: string; raw: string };
export interface RuleSet {
  name: string;
  allow: Rule[];
  ask: Rule[];
  deny: Rule[];
}
export interface Profile extends RuleSet {
  description: string;
  delegable: boolean;
}
export interface Call {
  toolName?: unknown;
  input: unknown;
  agentId?: string;
  toolCallId?: string;
}
export interface GuardResult {
  kind: "deny" | "ask";
  message: string;
}
export interface ClaudeVerdict {
  decision?: unknown;
  reason?: string;
  rule?: string;
  setting?: string;
  hook?: string;
  plugin?: string;
}
export interface ChainEntry {
  step: 1 | 2 | 3;
  cls: Verdict;
  text: string;
  profile?: string;
  skipped?: string;
}
export interface Decision {
  verdict: Verdict;
  source: Source;
  rule?: string;
  profile?: string;
  message?: string;
  chain?: ChainEntry[];
}
export interface DecideInput {
  call: Call;
  sets: RuleSet[];
  guards: GuardResult[];
  claude: ClaudeVerdict;
  withChain?: boolean;
}
export const BASH_METACHARACTERS: readonly string[] = [
  "&",
  ";",
  "|",
  "$",
  "(",
  ")",
  "`",
  "<",
  ">",
  "\n",
];
export function decide(input: DecideInput): Decision;
```

`ChainEntry.text` is the rule's `raw` or the guard's `message`; `profile` is set for rule entries only; `skipped` is one of two fixed strings: `"command contains a Bash metacharacter"` and `"Claude Code ask from a setting, hook or plugin"`. Optional fields that do not apply are absent keys, never `undefined` (`exactOptionalPropertyTypes`); build them with `...(x === undefined ? {} : { key: x })`.

## Implementation constraints (all steps)

- `eslint-plugin-security` (`detect-object-injection`) flags `obj[variable]`: iterate with `for…of`, pick rule lists with a selector function (`(s: RuleSet) => s.deny`), never `set[cls]`; scan strings with `indexOf`, `includes`, `startsWith` and `charAt`.
- Comments in `hooks/policy.ts` must not contain `$.state`, `$.store`, `$.ui`, `$.on`, or a line starting with `import`.
- Tests import extensionless: `import { decide, … } from "../hooks/policy";` (type imports with `import type`).
- Write NBSP, CR and tab in tests as escapes (`\u00A0`, `\r`, `\t`).
- Every gate runs through `npm run <script>`: `npm run format`, then `npm run check`, then `git_commit` with `paths`. `npm run test:mutation` is not run by the implementer.

## Test layout

One file, `tests/policy.test.ts`:

- One-line builders: `whole(tool)`, `exact(arg, raw?)`, `prefix(arg, raw?)` (`raw` defaults to `Bash(${arg})` and `Bash(${arg}*)`, so `prefix("git push ")` is `Bash(git push *)` and `prefix("")` is `Bash(*)`), `set(name, lists)` (missing lists are `[]`), `input(…)` for a `DecideInput`.
- Decision tables of `{ name, input, expected }`, compared with `toStrictEqual` (absent keys are checked). Each step adds its table to one combined `ROWS` array.
- Invariance tests over all of `ROWS`: `source` is in the closed list of six; without `withChain` there is no `chain` key; with `withChain: true` the decision minus `chain` equals `expected`.
- A chain table of `{ name, input, chain }` checked with `withChain: true`.
- If the file passes 750 lines, move the tables and builders into `tests/fixtures/policy/*.ts` (data and builders only, no `it`/`expect`) and keep the `it.each` blocks in `tests/policy.test.ts`.

## Files created or modified

| Path                         | Change                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `hooks/policy.ts`            | Modified: types, `BASH_METACHARACTERS`, `decide` and its small private helpers |
| `tests/policy.test.ts`       | Created: table-driven tests through `decide`                                   |
| `tests/fixtures/policy/*.ts` | Created only if the test file passes 750 lines                                 |
| `CHANGELOG.md`               | Modified: one Unreleased entry, extended per step                              |
| `.claude/CLAUDE.md`          | Modified (step 6): Testing strategy fixes                                      |
| `docs/design.md`             | Modified (step 6): Decision order, Matching, Testing fixes                     |

Not touched: `hooks/register.ts` (wiring is Draft 12), `README.md` (no user-visible behaviour yet), `docs/architecture/architecture.md`, all config files.

## Steps

1. Types, `BASH_METACHARACTERS` and `decide` core: Claude Code pass-through, whole-tool matching, deny > ask > allow, reporting order, unknown `decision`, unusable tool name, chain recording.
2. Guard results: deny guards (step 2) and ask guards (step 3) in the walks.
3. Protected Claude Code asks: the allow walk skips under an ask carrying `setting`, `hook` or `plugin`.
4. Bash matching: strict allow, boundary-checked deny and ask, `bash-downgrade`, metacharacter skips in the chain.
5. Subagent Bash (step 1) and Bash calls without a string `command` (malformed).
6. Boy Scout docs: `.claude/CLAUDE.md` and `docs/design.md`.

## Out of scope

Rule parsing (`parseRule`, Draft 02), guards and `redirectHint` (Draft 05), agent assignment (Draft 06), logging (Draft 07), explain text (Draft 08), wiring, the "not configured" pass-through and the organisation `ceiling` (Draft 12), argument matching, globs, and the mutation run (owner dispatches the CI `mutation-tests` job).
