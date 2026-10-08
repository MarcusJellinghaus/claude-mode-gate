# First profiles and README

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool` for a whole MCP tool, `Bash(git commit *)` for a prefix). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES` (for example `issues,git-write`).

This is Draft 09 of 11 (plan: Draft 00). It ships the first two profiles and the user documentation.

## Design decisions this issue relies on

- Git writes (`add`, `commit`, `push`, `checkout -b`) are not in the baseline. The `git-write` profile allows them as Bash prefix rules. All other Bash asks.
- A Bash rule matches only if the command has none of `& ; | $ ( ) \` < >`and no newline. So`git commit -m x && rm -rf .`does not match`Bash(git commit *)`.
- Issue and GitHub work uses typed mcp-workspace tools, not Bash text. Version 1 matches MCP tools by whole-tool name, so the `issues` profile lists tool names. Matching by argument (for example `issues 123`) is later.
- Profiles marked non-delegable cannot be handed to a subagent; they go to the user. The first profiles' status is an open item in the design.
- Permission modes: auto and bypass are out of scope; the README says the mod is built for the default modes.
- Protected paths and the known gap (PowerShell, NotebookEdit, MCP file tools, symbolic links) must appear in the README.
- Prior art to borrow: Flightdeck's "what it can reach" README section.

## Existing code

- `README.md`: exists with placeholder text; `scripts/check-docs.mjs` fails a release (`RELEASE=1`) if placeholders such as `_To be written._` remain. `CHANGELOG.md` must have `## Unreleased`.
- Profile config location and schema come from Draft 02. `/gate-check` (Draft 02/04) should pass on both profiles.
- `.claude/skills/` and `.claude/agents/` show which mcp-workspace GitHub tools the workflow uses; list tool names from the real mcp-workspace tool list, not memory.
- `.markdownlint-cli2.jsonc`, `npm run docs:lint`, lychee link check in `.github/workflows/ci.yml` (it checks `./*.md` only).

## Goal

Define `git-write` and `issues`, decide which are non-delegable, and document what the mod can reach and what it allows.

## Scope

- `git-write`: `Bash(git add *)`, `Bash(git commit *)`, `Bash(git push *)`, `Bash(git checkout -b *)`.
- `issues`: the mcp-workspace GitHub issue and PR write tools (create, edit, comment, PR create, sub-issue add and remove, labels where applicable). Whole-tool rules.
- Non-delegable decision, recorded in `docs/design.md`.
- README sections "what it can reach" and "what it allows", plus usage examples: `/gate-on git-write`, `MODE_GATE_PROFILES=issues,git-write claude -p ...`, `/gate-why`.

## Out of scope / later

Parameterised profiles (`issues 123`). A typed commit and push tool.

## Open questions

- Should `git-write` allow `git push --force`? Owner decides. Recommend denying `--force` (and `-f`) and allowing only `--force-with-lease`.
- Which profiles are non-delegable? Recommend `git-write` delegable, `issues` non-delegable (it writes to a shared system), pending the owner's choice.

## Acceptance criteria

- [ ] Both profiles pass `/gate-check` with no findings.
- [ ] Negative test: `git commit -m x && rm -rf .` is not allowed by `git-write`.
- [ ] The `--force` decision is implemented and tested (deny `git push --force`, and `-f`, per the recommendation).
- [ ] The `issues` tool list matches the real mcp-workspace write tools.
- [ ] The non-delegable decision is in `docs/design.md` and enforced by Draft 06.
- [ ] README states the permission-mode limit and the known write-route gap.
- [ ] README examples run as written.
- [ ] CHANGELOG.md is updated.
- [ ] `npm run docs:lint`, `npm run check:docs` and `npm run check` pass.

## How to start

First failing test: with `git-write` active, `git commit -m "x"` is allowed and `git commit -m "x" && ls` asks.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push after each major change.

## Depends on

Draft 02, Draft 03, Draft 04, Draft 05

## References

- [Baseline](../design.md#baseline)
- [Matching](../design.md#matching)
- [Protected paths](../design.md#protected-paths)
- [Permission modes](../design.md#permission-modes)
- [Open items](../design.md#open-items)
- [Prior art](../design.md#prior-art)
