# Config schema, loader and validator

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules. A profile has a description and three lists, `allow`, `ask` and `deny`, in Claude Code rule syntax. The user switches profiles with `/gate-on <profile>...` and `/gate-off <profile>...|all`. `/gate-check` validates the config, and `/gate-status`, `/gate-why` and `/gate-explain` inspect it. **Subagents** get the baseline plus profiles their parent assigns. **Headless runs** (`claude -p`) take starting profiles from `MODE_GATE_PROFILES`.

This is Draft 02 of 11 (plan: Draft 00). It defines and validates the data that Draft 03 (`decide`) consumes and Draft 04 (wiring) loads.

## Decisions

**Terms.**

- **Profile name:** lowercase letters, digits and hyphens, starting with a letter. `all` and `baseline` are reserved (`/gate-off all`; the baseline is not a profile).
- **Rule grammar and tool names.** Take the rule grammar and the Claude Code built-in tool names from the Claude Code documentation, and use Draft 01's findings if they exist. Note any difference between the two in the PR. The grammar has these forms:
  - whole tool: a plain tool name (`Bash`, `Edit`), `mcp__server__tool`, `*` (every tool), or a bare `mcp__server` (every tool of that server);
  - exact (Bash only): `Bash(npm run check)`;
  - prefix (Bash only): `Bash(git commit *)` or `Bash(npm run check:*)`. The `*` must be the last character, after a space or a colon. The prefix is the text before the `*`, so `git commit ` (with the trailing space) and `npm run check:`. `Bash(*)` is the prefix rule with an empty prefix.
- **Unsupported forms are rule errors.** In v1 only Bash rules may carry an argument. Any other tool with an argument (`Edit(src/**)`, `Read(./.env)`) and any `*` that is not the final character of a Bash argument (`Bash(git * push)`) is a rule error. `decide` (Draft 03) cannot match these in v1, and a deny that silently never fires would be insecure. The error message says so and points to Draft 05 (path guards) for path-based protection.
- **Parsed rules.** `*` parses to `{ tool: '*', kind: 'whole' }` and `Bash(*)` to `{ tool: 'Bash', kind: 'prefix', arg: '' }`. A rule has a `tool`, a `kind` (`whole`, `exact` or `prefix`), an `arg` (except for `whole`) and `raw: string`, the original rule string, set by `parseRule` (required). Draft 03's `decide()` reports the rule that fired, and Drafts 07 (log, `/gate-why`) and 08 (`/gate-explain`) name it by `raw`. Further fields are up to the implementation.
- **Profile** (in `hooks/policy.ts`): `{ name, description, delegable, allow, ask, deny }` with parsed rules in the three lists.
- **Covers.** A prefix rule P covers a rule Q when they have the same tool and Q's text starts with P's prefix. An exact rule covers only an identical exact rule. A whole-tool rule covers every rule of that tool, and `mcp__server` covers every tool of that server.
- **Over-broad rule:** in `allow`, exactly `Bash`, `Bash(*)` or `*` (error), or a bare `mcp__<server>` (warning).
- **Active set:** the baseline plus the switched-on profiles.
- **Precedence:** deny beats ask beats allow, so a broader ask or deny resolves an overlapping allow.

**Validator output.** An `Issue` is `{ severity: 'error' | 'warning', path: string, message: string }`, where `path` names the field (for example `profiles.git-write.allow[2]`). Severities:

| Finding                                                                                                                       | Severity |
| ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| The same pattern in two lists of one profile                                                                                  | error    |
| The same pattern in two different profiles (the baseline and the built-ins count as profiles here)                            | warning  |
| An allow covered by a broader ask or deny pattern (for example `allow Bash(git push origin)` against `deny Bash(git push *)`) | warning  |
| An allow covered by a baseline deny rule                                                                                      | error    |
| `Bash`, `Bash(*)` or `*` in an allow list                                                                                     | error    |
| A bare `mcp__<server>` in an allow list                                                                                       | warning  |
| An unknown non-MCP tool name                                                                                                  | warning  |
| A bad or reserved profile name, a wrong type, a missing or empty `description`, an unknown key, an unparsable rule            | error    |
| `logDir` that is not a non-empty string                                                                                       | error    |
| An unsupported rule form: an argument on a non-Bash tool, or a `*` that is not the last character of a Bash argument          | error    |

The warnings are warnings because precedence already resolves them. The baseline-deny case is an error so that no profile can even try to re-allow what the baseline denies. Every issue found in a project `.mode-gate.json` is downgraded to a warning (see Project profiles).

