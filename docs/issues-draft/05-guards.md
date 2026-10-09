# Guards: protected paths and the Bash redirect

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 05 of 11 (plan: Draft 00). The rule that makes the whole mod trustworthy is that Claude cannot rewrite the policy. This issue supplies the guard data that `decide` (Draft 03) takes as input, and the hook that applies it.

## Design decisions this issue relies on

**Decision order** (first match wins): (1) a subagent calls Bash and no active allow rule matches this call: deny, with the redirect message; (2) Edit or Write targets a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) unmatched calls keep Claude Code's verdict. A Claude Code deny is never overridden. Guards compose with the rules and never override them: the protected-path deny is a step-2 deny, the ask-path guard is an ask source at step 3, and a guard never turns a deny into an ask or an allow.

**Guard results.** The guards are pure functions in a new module `hooks/guards.ts` (this issue owns it). `register.ts` calls them with the `call` (`{ toolName, input, agentId?, toolCallId? }`: the tool name, the tool input such as the file path, and the agent id and tool-call id when the event carries them; Draft 04 builds it) and a context `{ projectDir, logDir, configPath }` (the resolved values, built by Draft 04's shared path: `projectDir` is the session's working directory that Draft 04 records in `$.state` at `session.start`, `logDir` and `configPath` come from the `loadConfig` result; `configPath` may be `undefined`). The context lets the guards protect the log folder and the config file wherever they are. Each returns `{ kind: 'deny' | 'ask', message: string }`, or nothing. Draft 04 owns the one shared path through `decide` used by both `tool.call` and `tool.check`. It takes the guard results as an injected list (empty until this draft) and `redirectHint` as an injected function (a stub returning `undefined` until this draft), and passes the guard results to `decide` (Draft 03), which orders them against the rules and passes the `message` through. This draft supplies the real guards and the real `redirectHint` and plugs both in, replacing the stubs. This draft computes the paths and messages; `decide` does not.

**Protected paths.** Deny Edit and Write on: the mod's config and source, `settings*.json`, hooks, shell profiles, the log folder (`logDir` in the context; config key `logDir`, default `logs`, relative to `projectDir`) and the config file (`configPath` in the context, also when it is not in the default place, for example via `MODE_GATE_CONFIG`). Ask for the rest of `.claude/` (skills, agents). Known gap, not closed in v1: other write routes (PowerShell, NotebookEdit, MCP file tools, symbolic links).

