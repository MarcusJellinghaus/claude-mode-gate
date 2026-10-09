# First profiles and README

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few undoable project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in Claude Code rule syntax (`mcp__server__tool` for a whole MCP tool, `Bash(git commit *)` for a prefix, `Bash(git push)` for an exact command). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES` (for example `issues,git-write`).

This is Draft 09 of 11 (plan: Draft 00). It ships the first two profiles and the user documentation (README and SECURITY.md).

## Design decisions this issue relies on

- Git writes (`add`, `commit`, `push`, `checkout -b`) are not in the baseline. The `git-write` profile allows them. All other Bash asks.
- An allow rule for Bash is strict. An exact rule matches by equality, a prefix rule by `startsWith`, and neither matches a command that has any of `& ; | $ ( ) \` < >`or a newline. So`git commit -m x && rm -rf .`does not match`Bash(git commit *)`.
- The v1 grammar cannot say "git push, but not with `--force`". A mid-string `*` is a rule error. A bare `--force` deny would also match unrelated commands such as `rm --force`. A prefix allow `git push *` would let `git push origin main --force` through. So `git-write` allows only **exact** push forms; every other push falls through and asks (source `bash-downgrade`). Parameterised profiles (a later item in the design) can widen this.
- Issue and GitHub work uses typed mcp-workspace tools, not Bash text. Version 1 matches MCP tools by whole-tool name, so arguments cannot be restricted (`reference_name`, `state: closed`). Matching by argument (for example `issues 123`) is later.
- Both built-in profiles are `delegable: true` (the schema default). Draft 06 enforces delegation; the owner can change it by replacing a built-in in the user config.
- Permission modes: auto and bypass are out of scope; the README says the mod is built for the default modes.
- Prior art to borrow: Flightdeck's "what it can reach" README section.

## Existing code

- `README.md`: exists with placeholder text; `scripts/check-docs.mjs` fails a release (`RELEASE=1`) if placeholders such as `_To be written._` remain. `SECURITY.md` exists without the known gaps. `CHANGELOG.md` must have `## Unreleased`.
- `hooks/builtin-profiles.ts` (Draft 02) holds the two profiles as empty placeholders of raw rule strings: `{ name, description (non-empty), delegable, allow, ask, deny }`. This draft fills them in. `/gate-check` (Draft 02/04) should pass on both.
- `.claude/skills/` and `.claude/agents/` show which mcp-workspace GitHub tools the workflow uses; list tool names from the real mcp-workspace tool list, not memory.
- `.markdownlint-cli2.jsonc`, `npm run docs:lint`, lychee link check in `.github/workflows/ci.yml` (it checks `./*.md` only).

## Goal

Define `git-write` and `issues`, and document what the mod can reach and what it allows.

## Scope

- `git-write` allow: `Bash(git add *)`, `Bash(git commit *)`, `Bash(git checkout -b *)`, and the exact forms `Bash(git push)`, `Bash(git push -u origin HEAD)`, `Bash(git push --force-with-lease)`. `Bash(git commit)` is not added (it opens an editor).
- `issues` allow, whole-tool rules: `mcp__mcp-workspace__github_issue_create`, `github_issue_edit`, `github_issue_comment`, `github_pr_create`, `github_subissue_add`, `github_subissue_remove`, plus the reads `github_label_list` and `github_subissue_list` (not in the baseline).
- Both profiles `delegable: true`.
- README sections "what it can reach" and "what it allows", with usage examples (`/gate-on git-write`, `MODE_GATE_PROFILES=issues,git-write claude -p ...`, `/gate-why`). Examples are copied from `tests/fixtures` or the test rows, so they are checked; the example outputs for `/gate-on` and `/gate-why` are copied from the test rows of Draft 04 and Draft 07. The `claude -p` example and the replay example are the exceptions: they are manual examples, not covered by a test row, and the README marks them so.
- README usage examples required by Draft 08:
  - `/gate-explain` with Bash text (`/gate-explain Bash git commit -m "x"`), with JSON input (`/gate-explain mcp__mcp-workspace__edit_file {"file_path": ".claude/settings.json"}`) and with `--agent <id>`. These are copied from Draft 08's test rows.
  - `npm run replay -- <transcript.jsonl> [--profiles a,b]`, with the exactness notes (below). No fixture-based test row covers it, so it is a manual example and the README marks it so.
- README states that a commit message, or any Bash command, containing a shell metacharacter (`& ; | $ ( ) \` < >`or a newline) does not match an allow rule, so it asks. A subagent's unmatched Bash call is denied (decision-order step 1), and a headless run turns the ask into a deny (when headless is detectable). Example:`git commit -m "a;b"` asks (a row in the table below).
- README "what it can reach" states:
  - the baseline's reach: all reads, ALL mcp-workspace write tools (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`; deletes of untracked files cannot be undone), the fixed `npm run` check scripts, Skill and Agent, and web fetch and search (which can leak data and carry injected instructions);
  - what each built-in profile adds: `git-write` the git writes above, `issues` the GitHub writes above;
  - what stays unprotected: the known-gaps list below.