**Unknown tool names.** An unknown non-MCP name is a warning, not an error. Keep the built-in names in one constant so the list can be replaced. Names matching `mcp__<server>__<tool>` or `mcp__<server>` are never errors, even for a server the validator cannot see.

**Format and location.**

- JSON, with a shipped JSON Schema `mode-gate.schema.json` in the repo root, for editor validation. Users reference it with a `$schema` key.
- User config path: `MODE_GATE_CONFIG` if set (for tests and headless runs); else `$XDG_CONFIG_HOME/mode-gate/config.json`; else `<home>/.config/mode-gate/config.json` on all platforms, Windows included. `<home>` comes from the injected environment: `HOME`, else `USERPROFILE`. If none is set, that is an error (fail closed).
- Shape: `{ "logDir": "logs", "profiles": { "<name>": { "description": "...", "delegable": true, "allow": [], "ask": [], "deny": [] } } }`.
- `logDir` is optional and defaults to `logs`. It is the folder of the decision log (Draft 07), resolved relative to the session's project directory (`cwd`); an absolute path is allowed. It must be a non-empty string.
- `description` is required and must be a non-empty string. `delegable` is a boolean per profile, default `true`. A parent cannot hand a non-delegable profile to a subagent; the request goes to the user.
- The config file is a protected path: Edit and Write are denied on it (Draft 05).

**Parser.** Hand-written, with no validation library. Hooks cannot use devDependencies, so a library such as Ajv would become a runtime dependency. Unknown keys are errors, except a top-level `$schema`. The parser exports its accepted key set, and a test asserts that the property names in `mode-gate.schema.json` equal it, so the two cannot drift.

**Functions** (in `hooks/config.ts`, pure apart from the injected `deps`). Exact signatures are decided test-first.

- `parseRule(raw)` returns a parsed rule or a rule error. Unsupported forms (see Terms) are rule errors.
- `validateConfig(input, deps)` returns `Issue[]`. `input` is the parsed JSON of a config file. It validates the user profiles and the built-ins.
- `parseStartProfiles(env)` reads `MODE_GATE_PROFILES` (comma-separated, trimmed). It drops empty entries and warns about entries that are not valid profile names.
- `loadConfig(deps)` reads the files, runs the validator, merges the layers and applies `parseStartProfiles`. `deps` is `{ readFile, env, cwd, baseline, builtins }`: a file reader, the environment, the project directory and the two data sets. Tests inject all of them. In production `hooks/config.ts` supplies the real baseline and built-ins as defaults.
- Its result is `{ ok: true, config: { baseline, profiles, proposals }, configPath, logDir, startProfiles, warnings }` or `{ ok: false, errors, baseline, configPath, logDir, startProfiles, warnings }`. `logDir` is the resolved log folder (see Format and location) in both results; it is `logs` resolved against `cwd` when the config is missing or invalid. `configPath` is the resolved user config path (see Format and location) in both results, so `/gate-status` (Draft 04) can show it; if the path cannot be resolved (no home), it is `undefined`. `baseline` is `{ name: 'baseline', allow: Rule[], ask: Rule[], deny: Rule[] }`, parsed by `parseRule` from the strings in `hooks/baseline.ts`, in both results. Draft 03 builds its active set (baseline plus switched-on profiles) from it. The failed result carries `baseline` so callers such as Draft 04 can fail closed (only the baseline active) without re-parsing it. `startProfiles` (present in both results) are the validated names from `parseStartProfiles(env)` that match a defined profile; each unknown name adds a warning, which Draft 04's `/gate-status` shows. Draft 04 activates them at `session.start`. `ok` is `false` when any issue has severity error. Warnings alone still give `ok: true`.

**Where the data lives.** Both data files hold raw rule **strings**, which `hooks/config.ts` parses with the same `parseRule` as the user file. There are no hand-written parsed literals.