**Ask paths.** The baseline asks before edits that touch `package.json`, anything under `scripts/`, or a tool config: `eslint.config.js`, `vitest.config.ts`, `stryker.config.json`, `.dependency-cruiser.cjs`, `knip.json`, `tsconfig.json`, `.markdownlint-cli2.jsonc`, `.prettierrc.json`. The allowed `npm run` check scripts execute these files, so an edit would let Claude run arbitrary code under an allowed command. Edits are the mcp-workspace write tools (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`) and the native `Edit` and `Write` tools. A call touches an entry if any of its paths (`file_path`, `source_path`, `destination_path`, `dir_path`) resolves to the entry, to a file under `scripts/`, or to a directory that contains an entry (for example `delete_directory` on `scripts` or `.`). This is a path guard, not a profile rule (the v1 grammar cannot express it), and it is an ask source at step 3: a profile allow does not remove the ask, but any deny wins over it (a protected-path deny, or a profile deny such as `deny *`).

**Redirect message.** `hooks/guards.ts` exports a pure function `redirectHint(command: string): string | undefined`, backed by the hint table. When `decide` returns `source` = `subagent-bash` (Draft 03; Draft 04 passes the agent id into `decide`, so this works before Draft 06), the shared path in `register.ts` (Draft 04) calls it and puts the text in the hook result's `message`; `decide` builds no redirect text. The text names the approved MCP tool to use instead (for example `git status` maps to the read-only `git` tool, `cat file` to `read_file`). Goal 5 of the design: "A denied Bash call tells Claude which approved tool to use instead."

**Security model rows** this closes: "Claude edits the mod's source or config" (protected-paths deny), "Claude writes the variable into a profile" (protected-paths deny on shell profiles).

Assumptions (Draft 01 verifies): 2 (agent id on `tool.call`), 8 (settings files can define environment variables, so they must be protected), 9 (plugins live under `~/.claude/plugins/`, so that path is protected). If 9 fails, protect the real plugin folder found by the spike.

## Existing code

- `hooks/policy.ts`: pure (`Verdict` type only now; `decide` arrives in Draft 03 and takes the guard results as input). Do not put the guards here. Create `hooks/guards.ts` with path normalisation and the lists as pure functions, no `node:path` import. It imports nothing; `register.ts` imports it.
- `hooks/register.ts`: Draft 04 wires `tool.call` and `tool.check` through one shared decision path with an injected guard list (empty until this draft) and tests it with fake guards. This draft plugs in the real guards.
- `.dependency-cruiser.cjs`: `policy-is-pure` forbids imports from `policy.ts`. `vitest.config.ts`: 95% coverage on `policy.ts`. `stryker.config.json`: mutation break at 75.
- `CLAUDE.md` "Testing strategy": test protected paths including relative paths and `..`, and give every security rule a negative test.

## Goal

Block Edit and Write on the mod's own files, ask for the rest of `.claude/` and for the files the check scripts execute, and redirect denied subagent Bash calls to the right MCP tool.

## Scope

- `hooks/guards.ts`: pure guard functions returning `{ kind: 'deny' | 'ask', message }` or nothing (see Guard results).
- Protected-path lists (deny and ask), including the configured log folder and the config file, taken from the guard context.
- The ask-paths guard (see Decisions): `package.json`, `scripts/` and the tool configs, for the mcp-workspace write tools and the native `Edit` and `Write`.
- Normalise paths: relative paths, `.`, `..`, mixed separators and case on Windows, before matching.
- A hint table mapping common Bash commands to the approved MCP tool, plus a generic redirect, exposed as `redirectHint(command)`.
- Document the known gap in the README and `SECURITY.md`.

## Out of scope / later

Closing the other write routes. Protecting by symlink resolution.

## Open questions

- Pure code cannot read the file system, so symlinks are not resolved. Accept, and list in the known gap?

## Acceptance criteria

- [ ] Tests exist first, with a negative row per protected entry. Path rows test the guards in `tests/guards.test.ts` directly, passing the context `{ projectDir, logDir, configPath }`, and check the returned `kind` and `message`.
- [ ] Context rows: Edit and Write are denied on a file under the context's `logDir` (the default `logs` and a custom one, relative and absolute) and on the context's `configPath` (also a custom path); a look-alike path is not denied; with `configPath` undefined the guard does not throw and still protects the other entries.
- [ ] Combination rows go through `decide` with the guard results: a `deny` result beats a profile allow, an `ask` result is beaten by a profile `deny *`.
- [ ] `../.claude/settings.json` and `src/../hooks/register.ts` style paths are denied.
- [ ] `.claude/skills/x/SKILL.md` returns ask, not allow.
- [ ] Ask-paths guard: each of `package.json`, `scripts/check.mjs` and the eight tool configs returns ask for `mcp__mcp-workspace__edit_file`, `save_file`, `append_file`, `move_file` (as source and as destination), `delete_this_file`, `delete_directory` (on `scripts` and on `.`), and for native `Edit` and `Write`. Negative rows: `src/package.json.bak` style look-alikes and other files are not asked by this guard (the verdict is unchanged).
- [ ] Ask-path rows cover `./package.json`, `src/../package.json`, `scripts/../eslint.config.js`, `scripts\check.mjs` and `src/../../package.json`; no profile allow turns the ask into allow, and a protected-path deny or a profile deny still wins over ask.
- [ ] `redirectHint('git status')` returns text naming the read-only `git` tool; `redirectHint('cat file')` names `read_file`.
- [ ] A command missing from the hint table gets a generic redirect that still names the tool class (`redirectHint` returns `undefined` only for input that needs no redirect, such as an empty command).
- [ ] A subagent Bash call (an event with an agent id, no active allow rule for it) returns deny, and the hook result built by `register.ts` carries the `redirectHint` text in `message` (wiring test added by this draft, with the real `redirectHint`; it builds on Draft 04 and needs no Draft 06).
- [ ] No profile can unlock a protected path.
- [ ] The known gap is in the README and `SECURITY.md`.
- [ ] `npm run check` passes.

## How to start

First failing test in `tests/guards.test.ts`: the protected-path guard returns a `deny` result for `Edit` of `hooks/policy.ts`, and also for `Edit` of `src/../hooks/policy.ts`.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 03, Draft 04. Draft 01 for assumptions 2, 8 and 9.

## References

- [Protected paths](../design.md#protected-paths)
- [Decision order](../design.md#decision-order)
- [Security model](../design.md#security-model)
- [Goals and non-goals](../design.md#goals-and-non-goals)
