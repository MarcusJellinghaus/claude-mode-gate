# Guards: protected paths and the Bash redirect

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 05 of 13 (plan: Draft 00). The mod protects the installed copy of itself and the user's own config (the config, the log folder, the installed plugin folder, the settings files that hold the hook definitions, shell profiles), and asks before Claude edits files that the allowed `npm run` scripts or git execute. It guards against mistakes and prompt injection, not against an adversary who can write code and run it: the working tree's own `hooks/`, `tests/` and `types/` are deliberately unprotected, so the mod can be developed with itself active, and no ask is added for them. This issue supplies the guard data that `decide` (Draft 03) takes as input, and the guards the shared path (Draft 12) calls.

## Design decisions this issue relies on

**Decision order** (a deny from Claude Code passes through unchanged first; then the first match wins): (1) a subagent calls Bash and no active allow rule matches this call: deny, with the redirect message; (2) a covered write tool (see Covered tools) targets a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) unmatched calls keep Claude Code's verdict. Guards compose with the rules and never override them: the protected-path deny is a step-2 deny, the ask-path guard is an ask source at step 3, and a guard never turns a deny into an ask or an allow.

**Guard results.** The guards are pure functions in a new module `hooks/guards.ts` (this issue owns it). The shared path in `hooks/gate.ts` (Draft 12) calls them with the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the file path, and the agent id and tool-call id when the event carries them), a context `{ projectDir, homeDir, logDir, configPath }` and the optional `resolved` input (below). The context holds the resolved values built by Draft 12: `projectDir` is `$.session.cwd()`, `homeDir` is `HOME`, else `USERPROFILE` of the environment, `logDir` and `configPath` come from the `loadConfig` result; `configPath` and `homeDir` may be `undefined` (see Missing home directory). `logDir` is already resolved by `loadConfig`; the guards do not resolve it again. Each guard returns `{ kind: 'deny' | 'ask', message: string }`, or nothing. Draft 12 takes the guard results as an injected list (empty until this draft) and `redirectHint` as an injected function (a stub until this draft), and passes the results to `decide`, which orders them against the rules and passes the `message` through. This draft supplies the real guards and the real `redirectHint`; `register.ts` imports `hooks/guards.ts` and wires both into `gate.ts`. This draft computes the paths and messages; `decide` does not.

**Resolved paths (symbolic links).** The guard is pure and cannot touch the file system. For each path field of a covered call, `register.ts` calls `$.fs.stat(path, { resolve: true })` and takes `realPath` (absolute, every symbolic link followed, `.` and `..` folded). `stat` rejects for a path that does not exist yet (a new file, or a new file in a new folder: the covered write tools create folders). Then the wiring resolves the **nearest existing ancestor**: it walks up, one segment at a time, until `stat` succeeds (or uses `$.fs.ancestors`), and appends the remaining segments to that `realPath` (a small pure helper in `guards.ts`, `parentAndName(path)`, splits off the last segment). So `link/newdir/hooks/x.ts`, with `link` a symlink to a protected folder, resolves to the folder's real path plus `newdir/hooks/x.ts`. If the walk reaches the root without a hit, the path gets no entry. A path whose resolution fails or returns no `realPath` gets no entry. The result is the input `resolved: Readonly<Record<string, string>>`, keyed by the path field name (`file_path`, `dir_path`, `source_path`, `destination_path`), and `gate.ts` forwards it to the guards. The guard checks the spelled path **and** the resolved path with the same normalisation; a hit on either decides (deny beats ask). This closes symbolic links. It stays best effort: hard links, case aliases and volume or file-id spellings keep their own spelling, and `homeDir` or `projectDir` themselves are compared by their spelling. A call with no `resolved` entry (resolution failed) is checked by its spelling alone.

**Covered tools (deny guard and ask guard share them).** The mcp-workspace write tools with their path fields: `edit_file`, `save_file`, `append_file` and `delete_this_file` (`file_path`), `delete_directory` (`dir_path`), `move_file` (`source_path` and `destination_path`, both checked), and the native `Edit` and `Write` (`file_path`). An MCP tool name is covered when the segment after the last `__` is one of these names, so a changed server prefix such as `mcp__plugin_x_mcp-workspace__edit_file` still matches; `Edit` and `Write` match exactly. Matching same-named tools of other servers is safe over-matching. If a covered call's path field is missing or not a string, the guard returns `ask`, so the baseline cannot silently allow it.