- `hooks/baseline.ts` exports `{ name, description, allow: string[], ask: string[], deny: string[] }`. It has no `delegable` and is not a `Profile`: subagents always get the baseline. Only rules the v1 grammar can express go here. The grammar has only whole-tool rules and Bash exact and prefix rules, so it cannot say "the edit tool, but only for this path". The baseline's path-based entries (ask on edits to `package.json`, `scripts/` and the tool configs; deny on protected paths) are therefore path guards in Draft 05, not profile rules. Its content:
  - `allow`, read tools: `mcp__mcp-workspace__` plus `read_file`, `list_directory`, `search_files`, `read_reference_file`, `list_reference_directory`, `search_reference_files`, `get_reference_projects`, `git`, `github_issue_view`, `github_issue_list`, `github_pr_view`, `github_search`, `check_branch_status`, `check_file_size`, `get_base_branch`;
  - `allow`, write tools: `mcp__mcp-workspace__` plus `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`;
  - `allow`, other tools: `Skill`, `Agent`, `WebFetch`, `WebSearch`;
  - `allow`, check scripts: `Bash(npm run check)`, `Bash(npm run typecheck)`, `Bash(npm run lint)`, `Bash(npm run format)`, `Bash(npm run format:check)`, `Bash(npm run test)`, `Bash(npm run test:coverage)`, `Bash(npm run test:mutation)`, `Bash(npm run arch)`, `Bash(npm run deadcode)`, `Bash(npm run docs:lint)`, `Bash(npm run audit)` and the prefix rule `Bash(npm run check:*)`;
  - `ask`: `Bash(npm ci)` and `Bash(npm install)`, because they run install scripts;
  - `deny`: empty for now. Tests inject a baseline with deny rules.
- `hooks/builtin-profiles.ts` ships the built-in profiles `git-write` and `issues` as empty placeholders: `{ name, description, delegable, allow: [], ask: [], deny: [] }`. Draft 09 fills them in.
- Both files import nothing at runtime; type imports from `hooks/policy.ts` are allowed. `hooks/config.ts` imports them as the defaults of the injectable `deps`, so both files are used and knip stays green. Tests pass their own data.

**Three layers.**

1. The **baseline** is built into the mod. Nothing overrides it.
2. **Built-in profiles** ship with the mod. They exist but are active only after the user switches them on.
3. The **user file** adds profiles. It may replace a built-in by reusing its name.

For a name, the user file wins over the built-in, and the whole definition wins, with no merging. Across active profiles, deny beats ask beats allow, whatever the source. Nothing can loosen the baseline's denies: the name `baseline` is reserved, and the validator rejects any allow rule that a baseline deny covers.

**Loader behaviour.**

