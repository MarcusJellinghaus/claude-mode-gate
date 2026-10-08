# Guards: protected paths and the Bash redirect

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** use `MODE_GATE_PROFILES`.

This is Draft 05 of 11 (plan: Draft 00). The rule that makes the whole mod trustworthy is that Claude cannot rewrite the policy. This issue supplies the data for steps 1 and 2 of the decision order and the hook that applies it.

## Design decisions this issue relies on

**Decision order** (first match wins): (1) a subagent calls Bash and holds no profile with a Bash rule for it: deny, with the redirect message; (2) Edit or Write targets a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) unmatched calls keep Claude Code's verdict. A Claude Code deny is never overridden.

**Protected paths.** Deny Edit and Write on: the mod's config and source, `settings*.json`, hooks, shell profiles and the log folder (configurable, default `logs`). Ask for the rest of `.claude/` (skills, agents). Known gap, not closed in v1: other write routes (PowerShell, NotebookEdit, MCP file tools, symbolic links).

**Redirect message.** A denied subagent Bash call returns a message that names the approved MCP tool to use instead (for example `git status` maps to the read-only `git` tool, `cat file` to `read_file`). Goal 5 of the design: "A denied Bash call tells Claude which approved tool to use instead."

**Security model rows** this closes: "Claude edits the mod's source or config" (protected-paths deny), "Claude writes the variable into a profile" (protected-paths deny on shell profiles).

Assumptions (Draft 01 verifies): 2 (agent id on `tool.call`), 8 (settings files can define environment variables, so they must be protected), 9 (plugins live under `~/.claude/plugins/`, so that path is protected). If 9 fails, protect the real plugin folder found by the spike.

## Existing code

- `hooks/policy.ts`: pure (`Verdict` type only now; `decide` arrives in Draft 03). Add path normalisation and the lists here as pure functions, no `node:path` import, since policy may import nothing.
- `hooks/register.ts`: stub; the `tool.call` hook is wired in Draft 04.
- `.dependency-cruiser.cjs`: `policy-is-pure` forbids imports from `policy.ts`. `vitest.config.ts`: 95% coverage on `policy.ts`. `stryker.config.json`: mutation break at 75.
- `CLAUDE.md` "Testing strategy": test protected paths including relative paths and `..`, and give every security rule a negative test.

## Goal

Block Edit and Write on the mod's own files, ask for the rest of `.claude/`, and redirect denied subagent Bash calls to the right MCP tool.

## Scope

- Protected-path lists (deny and ask), including the configured log folder.
- Normalise paths: relative paths, `.`, `..`, mixed separators and case on Windows, before matching.
- A hint table mapping common Bash commands to the approved MCP tool, plus a generic redirect.
- Document the known gap in the README and `SECURITY.md`.

## Out of scope / later

Closing the other write routes. Protecting by symlink resolution.

## Open questions

- Pure code cannot read the file system, so symlinks are not resolved. Accept, and list in the known gap?

## Acceptance criteria

- [ ] Tests exist first, with a negative row per protected entry.
- [ ] `../.claude/settings.json` and `src/../hooks/register.ts` style paths are denied.
- [ ] `.claude/skills/x/SKILL.md` returns ask, not allow.
- [ ] A subagent Bash call returns deny with a message naming an MCP tool.
- [ ] A command missing from the hint table gets a generic redirect that still names the tool class.
- [ ] No profile can unlock a protected path.
- [ ] The known gap is in the README and `SECURITY.md`.
- [ ] `npm run check` passes.

## How to start

First failing test in `tests/policy.test.ts`: `Edit` of `hooks/policy.ts` returns deny, and `Edit` of `src/../hooks/policy.ts` also returns deny.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 03, Draft 04. Draft 01 for assumptions 2, 8 and 9.

## References

- [Protected paths](../design.md#protected-paths)
- [Decision order](../design.md#decision-order)
- [Security model](../design.md#security-model)
- [Goals and non-goals](../design.md#goals-and-non-goals)