**Protected paths.** Deny on the covered tools:

- the config file (`configPath` from the context, also when it is not in the default place, for example via `MODE_GATE_CONFIG`) and the log folder (`logDir`, a directory rule: the folder and everything under it);
- `settings*.json` (`settings.json`, `settings.local.json` and similar) directly inside any `.claude` directory, under `projectDir` and under `homeDir`; hook definitions live there (assumption 8);
- `<homeDir>/.claude/plugins/**`, the installed copy of the mod (assumption 9);
- shell profiles under `homeDir`: `.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.config/fish/config.fish`, `Documents/PowerShell/*profile*.ps1` and `Documents/WindowsPowerShell/*profile*.ps1`.

**Missing home directory.** If `homeDir` is `undefined` (neither `HOME` nor `USERPROFILE` is set), the home-based entries cannot be evaluated, and skipping them would fail open. Instead, a covered call whose normalised path is absolute and outside `projectDir` returns `ask` ("cannot verify the path is not protected"). Paths inside `projectDir` are evaluated as usual, so the project-relative rules still apply. The config-path and log-folder denies (from the context) are **always** evaluated, also when `homeDir` is `undefined` and when the path is outside `projectDir`; a deny beats the "cannot verify" ask. If `configPath` is `undefined`, only the config entry is skipped.

The working tree's own `hooks/`, `types/`, `tests/` and `.claude-plugin/` are deliberately not protected and get no ask: denying or asking would block development of this repository while the mod is active. "Hooks" in the design means hook definitions inside the settings files.

Known gaps, not closed in v1: other write routes (the native NotebookEdit, other MCP file tools, hard links), PowerShell (v1 gates Bash only; a documented gap), and the home entries assume the default location `<homeDir>/.claude`. If `CLAUDE_CONFIG_DIR` relocates it, those entries do not follow.

**Ask paths.** Ask on the covered tools for:

- the rest of `.claude/` (skills, agents, `CLAUDE.md`) under `projectDir` and `homeDir`;
- under `projectDir`: `package.json`, anything under `scripts/`, the tool configs `eslint.config.js`, `vitest.config.ts`, `stryker.config.json`, `.dependency-cruiser.cjs`, `knip.json`, `tsconfig.json`, `.markdownlint-cli2.jsonc`, `.prettierrc.json`, and `.mcp.json`. The allowed `npm run` check scripts execute these files, so an edit would let Claude run arbitrary code under an allowed command;
- under `projectDir`: `.github/workflows/**` (CI definitions run with repository secrets) and everything under `.git/` (`.git/**`: hooks, config and the other internals; an allowed `git commit` runs hooks);
- any file named `.npmrc`, at any directory level: a basename rule, so it covers the project, its subdirectories, the home folder and any other location (npm reads it for the allowed scripts);
- `<homeDir>/.claude.json`.

The `.mcp.json` and `.claude.json` files can launch programs. Claude Code's auto-memory (`<homeDir>/.claude/projects/*/memory/**`) lies under `<homeDir>/.claude/**` and therefore asks on every save, by design: there is no exception for it, and a test pins this. These are path guards, not profile rules (the v1 grammar cannot express them), and they are ask sources at step 3: a profile allow does not remove the ask, but any deny wins over it (a protected-path deny, or a profile deny such as `deny *`).

**Matching.** A call touches an entry if any of its path fields resolves to the entry, to a file under a directory entry, or to a directory that contains a fixed-path entry (for example `delete_directory` or `move_file` on `.claude`, on `.github`, on `.git`, on the installed plugin folder or on `.`). When a call touches both deny and ask entries, the result is deny. Normalisation is pure and takes no platform signal. It applies to **every compared path**: the tool path, the resolved path, `homeDir`, `projectDir`, `logDir` and `configPath` all get the same treatment as the rules below, so a context value with other separators, other case or a Git Bash form still matches.