- README "Subagents" section (Draft 06): the first line of the Agent call prompt is `mode-gate-profiles: name1, name2`; an absent or empty marker means baseline only; an invalid assignment (profile not held, not delegable or unknown) denies the Agent call; the main session's deny and ask lists also apply to subagents; the enforcement limit below.
- README `/gate-explain` (Draft 08): when the command API gives only tokens, the command is rebuilt with single spaces, so odd spacing is not preserved.
- README and SECURITY.md, conditional limitations (Drafts 04 and 06) for assumptions 2, 10, 11 and 12. The outcomes come from the Status column of the assumptions table in `docs/design.md` (written by Draft 01). The docs word each limitation from its Status (Draft 01's statuses): `verified` is stated as a fact; `documented` as "documented but not observed"; `partial` as the partial outcome with its fallback; `failed` as the limitation and the fallback; `unknown` as "not yet known". What each failure means:
  - 2 fails (no agent id, or main and subagent calls not distinguishable): the subagent-Bash deny is inert.
  - 10 fails (no agent id tied to the Agent call): no assignment is possible, so the `mode-gate-profiles:` marker is inert and subagents get the baseline only.
  - 11 fails (hooks do not run for `bypassPermissions` agents): the docs must NOT claim such agents are gated. Draft 01's stop-and-ask rule applies before release.
  - 12 fails (headless not detectable): the headless ask-to-deny conversion is inert and every `ask` stays `ask`.
- README headless behaviour (base text): profiles are fixed at start through `MODE_GATE_PROFILES`. A call that would ask because of an active rule, a guard, the Bash downgrade or malformed input is denied, with a message naming the profile that would allow it (when detectable). An ask with source `default` or `claude-code` stays an ask, and Claude Code resolves it.
- README status line: replace "design stage, nothing is built yet" with the state after this issue (version 0, pre-release; features of Drafts 01 to 08 implemented). README also says the `issues` profile hardcodes the `mcp-workspace` server name (`mcp__mcp-workspace__*`), so users of another server define their own profile.
- SECURITY.md: the known gaps below.
- Both documents state these gaps and limits:
  - other write routes (PowerShell, NotebookEdit, other servers' file tools), symbolic links, and `CLAUDE_CONFIG_DIR` relocation;
  - `tests/**` is unprotected and runs under the allowed npm scripts;
  - the directory containment limit: the path guard is pure and finds only fixed-path protected entries, so deleting or moving a directory is checked against those fixed entries, but a protected file nested inside an arbitrary subdirectory is not found (for example `delete_directory` on `src` is not caught if `src/x/.claude/settings.json` exists);
  - the subagent enforcement limit: the deny is Bash-only, and an unmatched non-Bash call keeps Claude Code's verdict;
  - the exactness limits of `/gate-explain` and replay (Draft 08): Claude Code's own verdict is unavailable, so an unmatched call shows `ask` as an approximation; a `deny` is exact only for a main-session, non-headless call; sidechain, `--agent` and headless-converted results are approximations; non-deny results carry "unless Claude Code denies";
  - the working tree's `hooks/`, `types/` and `.claude-plugin/` are deliberately unprotected, so the mod can be developed with itself active, although `npm run test` and `npm run check` execute them;
  - `git-write` allows only the exact push forms listed; other pushes ask. `git push --force-with-lease` is allowed because the rebase workflow uses it, but it is a force push that can overwrite remote history. Every other force form does not match an allow rule, so it asks (a subagent's unmatched Bash call is denied, decision-order step 1; a headless run turns the ask into a deny, when headless is detectable). The docs must not claim that force pushes are blocked or that `--force-with-lease` asks;
  - `issues` cannot restrict arguments: `reference_name` (a write to another repository) and `state: closed` pass (README "what it allows" says so);
  - the mod is built for the default permission modes.
- Draft 09 owns the README and SECURITY.md text. Drafts 05 and 06 only supply documentation acceptance criteria that this text must satisfy.

## Out of scope / later

Parameterised profiles (`issues 123`, wider push forms). A typed commit and push tool.

## Acceptance criteria

- [ ] Tests run the real built-ins from `hooks/builtin-profiles.ts`: every rule string parses with `parseRule`, `description` is non-empty, and both profiles have `delegable: true`.
- [ ] Both profiles pass `/gate-check` with no findings.
- [ ] Rows through `decide` with `git-write` active. Claude Code's own verdict is UNAVAILABLE in the main table, so an unmatched Bash call asks with source `bash-downgrade`. Allow-matched rows are also run once with Claude Code's verdict `allow`: an active allow rule overrides a Claude Code `ask` (so `git commit -m "x"` is still `allow`) but never a deny. Add one row where Claude Code's verdict is `deny` for `git push` (result `deny`, from Claude Code) and one where it is `allow` for `git push origin main` (result `ask`, `bash-downgrade`).

  | Command                        | Verdict | Why               |
  | ------------------------------ | ------- | ----------------- |
  | `git push`                     | allow   | exact             |
  | `git push -u origin HEAD`      | allow   | exact             |
  | `git push --force-with-lease`  | allow   | exact             |
  | `git push origin main`         | ask     | not an exact form |
  | `git push origin main --force` | ask     | not an exact form |
  | `git push --force`             | ask     | not an exact form |
  | `git push -f`                  | ask     | not an exact form |
  | `git commit -m "x"`            | allow   | prefix            |
  | `git commit -m "a;b"`          | ask     | metacharacter     |
  | `git commit -m x && rm -rf .`  | ask     | metacharacter     |
  | `git add . && git push`        | ask     | metacharacter     |

- [ ] The ask rows above come from `bash-downgrade`. With `git-write` off, every row asks.
- [ ] Each of the eight `issues` tools is allowed with `issues` active. With it off, the six writes ask (source `default`, unmatched non-Bash). `github_label_list` and `github_subissue_list` are not in the baseline, so with `issues` off they also ask (source `default`), and with it on they are allowed. Rows cover both reads in both states. The list matches the real mcp-workspace tool names.
- [ ] README "what it can reach" and "what it allows" and SECURITY.md state every gap and limit in Scope (the directory containment limit as defined there), and the README says the mod is built for the default permission modes.
- [ ] README "what it can reach" has the defined content in Scope (baseline reach including all mcp-workspace write tools and deletes, each profile's additions, the unprotected known gaps).
- [ ] README documents the `mode-gate-profiles:` marker and the Subagents behaviour listed in Scope, including the Bash-only enforcement limit.
- [ ] README documents the token-join spacing limit of `/gate-explain`, and the exactness limits of explain and replay.
- [ ] README and SECURITY.md document the conditional limitations for assumptions 2, 10, 11 and 12 (inert subagent-Bash deny; inert marker with baseline-only subagents; no claim that `bypassPermissions` agents are gated; inert headless ask-to-deny conversion), worded from the Status column of the assumptions table with the mapping in Scope (`verified` as fact, `documented` as "documented but not observed", `partial` with its fallback, `failed` as limitation and fallback, `unknown` as "not yet known").
- [ ] README states the headless behaviour: profiles are fixed at start through `MODE_GATE_PROFILES`; a call that would ask because of an active rule, a guard, the Bash downgrade or malformed input is denied with a message naming the profile that would allow it (when detectable); an ask with source `default` or `claude-code` stays an ask and Claude Code resolves it.
- [ ] README states that a Bash command (a commit message included) with a shell metacharacter (`& ; | $ ( ) \` < >` or a newline) does not match an allow rule, so it asks; a subagent's unmatched Bash call is denied (decision-order step 1); a headless run turns the ask into a deny (when headless is detectable).
- [ ] README has `/gate-explain` examples (Bash text, JSON input, `--agent`) copied from Draft 08's test rows, and the `npm run replay -- <transcript.jsonl> [--profiles a,b]` example marked as manual (no fixture-based test row), with the exactness notes.
- [ ] README replaces the "design stage, nothing is built yet" status line with the actual state (version 0, pre-release; the features of Drafts 01 to 08 implemented), and says the `issues` profile hardcodes the `mcp-workspace` server name (`mcp__mcp-workspace__*`), so users of another server define their own profile.
- [ ] README and SECURITY.md state that `hooks/`, `types/` and `.claude-plugin/` in the working tree are deliberately unprotected (so the mod can be developed with itself active), although `npm run test` and `npm run check` execute them.
- [ ] README and SECURITY.md state that `git push --force-with-lease` is allowed by `git-write`, is a force push that can overwrite remote history, and that every other force form does not match an allow rule, so it asks (a subagent's unmatched Bash call is denied; a headless run turns the ask into a deny, when detectable). Neither document claims that force pushes are blocked.
- [ ] README documents the exact `git-write` push forms, and that `reference_name` and `state: closed` cannot be restricted in v1.
- [ ] README examples are copied from `tests/fixtures` or the test rows above (or Draft 08's rows for `/gate-explain`; the example outputs for `/gate-on` and `/gate-why` come from the test rows of Draft 04 and Draft 07), except the `claude -p` and replay examples, which the README marks as manual examples (not covered by a test row).
- [ ] CHANGELOG.md is updated.
- [ ] `npm run docs:lint`, `npm run check:docs` and `npm run check` pass.

## How to start

First failing test: with `git-write` active, `git commit -m "x"` is allowed and `git commit -m "x" && ls` asks.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push to the `first-profiles-and-docs` branch after each major change. Branch from `main`; the work starts after PR #1 is merged.

**Stop and ask** (used throughout this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. Leave the work uncommitted.

## Depends on

Draft 01 to Draft 08: Draft 01 (the Status column for the conditional limitations), Drafts 02 to 08 (the README documents their commands, the assignment marker, the log, explain and replay)

## References

- [Baseline](../design.md#baseline)
- [Matching](../design.md#matching)
- [Protected paths](../design.md#protected-paths)
- [Permission modes](../design.md#permission-modes)
- [Open items](../design.md#open-items)
- [Prior art](../design.md#prior-art)
