# Guards: protected paths and the Bash redirect

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 05 of 11 (plan: Draft 00). The rule that makes the whole mod trustworthy is that Claude cannot rewrite the policy. This issue supplies the guard data that `decide` (Draft 03) takes as input, and the hook that applies it.

## Design decisions this issue relies on

**Decision order** (first match wins): (1) a subagent calls Bash and no active allow rule matches this call: deny, with the redirect message; (2) a covered write tool (see Covered tools) targets a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) unmatched calls keep Claude Code's verdict. A Claude Code deny is never overridden. Guards compose with the rules and never override them: the protected-path deny is a step-2 deny, the ask-path guard is an ask source at step 3, and a guard never turns a deny into an ask or an allow.

**Guard results.** The guards are pure functions in a new module `hooks/guards.ts` (this issue owns it). `register.ts` calls them with the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the file path, and the agent id and tool-call id when the event carries them; Draft 04 builds it) and a context `{ projectDir, homeDir, logDir, configPath }` (the resolved values, built by Draft 04's shared path: `projectDir` is the session's working directory that Draft 04 records in `$.state` at `session.start`, `homeDir` comes from the injected environment (`HOME`, else `USERPROFILE`, like Draft 02's loader), `logDir` and `configPath` come from the `loadConfig` result; `configPath` and `homeDir` may be `undefined`; see Missing home directory). `logDir` is already resolved by `loadConfig`; the guards do not resolve it again. The context lets the guards protect the log folder and the config file wherever they are. Each returns `{ kind: 'deny' | 'ask', message: string }`, or nothing. Draft 04 owns the one shared path through `decide` used by both `tool.call` and `tool.check`. It takes the guard results as an injected list (empty until this draft) and `redirectHint` as an injected function (a stub returning `undefined` until this draft), and passes the guard results to `decide` (Draft 03), which orders them against the rules and passes the `message` through. This draft supplies the real guards and the real `redirectHint` and plugs both in, replacing the stubs. This draft computes the paths and messages; `decide` does not.

**Covered tools (deny guard and ask guard share them).** The mcp-workspace write tools with their path fields: `edit_file`, `save_file`, `append_file` and `delete_this_file` (`file_path`), `delete_directory` (`dir_path`), `move_file` (`source_path` and `destination_path`, both checked), and the native `Edit` and `Write` (`file_path`). An MCP tool name is covered when the segment after the last `__` is one of these names, so a changed server prefix such as `mcp__plugin_x_mcp-workspace__edit_file` still matches; `Edit` and `Write` match exactly. Matching same-named tools of other servers is safe over-matching. If a covered call's path field is missing or not a string, the guard returns `ask`, so the baseline cannot silently allow it.

**Protected paths.** Deny on the covered tools:

- the config file (`configPath` from the context, also when it is not in the default place, for example via `MODE_GATE_CONFIG`) and the log folder (`logDir`, a directory rule: the folder and everything under it);
- `settings*.json` (`settings.json`, `settings.local.json` and similar) directly inside any `.claude` directory, under `projectDir` and under `homeDir`; hook definitions live there (assumption 8);
- `<homeDir>/.claude/plugins/**`, the installed copy of the mod (assumption 9);
- shell profiles under `homeDir`: `.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.config/fish/config.fish`, `Documents/PowerShell/*profile*.ps1` and `Documents/WindowsPowerShell/*profile*.ps1`.

**Missing home directory.** If `homeDir` is `undefined` (neither `HOME` nor `USERPROFILE` is set), the home-based entries cannot be evaluated, and skipping them would fail open. Instead, a covered call whose normalised path is absolute and outside `projectDir` returns `ask` ("cannot verify the path is not protected"). Paths inside `projectDir` are evaluated as usual, so the project-relative rules still apply. If `configPath` is `undefined`, only the config entry is skipped.

The working tree's own `hooks/`, `types/` and `.claude-plugin/` are deliberately not protected: denying them would block development of this repository while the mod is active. "Hooks" in the design means hook definitions inside the settings files.

Known gaps, not closed in v1: other write routes (PowerShell, NotebookEdit, other MCP file tools, symbolic links), and the home entries assume the default location `<homeDir>/.claude`. If `CLAUDE_CONFIG_DIR` relocates it, those entries do not follow.

**Ask paths.** Ask on the covered tools for the rest of `.claude/` (skills, agents, `CLAUDE.md`) under `projectDir` and `homeDir`, and, under `projectDir`, for `package.json`, anything under `scripts/` and the tool configs: `eslint.config.js`, `vitest.config.ts`, `stryker.config.json`, `.dependency-cruiser.cjs`, `knip.json`, `tsconfig.json`, `.markdownlint-cli2.jsonc`, `.prettierrc.json`. The allowed `npm run` check scripts execute these files, so an edit would let Claude run arbitrary code under an allowed command. Also ask, under `projectDir`: `.git/hooks/**` and `.git/config` (an allowed `git commit` runs hooks) and `.mcp.json`; and `<homeDir>/.claude.json`. The `.mcp.json` and `.claude.json` files can launch programs. This is a path guard, not a profile rule (the v1 grammar cannot express it), and it is an ask source at step 3: a profile allow does not remove the ask, but any deny wins over it (a protected-path deny, or a profile deny such as `deny *`).

**Matching.** A call touches an entry if any of its path fields resolves to the entry, to a file under a directory entry, or to a directory that contains an entry (for example `delete_directory` or `move_file` on `.claude`, on the installed plugin folder or on `.`). When a call touches both deny and ask entries, the result is deny. Normalisation is pure and takes no platform signal. It applies to **every compared path**: the tool path, `homeDir`, `projectDir`, `logDir` and `configPath` all get the same treatment as the rules below, so a context value with other separators, other case or a Git Bash form still matches.

- Paths are case-folded (over-matching is safe), and both `/` and `\` are separators.
- `.` and `..` are resolved lexically; a relative path is resolved against `projectDir`, an absolute path is used as given.
- A relative path that escapes `projectDir` (for example `src/../../package.json`) is resolved to its absolute location and compared with the absolute protected set; it is not ignored.
- An **absolute path** has a drive-letter prefix, a UNC prefix (`\\server\share`) or a leading separator. Drive letters and UNC prefixes are compared, case-folded, as part of the path.
- A drive-less absolute path (a leading separator, no drive letter, such as `\Users\x\.bashrc` or `/Users/x/.claude/settings.json`) is resolved against the drive of `projectDir` when `projectDir` has a drive letter, and against the root otherwise. It is then compared with the protected set.
- The extended-length prefixes `\\?\` and `\\.\` are stripped. `\\?\UNC\server\share\...` is normalised to `\\server\share\...`.
- Trailing dots and spaces are stripped from each segment (`.claude\settings.json.` is the same file on Windows).
- An NTFS alternate-data-stream suffix (`:name` or `::$DATA`) is stripped from the last segment.
- MSYS/Git Bash drive paths map to Windows form (`/c/Users/x` becomes `c:\Users\x`), for every compared path, so a Git Bash `HOME` still matches Windows-style tool paths.
- Directory containment counts only fixed-path entries. The guard is pure and cannot find a nested `.claude` inside an arbitrary subdirectory (for example `delete_directory` on `src` when `src/x/.claude/settings.json` exists). Known limit, stated in the README and `SECURITY.md`.
- Symbolic links are not resolved (known gap, stated in the README and `SECURITY.md`).

**Redirect message.** `hooks/guards.ts` exports a pure function `redirectHint(command: string): string | undefined`, backed by the hint table. When `decide` returns `source` = `subagent-bash` (Draft 03; Draft 04 passes the agent id into `decide`, so this works before Draft 06), the shared path in `register.ts` (Draft 04) calls it and puts the text in the hook result's `message`; `decide` builds no redirect text. The text names the approved MCP tool to use instead (for example `git status` maps to the read-only `git` tool, `cat file` to `read_file`). Goal 5 of the design: "A denied Bash call tells Claude which approved tool to use instead."

**Security model rows** this closes: "Claude edits the mod's source or config" (protected-paths deny), "Claude writes the variable into a profile" (protected-paths deny on shell profiles).

Assumptions (Draft 01 verifies): 2 (agent id on `tool.call`), 8 (settings files can define environment variables, so they must be protected), 9 (plugins live under `~/.claude/plugins/`, so that path is protected). If 9 fails, protect the real plugin folder found by the spike.

## Existing code

- `hooks/policy.ts`: pure (`Verdict` type only now; `decide` arrives in Draft 03 and takes the guard results as input). Do not put the guards here. Create `hooks/guards.ts` with path normalisation and the lists as pure functions, no `node:path` import. It imports nothing; `register.ts` imports it.
- `hooks/register.ts`: Draft 04 wires `tool.call` and `tool.check` through one shared decision path with an injected guard list (empty until this draft) and tests it with fake guards. This draft plugs in the real guards.
- `.dependency-cruiser.cjs`: `policy-is-pure` forbids imports from `policy.ts`. `vitest.config.ts`: 95% coverage, include list `hooks/policy.ts` only. `stryker.config.json`: `mutate` lists `hooks/policy.ts` only, mutation break at 75.
- `CLAUDE.md` "Testing strategy": test protected paths including relative paths and `..`, and give every security rule a negative test.

## Goal

Block the write tools on the mod's config, logs, installed copy, settings files and shell profiles, ask for the rest of `.claude/` and for the files the check scripts execute, and redirect denied subagent Bash calls to the right MCP tool.

## Scope

- `hooks/guards.ts`: pure guard functions returning `{ kind: 'deny' | 'ask', message }` or nothing (see Guard results).
- The deny list and the ask list (see Protected paths and Ask paths), including the configured log folder and the config file, taken from the guard context.
- The covered tools and the path fields they check (see Covered tools).
- Path normalisation as in Matching, before comparing.
- A hint table mapping common Bash commands to the approved MCP tool, plus a generic redirect, exposed as `redirectHint(command)`.
- Gates for the new pure module: add `hooks/guards.ts` to the coverage include list in `vitest.config.ts` (keep the 95% thresholds), to the `mutate` list in `stryker.config.json`, and add a dependency-cruiser rule (like `policy-is-pure`) so `hooks/guards.ts` imports nothing.
- Document the known gap and the containment limit in the README and `SECURITY.md`.

## Out of scope / later

Closing the other write routes. Protecting by symlink resolution.

## Acceptance criteria

- [ ] Tests exist first, with a negative row per protected entry. Path rows test the guards in `tests/guards.test.ts` directly, passing the context `{ projectDir, homeDir, logDir, configPath }`, and check the returned `kind` and `message`.
- [ ] Context rows: the covered tools are denied on a file under the context's `logDir` (the default `logs` and a custom one, relative and absolute) and on the context's `configPath` (also a custom path); a look-alike path is not denied; with `configPath` undefined the guard does not throw and still protects the other entries.
- [ ] Missing home directory rows (`homeDir` undefined): an absolute path outside `projectDir` (for example `/home/u/.bashrc`) returns ask with the "cannot verify" message, not nothing and not allow; a relative path that escapes `projectDir` (`../x`) also returns ask; `.claude/settings.json` inside `projectDir` still returns deny, and `package.json` still returns ask; an absolute path inside `projectDir` is evaluated as usual.
- [ ] Combination rows go through `decide` with the guard results: a `deny` result beats a profile allow, an `ask` result is beaten by a profile `deny *`.
- [ ] Deny rows, for `mcp__mcp-workspace__edit_file` and native `Edit` and `Write`: `.claude/settings.json`, `.claude/settings.local.json` and `<homeDir>/.claude/settings.json`; `<homeDir>/.claude/plugins/x/hooks/register.ts`; each shell profile of the list under `homeDir`, including `Documents/PowerShell/Microsoft.PowerShell_profile.ps1` and `Documents/WindowsPowerShell/profile.ps1`; `../.claude/settings.json` style paths.
- [ ] Not-protected rows (no result): `hooks/register.ts`, `hooks/policy.ts`, `src/../hooks/register.ts`, `types/index.d.ts` and `.claude-plugin/plugin.json` under `projectDir`; `settings.json` outside a `.claude` directory; a look-alike such as `.bashrc.bak`.
- [ ] `.claude/skills/x/SKILL.md`, `.claude/CLAUDE.md`, `.claude/settings.txt` (not a `settings*.json` file, so only the rest-of-`.claude` ask applies) and `<homeDir>/.claude/agents/a.md` return ask, not allow.
- [ ] Tool coverage: every covered tool returns the same deny for a protected path and the same ask for an ask path: `edit_file`, `save_file`, `append_file`, `delete_this_file` (`file_path`), `delete_directory` (`dir_path`), `move_file` (the path as source, and as destination) and native `Edit` and `Write`. A prefixed name such as `mcp__plugin_x_mcp-workspace__edit_file` is covered; `Read` and `Bash` are not.
- [ ] Directory rows: `delete_directory` and `move_file` (source) on `.claude` return deny (it contains `settings.json`), on `<homeDir>/.claude/plugins` return deny, on `.` return deny, on `scripts` return ask. `.` (the project root) always denies, because the root contains the fixed entry `.claude/settings.json`; containment counts that entry whether or not the project has such a file, so there is no ask case for `.`.
- [ ] A covered call whose path field is missing, `undefined` or not a string (for example a number) returns ask (negative row: not allow, not nothing).
- [ ] Escaping-path rows, fixture `projectDir` = `C:\Users\x\proj`, `homeDir` = `C:\Users\x`: `../.claude/settings.json` resolves to `C:\Users\x\.claude\settings.json` and returns deny; `src/../../package.json` resolves to `C:\Users\x\package.json`, which is outside the project and matches no entry, so the guard returns nothing.
- [ ] Drive-less and UNC rows, same fixture, each returning deny: `\Users\x\.bashrc` and `/Users/x/.claude/settings.json` (resolved against drive `C:`); `\\?\UNC\server\share\.claude\settings.json` gives the same result as `\\server\share\.claude\settings.json` (use `projectDir` `\\server\share`). With a `projectDir` that has no drive letter (`/home/u/proj`), `/home/u/.bashrc` with `homeDir` `/home/u` returns deny.
- [ ] Normalisation rows (fixture `projectDir` = `C:\Users\x\proj`, `homeDir` = `C:\Users\x`; each result equals the plain form): `.claude\settings.json` and `.claude/settings.json` give the same result; mixed separators (`.claude/skills\x/SKILL.md`); upper case (`.CLAUDE/Settings.JSON`, `PACKAGE.JSON`) matches by case-folding; an absolute path with a different drive-letter case (`C:\...` and `c:\...`) and a UNC path match the same entry; `.` and `..` segments resolve (`./package.json`, `src/../package.json`, `scripts/../eslint.config.js`).
- [ ] Windows form rows, each against a deny entry (result deny, same as the plain form): `.claude\settings.json.`, `.claude\settings.json. .`, `.claude\settings.json::$DATA`, `.claude\settings.json:stream`, `\\?\C:\proj\.claude\settings.json` and `\\.\C:\proj\.claude\settings.json` (with `projectDir` `C:\proj`), `/c/Users/x/.bashrc` with `homeDir` `C:\Users\x`, and `C:\Users\x\.bashrc` with a Git Bash `homeDir` `/c/Users/x`. Negative: `.claude\settings.json.bak` is not denied (it is an ask path, like the rest of `.claude`).
- [ ] Context normalisation rows: the decision does not depend on the form of the context values. `configPath` `C:/USERS/X/.Config\Mode-Gate/config.json` (mixed separators, other case) still denies the tool path `c:\users\x\.config\mode-gate\config.json`; an absolute `logDir` with a trailing dot or a `\\?\` prefix still denies a file under it; a Git Bash `projectDir` `/c/Users/x/proj` still asks for `C:\Users\x\proj\package.json`.
- [ ] Ask rows for the extra entries, for every covered tool: `.git/hooks/pre-commit`, `.git/config`, `.mcp.json` under `projectDir`, and `<homeDir>/.claude.json`. Negative: `.gitignore`, `.git/HEAD`, `src/.mcp.json` and `<homeDir>/.claude.jsonl` are not asked. `delete_directory` on `.git/hooks` returns ask.
- [ ] Containment limit row: `delete_directory` on `src` returns nothing, even if a nested `src/x/.claude` exists (documented limit).
- [ ] Ask-paths guard: each of `package.json`, `scripts/check.mjs` and the eight tool configs returns ask for every covered tool (`move_file` as source and as destination, `delete_directory` on `scripts`; `.` is covered by the directory rows and denies). Negative rows: `src/package.json.bak` style look-alikes and other files are not asked by this guard (the verdict is unchanged). `scripts\check.mjs` returns ask. No profile allow turns the ask into allow, and a protected-path deny or a profile deny still wins over ask.
- [ ] `redirectHint('git status')` returns text naming the read-only `git` tool; `redirectHint('cat file')` names `read_file`.
- [ ] A command missing from the hint table gets a generic redirect that still names the tool class (`redirectHint` returns `undefined` only for input that needs no redirect, such as an empty command).
- [ ] A subagent Bash call (an event with an agent id, no active allow rule for it) returns deny, and the hook result built by `register.ts` carries the `redirectHint` text in `message` (wiring test added by this draft, with the real `redirectHint`; it builds on Draft 04 and needs no Draft 06).
- [ ] No profile can unlock a protected path.
- [ ] Gates: `hooks/guards.ts` is in the coverage include list of `vitest.config.ts` and `npm run test:coverage` reaches 95% on it (and still on `hooks/policy.ts`); it is in the Stryker `mutate` list and `npm run test:mutation` stays above the `break` threshold of 75; a dependency-cruiser rule makes `hooks/guards.ts` import nothing (`npm run arch` passes).
- [ ] The known gap and the containment limit are in the README and `SECURITY.md`.
- [ ] `npm run check` passes.

## How to start

First failing test in `tests/guards.test.ts`: the protected-path guard returns a `deny` result for `Edit` of `.claude/settings.json`, and also for `Edit` of `src/../.claude/settings.json`.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 03, Draft 04. Draft 01 for assumptions 2, 8 and 9.

## References

- [Protected paths](../design.md#protected-paths)
- [Decision order](../design.md#decision-order)
- [Security model](../design.md#security-model)
- [Goals and non-goals](../design.md#goals-and-non-goals)