- Paths are case-folded (over-matching is safe), and both `/` and `\` are separators.
- `.` and `..` are resolved lexically; a relative path is resolved against `projectDir`, an absolute path is used as given.
- A relative path that escapes `projectDir` (for example `src/../../package.json`) is resolved to its absolute location and compared with the absolute protected set; it is not ignored.
- An **absolute path** has a drive-letter prefix, a UNC prefix (`\\server\share`) or a leading separator. Drive letters and UNC prefixes are compared, case-folded, as part of the path.
- A drive-less absolute path (a leading separator, no drive letter, such as `\Users\x\.bashrc` or `/Users/x/.claude/settings.json`) is resolved against the drive of `projectDir` when `projectDir` has a drive letter, and against the root otherwise. It is then compared with the protected set.
- **Normalisation order**, applied to every compared path:
  1. Strip the extended-length prefixes `\\?\` and `\\.\`. `\\?\UNC\server\share\...` is normalised to `\\server\share\...`.
  2. Map MSYS/Git Bash drive paths to Windows form (`/c/Users/x` becomes `c:\Users\x`), so a Git Bash `HOME` still matches Windows-style tool paths.
  3. Per segment (never the drive prefix, `C:`): strip an NTFS stream suffix, everything from the first `:` on (`:name`, `::$DATA`, `::$INDEX_ALLOCATION`), on **every** segment, not just the last. Then strip trailing dots and spaces (`.claude\settings.json.` is the same file on Windows); a segment that is exactly `.` or `..` once trailing spaces are removed stays as it is for step 5. A segment that comes out empty (`. .`) is dropped.
  4. Drop empty segments (repeated separators).
  5. Fold `.` and `..` lexically.
- **Drive-relative paths.** `X:` not followed by a separator (`C:.claude\settings.json`, `C:package.json`) resolves against `projectDir` when `X` equals the drive of `projectDir` (case-folded); on any other drive, or when `projectDir` has no drive letter, the result is `ask` ("cannot verify the path is not protected"), because the current directory of that drive is unknown.
- Directory containment counts only fixed-path entries. The guard is pure and cannot find a nested `.claude` or a nested `.npmrc` inside an arbitrary subdirectory (for example `delete_directory` on `src` when `src/x/.claude/settings.json` or `src/x/.npmrc` exists). Known limit, stated in the README and `SECURITY.md`.

**Redirect message.** `hooks/guards.ts` exports a pure function `redirectHint(command: string): string | undefined`, backed by the hint table. When `decide` returns `source` = `subagent-bash` (Draft 03), the shared path in `hooks/gate.ts` (Draft 12) calls it and puts the text in the hook result's `message`; `decide` builds no redirect text. The text names the approved MCP tool to use instead (for example `git status` maps to the read-only `git` tool, `cat file` to `read_file`). Goal 5 of the design: "A denied Bash call tells Claude which approved tool to use instead."

**Security model rows** this closes: "Claude edits the mod's config or install" (protected-paths deny; symbolic links resolved) and "Claude writes the variable into a profile" (protected-paths deny on shell profiles).

Assumptions (Draft 01 verifies the open ones): 8 (settings files can define environment variables, so they must be protected), 9 (plugins live under `~/.claude/plugins/`, so that path is protected; if not, protect the real plugin folder found by the spike), 19 (the `$.fs.stat` calls in the wiring may re-enter the hooks; see Draft 12).

## Existing code

- `hooks/policy.ts`: pure; `decide` (Draft 03) takes the guard results as input. Do not put the guards here. Create `hooks/guards.ts` with path normalisation and the lists as pure functions, no `node:path` import. It imports nothing; `register.ts` imports it.
- `hooks/gate.ts` (Draft 12): the shared decision path with an injected guard list (empty until this draft), tested with fake guards. This draft makes `register.ts` pass the real guards, `redirectHint` and the `resolved` paths.
- `.dependency-cruiser.cjs`: `policy-is-pure` forbids imports from `policy.ts`. `vitest.config.ts`: 95% coverage on an include list. `stryker.config.json`: `mutate` list, mutation break at 75.
- `CLAUDE.md` "Testing strategy": test protected paths including relative paths and `..`, and give every security rule a negative test.

## Goal

Block the write tools on the mod's config, logs, installed copy, settings files and shell profiles, ask for the rest of `.claude/` and for the files the check scripts and git execute, and redirect denied subagent Bash calls to the right MCP tool.

## Scope

- `hooks/guards.ts`: pure guard functions returning `{ kind: 'deny' | 'ask', message }` or nothing (see Guard results), with the `resolved` input.
- The deny list and the ask list (see Protected paths and Ask paths), including the configured log folder and the config file, taken from the guard context.
- The covered tools and the path fields they check (see Covered tools).
- Path normalisation as in Matching, before comparing.
- The wiring in `register.ts` that resolves path fields with `$.fs.stat(path, { resolve: true })` and passes `resolved` (a wiring test with a fake `$.fs`).
- A hint table mapping common Bash commands to the approved MCP tool, plus a generic redirect, exposed as `redirectHint(command)`.
- Gates for the new pure module: add `hooks/guards.ts` to the coverage include list in `vitest.config.ts` (keep the 95% thresholds), to the `mutate` list in `stryker.config.json`, and add a dependency-cruiser rule (like `policy-is-pure`) so `hooks/guards.ts` imports nothing.
- Supply the documentation criteria for the known gaps and the containment limit; Draft 13 writes the README and `SECURITY.md` text.

## Out of scope / later

Closing the other write routes. Gating PowerShell. Resolving `homeDir` and `projectDir` through links.

## Acceptance criteria

- [ ] Tests exist first, with a negative row per protected entry. Path rows test the guards in `tests/guards.test.ts` directly, passing the context `{ projectDir, homeDir, logDir, configPath }` (and `resolved` where stated), and check the returned `kind` and `message`.
- [ ] Context rows: the covered tools are denied on a file under the context's `logDir` (the default `logs` and a custom one, relative and absolute) and on the context's `configPath` (also a custom path); a look-alike path is not denied; with `configPath` undefined the guard does not throw and still protects the other entries.
- [ ] Missing home directory rows (`homeDir` undefined): an absolute path outside `projectDir` (for example `/home/u/.bashrc`) returns ask with the "cannot verify" message, not nothing and not allow; a relative path that escapes `projectDir` (`../x`) also returns ask; `.claude/settings.json` inside `projectDir` still returns deny, and `package.json` still returns ask; an absolute path inside `projectDir` is evaluated as usual. With `homeDir` undefined and a `configPath` outside the project, a covered call on exactly that `configPath` returns deny (the deny beats the "cannot verify" ask); a file under an absolute `logDir` outside the project also returns deny.
- [ ] Combination rows go through `decide` with the guard results: a `deny` result beats a profile allow, an `ask` result is beaten by a profile `deny *`.
- [ ] Deny rows, for `mcp__mcp-workspace__edit_file` and native `Edit` and `Write`: `.claude/settings.json`, `.claude/settings.local.json` and `<homeDir>/.claude/settings.json`; `<homeDir>/.claude/plugins/x/hooks/register.ts`; each shell profile of the list under `homeDir`, including `Documents/PowerShell/Microsoft.PowerShell_profile.ps1` and `Documents/WindowsPowerShell/profile.ps1`; `../.claude/settings.json` style paths.
- [ ] Not-protected rows (no result): `hooks/register.ts`, `hooks/policy.ts`, `src/../hooks/register.ts`, `types/index.d.ts`, `tests/policy.test.ts` and `.claude-plugin/plugin.json` under `projectDir`; `settings.json` outside a `.claude` directory; a look-alike such as `.bashrc.bak`.
- [ ] `.claude/skills/x/SKILL.md`, `.claude/CLAUDE.md`, `.claude/settings.txt` (not a `settings*.json` file, so only the rest-of-`.claude` ask applies) and `<homeDir>/.claude/agents/a.md` return ask, not allow.
- [ ] Auto-memory rows: `<homeDir>/.claude/projects/p/memory/MEMORY.md` and `<homeDir>/.claude/projects/p/memory/note.md` return ask for every covered tool (by design, no exception; Draft 13 documents the prompt on every memory save). Negative: `<homeDir>/.claude/projects/p/memory/settings.json` is not a settings file of `.claude` itself (it is not directly inside a `.claude` folder) and also asks, not denies.
- [ ] Tool coverage: every covered tool returns the same deny for a protected path and the same ask for an ask path: `edit_file`, `save_file`, `append_file`, `delete_this_file` (`file_path`), `delete_directory` (`dir_path`), `move_file` (the path as source, and as destination) and native `Edit` and `Write`. A prefixed name such as `mcp__plugin_x_mcp-workspace__edit_file` is covered; `Read` and `Bash` are not.
- [ ] Directory rows: `delete_directory` and `move_file` (source) on `.claude` return deny (it contains `settings.json`), on `<homeDir>/.claude/plugins` return deny, on `.` return deny, on `scripts` return ask, on `.github` and `.github/workflows` return ask, on `.git` and `.git/hooks` return ask. `.` (the project root) always denies, because the root contains the fixed entry `.claude/settings.json`; containment counts that entry whether or not the project has such a file, so there is no ask case for `.`.
- [ ] A covered call whose path field is missing, `undefined` or not a string (for example a number) returns ask (negative row: not allow, not nothing).
- [ ] Escaping-path rows, fixture `projectDir` = `C:\Users\x\proj`, `homeDir` = `C:\Users\x`: `../.claude/settings.json` resolves to `C:\Users\x\.claude\settings.json` and returns deny; `src/../../package.json` resolves to `C:\Users\x\package.json`, which is outside the project and matches no entry, so the guard returns nothing.
- [ ] Drive-less and UNC rows, same fixture, each returning deny: `\Users\x\.bashrc` and `/Users/x/.claude/settings.json` (resolved against drive `C:`); `\\?\UNC\server\share\.claude\settings.json` gives the same result as `\\server\share\.claude\settings.json` (use `projectDir` `\\server\share`). With a `projectDir` that has no drive letter (`/home/u/proj`), `/home/u/.bashrc` with `homeDir` `/home/u` returns deny.
- [ ] Normalisation rows (fixture `projectDir` = `C:\Users\x\proj`, `homeDir` = `C:\Users\x`; each result equals the plain form): `.claude\settings.json` and `.claude/settings.json` give the same result; mixed separators (`.claude/skills\x/SKILL.md`); upper case (`.CLAUDE/Settings.JSON`, `PACKAGE.JSON`) matches by case-folding; an absolute path with a different drive-letter case (`C:\...` and `c:\...`) and a UNC path match the same entry; `.` and `..` segments resolve (`./package.json`, `src/../package.json`, `scripts/../eslint.config.js`).
- [ ] Normalisation order rows (fixture as above), each expected deny: `.claude::$INDEX_ALLOCATION\settings.json` (a stream suffix on a non-last segment), `.claude\x\.. \settings.json` (trailing space on `..`, then folded) and `.claude\. .\settings.json` (a segment that strips to empty is dropped). The order of the five normalisation steps is pinned by these rows.
- [ ] Drive-relative rows (`projectDir` `C:\Users\x\proj`): `C:.claude\settings.json` returns deny (resolved against `projectDir`); `C:package.json` returns ask (project file); `D:.claude\settings.json` returns ask with the "cannot verify" message; with a `projectDir` without a drive letter, `C:x` returns ask.
- [ ] Windows form rows, each against a deny entry (result deny, same as the plain form): `.claude\settings.json.`, `.claude\settings.json. .`, `.claude\settings.json::$DATA`, `.claude\settings.json:stream`, `\\?\C:\proj\.claude\settings.json` and `\\.\C:\proj\.claude\settings.json` (with `projectDir` `C:\proj`), `/c/Users/x/.bashrc` with `homeDir` `C:\Users\x`, and `C:\Users\x\.bashrc` with a Git Bash `homeDir` `/c/Users/x`. Negative: `.claude\settings.json.bak` is not denied (it is an ask path, like the rest of `.claude`).
- [ ] Context normalisation rows: the decision does not depend on the form of the context values. `configPath` `C:/USERS/X/.Config\Mode-Gate/config.json` (mixed separators, other case) still denies the tool path `c:\users\x\.config\mode-gate\config.json`; an absolute `logDir` with a trailing dot or a `\\?\` prefix still denies a file under it; a Git Bash `projectDir` `/c/Users/x/proj` still asks for `C:\Users\x\proj\package.json`.
- [ ] Ask rows for the extra entries, for every covered tool: `.git/hooks/pre-commit`, `.git/config`, `.git/HEAD`, `.git/refs/heads/x`, `.git/info/attributes`, `.github/workflows/ci.yml`, `.mcp.json` under `projectDir`, and `<homeDir>/.claude.json`. Negative: `.gitignore`, `.gitattributes`, `.github/dependabot.yml`, `src/.mcp.json` and `<homeDir>/.claude.jsonl` are not asked.
- [ ] `.npmrc` rows, for every covered tool, each returning ask: `.npmrc` under `projectDir`, `src/sub/.npmrc`, `<homeDir>/.npmrc`, and an absolute `.npmrc` outside both (`D:\other\.npmrc`), also with mixed case (`.NPMRC`) and Windows forms (`.npmrc.`, `.npmrc::$DATA`). Negative: `.npmrc.bak`, `npmrc`, `x.npmrc` and `docs/npmrc.md` are not asked.
- [ ] Containment limit rows: `delete_directory` on `src` returns nothing, even if a nested `src/x/.claude` or `src/x/.npmrc` exists (documented limit).
- [ ] Symlink rows (the `resolved` input): a spelled path `docs/notes.md` with `resolved` `{ file_path: '<homeDir>/.claude/settings.json' }` returns deny; a spelled path that is harmless with a `resolved` path under `.git/` returns ask; a spelled protected path with a harmless `resolved` path still returns deny (either hit decides); no `resolved` entry means the spelling alone decides; a two-level-deep new path under a symlinked protected folder (spelled `link/newdir/hooks/x.ts`, `resolved` `<homeDir>/.claude/plugins/newdir/hooks/x.ts`) returns deny; `resolved` for `move_file` checks both `source_path` and `destination_path`; deny beats ask when the spelling and the resolved path hit different entries. Windows form rows also run on `resolved`. Negative: a hard-link spelling or a case alias that `resolved` does not reveal is not caught (documented limit).
- [ ] Wiring test with a fake `$.fs`: `register.ts` calls `stat` with `{ resolve: true }` for each path field of a covered call and for no other tool, passes `realPath` as `resolved`, walks up to the nearest existing ancestor when `stat` rejects for a missing target and appends the remaining segments (fake `$.fs` where `link` exists and `link/newdir` does not: `link/newdir/hooks/x.ts` resolves to the real path of `link` plus `newdir/hooks/x.ts`), and passes no entry when resolution fails, the walk reaches the root, or `realPath` is absent.
- [ ] Ask-paths guard: each of `package.json`, `scripts/check.mjs` and the eight tool configs returns ask for every covered tool (`move_file` as source and as destination, `delete_directory` on `scripts`; `.` is covered by the directory rows and denies). Negative rows: `src/package.json.bak` style look-alikes and other files are not asked by this guard (the verdict is unchanged). `scripts\check.mjs` returns ask. No profile allow turns the ask into allow, and a protected-path deny or a profile deny still wins over ask.
- [ ] `redirectHint('git status')` returns text naming the read-only `git` tool; `redirectHint('cat file')` names `read_file`.
- [ ] A command missing from the hint table gets a generic redirect that still names the tool class (`redirectHint` returns `undefined` only for input that needs no redirect, such as an empty command).
- [ ] A subagent Bash call (an event with an agent id, no active allow rule for it) returns deny, and the hook result built by the shared path carries the `redirectHint` text in `message` (wiring test added by this draft, with the real `redirectHint`; it builds on Draft 12 and needs no Draft 06).
- [ ] No profile can unlock a protected path.
- [ ] Gates: `hooks/guards.ts` is in the coverage include list of `vitest.config.ts` and `npm run test:coverage` reaches 95% on it (and still on the other listed modules); it is in the Stryker `mutate` list and `npm run test:mutation` stays above the `break` threshold of 75; a dependency-cruiser rule makes `hooks/guards.ts` import nothing (`npm run arch` passes).
- [ ] Documentation criteria that Draft 13's README and `SECURITY.md` text must satisfy: they state the known gaps (other write routes, hard links, PowerShell as a documented gap), the containment limit (including nested `.npmrc`), that symbolic links are resolved best effort, the new ask entries (`.npmrc`, `.github/workflows/**`, `.git/**`), and that `tests/**`, `hooks/` and `types/` are deliberately unprotected. Draft 13 owns that text.
- [ ] `npm run check` passes.

## How to start

First failing test in `tests/guards.test.ts`: the protected-path guard returns a `deny` result for `Edit` of `.claude/settings.json`, and also for `Edit` of `src/../.claude/settings.json`.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 03, Draft 12 (the shared path that calls the guards; Draft 04 and Draft 02 come before it). Draft 01 for assumptions 8, 9 and 19.

## References

- [Protected paths](../design.md#protected-paths)
- [Decision order](../design.md#decision-order)
- [Threat model](../design.md#threat-model)
- [Security model](../design.md#security-model)
- [Goals and non-goals](../design.md#goals-and-non-goals)
- [API notes](../mods-api-notes.md)