- A missing user file is not an error: there are no user profiles.
- An unreadable or malformed file (bad JSON, permission error) is an error and fails closed.
- On an invalid config only the baseline is active (the failed result's `baseline`), and the errors are shown. Built-in profiles stay switched off until the user switches them on.
- If the baseline strings in `hooks/baseline.ts` themselves fail to parse, `baseline` is empty, so Claude Code's own verdicts apply and calls ask. The parse error is included in `errors`.
- Draft 04 calls `loadConfig` once at `session.start`; `/gate-check` calls it again to validate without applying.
- The project root for `.mode-gate.json` is the injected `cwd` (the session's project directory).

**Project profiles are proposals only.** A project may contain `.mode-gate.json` at its root, with the same shape as the user file. Its profiles are never active and never take part in precedence. `/gate-check` lists them with their rules and a note that they are proposals. The user adopts one by copying it into their own config by hand. There is no adopt command in v1. An unknown name given to `/gate-on` that matches a project proposal gets a message saying so (Draft 04 shows it; this draft supplies the lookup). Every issue in an invalid project file is only a warning and does not invalidate the user config.

**`/gate-check`** validates all defined profiles (the user file plus the built-ins) and also lists the project proposals.

**Other relied-on rules.**

- Version 1 matches non-Bash tools by whole-tool rules only (a plain name, `mcp__server__tool`, `mcp__server`, `*`) and Bash by exact and prefix rules. A Bash rule matches only if the command contains none of `& ; | $ ( ) \` < >` and no newline. Matching by argument is later.
- `MODE_GATE_PROFILES` (for example `issues,git-write`) is read once per process and applies on every new process, including `claude --resume`. A repo cannot set it. An unknown name in it is ignored with a warning and activates nothing for that name.
- A profile with only `deny` entries is a restriction, for example a read-only profile.

## Existing code

- `hooks/policy.ts`: pure logic, no imports allowed (`.dependency-cruiser.cjs` rule `policy-is-pure`, and `tests/repo-structure.test.ts`). Today it holds only the `Verdict` type.
- `hooks/register.ts`: wiring stub that will call the loader (Draft 04). Nothing may import it.
- `.dependency-cruiser.cjs`: the architecture rules; its `options` block has no `tsPreCompilationDeps` yet. `knip.json`: entries are `hooks/register.ts`, `hooks/policy.ts`, `scripts/*.mjs` and `tests/**/*.test.ts`, so a hooks file nothing imports is reported as unused.
- `tests/`: vitest (`vitest.config.ts` includes `tests/**/*.test.ts`). Coverage is enforced only on `hooks/policy.ts` (95%).
- `CLAUDE.md`: commands, testing strategy, architecture rules. `docs/design.md`: the design.

## Goal

Define the config schema and the `Profile` and `Rule` types, load the three layers, derive starting profiles from `MODE_GATE_PROFILES`, and validate everything for `/gate-check`. Table-tested.

## Scope

- **Types.** `Profile` and `Rule` are defined in `hooks/policy.ts`, which stays import-free. The other new files import only the types. Drafts 02 and 03 can run in parallel: whichever starts first defines the types there and says so in its PR; the other builds on them.
- **Schema and parser.** `mode-gate.schema.json` plus the hand-written parser (see Decisions). Errors name the field, for example `profiles.git-write.allow: expected an array of strings`.
- **Loader** in `hooks/config.ts` (see Decisions). It takes an injected file reader, environment object and `cwd`, so tests never touch the real home directory or `~/.claude`.
- **Data files.** `hooks/baseline.ts` and `hooks/builtin-profiles.ts`, as in Decisions.
- **Architecture rule.** Add a dependency-cruiser rule to `.dependency-cruiser.cjs`: `hooks/baseline.ts` and `hooks/builtin-profiles.ts` may import nothing at runtime; type imports from `hooks/policy.ts` are allowed. The rule needs `tsPreCompilationDeps: true` in the `options` block of `.dependency-cruiser.cjs`; without it dependency-cruiser ignores type-only imports and the rule would not see them.
- **Layers.** Merge built-ins and the user file by name.
- **Project proposals.** Read `.mode-gate.json` from `cwd` into a separate list that is never part of the active set.
- **`MODE_GATE_PROFILES`.** `parseStartProfiles` plus the unknown-name check in `loadConfig`.
- **Validator** for `/gate-check`: the findings and severities in Decisions, with the built-in tool names in one replaceable constant.

## Out of scope / later

The `/gate-check` command registration (Draft 04). The built-in profile contents (Draft 09). The protected-path list and the baseline's path guards (Draft 05). An adopt command, and activating a project profile with per-repo approval. Parameterised profiles. Skill-declared profiles.

## Acceptance criteria

- [ ] Table tests exist before the code, one row per valid and invalid config.
- [ ] A malformed config is rejected with a message naming the field.
- [ ] An unknown key is an error, except a top-level `$schema`.
- [ ] The parser exports its accepted key set (`$schema`, `logDir`, `profiles`), and a test asserts that the property names in `mode-gate.schema.json` equal it.
- [ ] `parseRule` gives `Bash(git commit *)` the prefix `git commit ` and `Bash(npm run check:*)` the prefix `npm run check:`; `*` parses to `{ tool: '*', kind: 'whole' }` and `Bash(*)` to `{ tool: 'Bash', kind: 'prefix', arg: '' }`; an unparsable rule gives a rule error. Every parsed rule has `raw` equal to its input string.
- [ ] Unsupported forms are rule errors (table test, error message points to Draft 05): `Edit(src/**)`, `Read(./.env)`, `Write(*)` and `mcp__s__t(x)` (argument on a non-Bash tool); `Bash(git * push)`, `Bash(* push)` and `Bash(git **)` (`*` not the last character). Valid rows still parse: `Edit`, `*`, `mcp__s`, `mcp__s__t`, `Bash(git push *)`, `Bash(npm run check:*)`, `Bash(*)`.
- [ ] The same forms in a config file give errors from `validateConfig` naming the field, for example `profiles.p.deny[0]`.
- [ ] A prefix rule covers a rule of the same tool whose text starts with its prefix, and nothing else (table test, including a different tool and a shorter text).
- [ ] `loadConfig` returns `{ ok: true, config: { baseline, profiles, proposals }, configPath, startProfiles, warnings }` for a valid config, where `baseline` is `{ name: 'baseline', allow, ask, deny }` with the rules of `hooks/baseline.ts` parsed (each with `raw`) and `configPath` is the resolved user config path. It returns `{ ok: false, errors, baseline, configPath, startProfiles, warnings }` when any issue is an error, with `baseline` and `configPath` as in the success result and `startProfiles` as in the success result (names matching defined profiles; none if profiles cannot be determined). Warnings alone give `ok: true`. With an invalid config only that baseline is active.
- [ ] Test for the failure result: an invalid config gives `ok: false` with `errors`, `warnings`, `configPath` and the parsed `baseline` (each rule with `raw`).
- [ ] Test for an unparsable baseline: with an injected baseline containing an unparsable rule string, `loadConfig` returns `ok: false`, an empty `baseline` (all three lists empty) and the parse error in `errors`.
- [ ] `logDir` is optional. It must be a non-empty string (an empty string or a non-string is an error naming `logDir`). `loadConfig` returns the resolved `logDir` in both the success and the failure result: `logs` against `cwd` by default, also when the config is missing or invalid; a relative value resolves against `cwd`, an absolute value is kept.
- [ ] A missing user file is not an error. An unreadable or malformed file is an error.
- [ ] An invalid project `.mode-gate.json` yields warnings only (every issue downgraded); the user config stays valid.
- [ ] A user profile with a built-in's name replaces it whole, with no merging.
- [ ] A profile name with uppercase letters, a leading digit, `all` or `baseline` is rejected.
- [ ] `description` is required and must be a non-empty string. `delegable` defaults to `true` and must be a boolean.
- [ ] `Bash`, `Bash(*)` and `*` in `allow` are errors; a bare `mcp__<server>` in `allow` is a warning.
- [ ] The same pattern in two lists of one profile is an error. The same pattern in two different profiles, including the baseline and the built-ins, is a warning. An allow covered by a broader ask or deny pattern (`allow Bash(git push origin)` against `deny Bash(git push *)`) is a warning.
- [ ] An unknown non-MCP tool name is a warning. `mcp__<server>__<tool>` and `mcp__<server>` are never errors for an unknown server. The built-in names sit in one constant.
- [ ] `/gate-check` support: the validator covers the user file and the built-ins, and the loader returns the project proposals for listing.
- [ ] `parseStartProfiles` splits and trims `MODE_GATE_PROFILES` and warns about invalid names. An unknown name is reported by `loadConfig` and activates nothing.
- [ ] The config path is `MODE_GATE_CONFIG` if set, else `$XDG_CONFIG_HOME/mode-gate/config.json`, else `<home>/.config/mode-gate/config.json` with `<home>` from `HOME`, else `USERPROFILE` of the injected environment. With none set, `loadConfig` fails closed (`ok: false`, `configPath` undefined). The resolved path is returned as `configPath`.
- [ ] `hooks/baseline.ts` holds exactly the rules listed in Decisions, as strings, and the built-ins are empty placeholders. A test asserts that every baseline and built-in rule string parses without error.
- [ ] `hooks/baseline.ts` and `hooks/builtin-profiles.ts` import nothing at runtime, enforced by the new dependency-cruiser rule with `tsPreCompilationDeps: true` (`npm run arch` passes).
- [ ] `hooks/config.ts` is in the coverage include list of `vitest.config.ts` (95% thresholds kept) and in the Stryker `mutate` list of `stryker.config.json`.
- [ ] `hooks/config.ts` imports the baseline and the built-ins as defaults of `deps`, so `npm run deadcode` passes.
- [ ] The tests inject the baseline, the built-ins, the file reader, the environment and `cwd`, and never touch the real home directory.
- [ ] Negative test: profiles from a project `.mode-gate.json` are never in the active set and cannot loosen a baseline deny.
- [ ] Negative tests behind "no profile can remove a baseline deny": the name `baseline` is rejected as a profile name, and a profile whose allow rule is covered by a baseline deny rule gets an error from the validator (so `loadConfig` returns `ok: false`).
- [ ] `npm run check` passes (arch, knip, lint and strict types included).

## How to start

Branch `config-and-validator` from `main`, after PR #1 is merged. Write the first failing test in `tests/config.test.ts`: parsing `{ "profiles": { "git-write": { "description": "...", "allow": ["Bash(git add *)"] } } }` yields a profile with empty `ask` and `deny` and `delegable: true`; then `{ "allow": "x" }` is rejected with the field named.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push to the `config-and-validator` branch after each major change.

**Stop and ask** (used throughout this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. Leave the work uncommitted.

## Depends on

Comes after Draft 01 in the order of work (Draft 00), and starts after PR #1 is merged to `main`. It does not need Draft 01's output: the rule grammar and the built-in tool names come from the Claude Code documentation. If Draft 01's findings exist, use them and note any difference in the PR. It can run in parallel with Draft 03.

## References

- [Concepts](../design.md#concepts)
- [Baseline](../design.md#baseline)
- [Matching](../design.md#matching)
- [Commands](../design.md#commands)
- [Headless runs](../design.md#headless-runs)
- [Protected paths](../design.md#protected-paths)
