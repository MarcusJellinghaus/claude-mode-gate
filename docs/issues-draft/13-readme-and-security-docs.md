# README and SECURITY.md

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax. The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES` (for example `issues,git-write`).

This is Draft 13 of 13 (plan: Draft 00). It writes the user documentation: the README and `SECURITY.md`. Drafts 05, 06 and 07 only supply documentation acceptance criteria that this text must satisfy; this draft owns the text.

## Design decisions this issue relies on

- The docs state facts from the final design (`docs/design.md`) and from the merged drafts. They never promise more than the mod does: no claim that force pushes are blocked, that `bypassPermissions` agents are gated (unless Draft 01 verified assumption 11), that Claude cannot rewrite "the policy" in general, or that PowerShell is gated.
- Version 1 gates Claude's tool calls only. It is a mistake and prompt-injection guard, not a sandbox and not a defence against an adversary who can write code and run it.
- Examples in the README come from test rows, so they are checked. The `claude -p` example is the exception: it is a manual example, not covered by a test row, and the README marks it so.
- Prior art to borrow: Flightdeck's "what it can reach" README section.

## Existing code

- `README.md`: exists with placeholder text; `scripts/check-docs.mjs` fails a release (`RELEASE=1`) if placeholders such as `_To be written._` remain. `SECURITY.md` exists without the known gaps. `CHANGELOG.md` must have `## Unreleased`.
- `.markdownlint-cli2.jsonc`, `npm run docs:lint`, lychee link check in `.github/workflows/ci.yml` (it checks `./*.md` only).
- Status of the API assumptions: the Status column of the assumptions table in `docs/design.md` (written by Draft 01 and the earlier verification).

## Goal

Document what the mod can reach, what it allows, how to use it, and where its limits are, in the README and `SECURITY.md`.

## Scope

**README content.**

- Sections "what it can reach" and "what it allows", with usage examples (`/gate-on git-write`, `MODE_GATE_PROFILES=issues,git-write claude -p ...`, `/gate-why`, `/gate-explain` with Bash text, with JSON input and with `--agent <id>`). The examples are copied from the test rows of Drafts 04, 07, 08 and 09. The `claude -p` example is marked manual.
- "What it can reach": the baseline's reach (the mcp-workspace read tools in the baseline, not all reads: the two GitHub reads `github_label_list` and `github_subissue_list` belong to the `issues` profile; ALL mcp-workspace write tools: `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`, where git restores tracked files but deleting an untracked file cannot be undone; the fixed `npm run` check scripts plus the `npm run test -- *` prefix, whose arguments are not restricted; Skill and Agent; web fetch and search, which can leak data and carry injected instructions); what each built-in profile adds (`git-write` the git writes, `issues` the GitHub writes); what stays unprotected (the known-gaps list below). The `issues` profile hardcodes the `mcp-workspace` server name (`mcp__mcp-workspace__*`), so users of another server define their own profile.
- Threat model: the mod guards against mistakes and prompt injection. It does not stop an adversary who can write code and run it: Claude can write a test file under `tests/` and run it with the allowed `npm run test`. The working-tree `hooks/`, `tests/` and `types/` are deliberately unprotected so the mod can be developed with itself active, although `npm run test` and `npm run check` execute them. The mod protects the installed copy (the config, the log folder, the installed plugin folder, the settings files and shell profiles) from the covered write tools, and never claims that Claude cannot rewrite "the policy" in general.
- Rule syntax: profiles use a **subset** of Claude Code's rule syntax: exact rules and a trailing ` *` prefix rule. A mid-string `*` is rejected with a message (for example `Bash(git push * --force)`). Globs in deny and ask rules are planned.
- Bash matching: a Bash command with any character from `BASH_METACHARACTERS` (Draft 03; the README shows the characters in a table: ampersand, semicolon, pipe, dollar sign, parentheses, backtick, less-than and greater-than signs, newline; the backslash is not one) does not match an allow rule, so it asks; a commit message is included. A subagent's unmatched Bash call is denied (decision order step 1), and a headless run turns the ask into a deny. Example: `git commit -m "a;b"` asks.
- Baseline asks and prompts:
  - The mod asks for `npm ci` and `npm install` because they run install scripts: no rule allows them, so the Bash downgrade turns them into asks. A Claude Code allow rule in `settings.json`, such as this repo's `Bash(npm ci)`, does not override the mod's ask while the mod is active.
  - The path-guard tiers, listed in full (or as a summary with a pointer to `docs/design.md`, Protected paths; check against that section and Draft 05 and use the real lists). **Deny** (the covered write tools): the mod's config file and the log folder; `settings*.json` inside any `.claude` folder, in the project and the home folder; `~/.claude/plugins/**`; the shell profiles in the home folder (`.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.config/fish/config.fish`, and the PowerShell `*profile*.ps1` files under `Documents/PowerShell` and `Documents/WindowsPowerShell`). **Ask**: the rest of `.claude/` (skills, agents, `CLAUDE.md`) in the project and the home folder; in the project `package.json`, `scripts/`, the tool configs, `.mcp.json`, `.github/workflows/**` and everything under `.git/`; any file named `.npmrc` at any directory level; `~/.claude.json`; and Claude Code's auto-memory under `~/.claude/projects/*/memory/**`. They ask because the allowed scripts and git run those files, or because `.mcp.json` and `~/.claude.json` can launch programs.
  - Claude Code's auto-memory (`~/.claude/projects/*/memory/**`) lies under `~/.claude/**`, so every memory write asks. This is by design; there is no exception.
  - The skills' advice to stage explicit paths (never `git add -A`) is advice, not enforcement: `git-write` allows `git add *`, and the v1 grammar cannot tell `git add .` from `git add file`.
- Subagents (Draft 06): the first line of the Agent call prompt is `mode-gate-profiles: name1, name2`; an absent or empty marker means baseline only; an invalid assignment (profile not held, not delegable or unknown) denies the Agent call; the main session's deny and ask lists also apply to subagents; any call with an agent id is treated as a subagent call, engine forks and teammates included, so a fork's Bash command outside the baseline is denied; the enforcement limit below.
- Headless (Drafts 04 and 12): profiles are fixed at start through `MODE_GATE_PROFILES`, read once per process; headless is detected from `isInteractive` (false for `-p` and the SDK). A call that would ask because of an active rule, a guard, the Bash downgrade or malformed input is denied, with a message naming the profile that would allow it. An ask that is Claude Code's own stays an ask, and Claude Code resolves it.
- `/gate-explain` (Draft 08): it decides as if Claude Code allows the call (Claude Code's own verdict is not asked in a dry run); `--agent` results and headless-converted results are approximations; non-deny results carry a note per source: a result from an active allow rule (or an ask from a rule, guard, Bash downgrade or malformed input) says "unless Claude Code denies", and a result from the stand-in verdict (an unmatched non-Bash call, source `claude-code`) says "unless Claude Code denies or asks". The log (Draft 07): `logs/mode-gate.log.jsonl`, a window of the last 1000 verdicts, no arguments recorded; two sessions that share a folder can lose entries.
- Status line: replace "design stage, nothing is built yet" with the state after this issue (version 0, pre-release; features of Drafts 01 to 12 implemented). Minimum supported Claude Code version: 2.1.292 (older versions are untested).

**SECURITY.md content.** The threat model above; the known gaps and limits below; the ask tier (the baseline asks and the memory prompts) and the deny tier, as listed above; the conditional limitations; and how to report a vulnerability (as it already stands). It also states, as plain sentences:

- Only the user switches profiles, and the mod registers no tool for it.
- A repo cannot set the starting profiles (they come from the user's environment), and a project `.mode-gate.json` holds proposals only; its profiles are never active.
- The mod does not defend against other mods (install only trusted mods).
- The mod does not protect against anything done outside Claude's tool calls.

**Known gaps and limits** (both documents state them):

- other write routes: **PowerShell is a documented gap**, because v1 gates Bash only (a user can add a Claude Code `PowerShell` deny rule in `settings.json`; this option is untested); the native NotebookEdit; other servers' file tools; hard links; `CLAUDE_CONFIG_DIR` relocation. Symbolic links are resolved on the covered write tools, best effort (hard links, case aliases and volume spellings keep their own spelling);
- `tests/**`, `hooks/` and `types/` are unprotected and run under the allowed npm scripts;
- the directory containment limit: the path guard is pure and finds only fixed-path protected entries, so deleting or moving a directory is checked against those fixed entries, but a protected file nested inside an arbitrary subdirectory (a `.claude/settings.json` or an `.npmrc`) is not found (for example `delete_directory` on `src` is not caught if `src/x/.claude/settings.json` exists);
- the subagent enforcement limit: the deny is Bash-only, and an unmatched non-Bash call keeps Claude Code's verdict (allow in a `bypassPermissions` agent);
- the exactness limits of `/gate-explain` (above);
- `git-write` allows only the exact form `git push`; every other push asks, force pushes (`--force-with-lease` included) and `git push -u origin HEAD` among them. A force form does not match an allow rule (a subagent's unmatched Bash call is denied; a headless run turns the ask into a deny). The docs must not claim that force pushes are blocked: an owner who approves the ask can overwrite remote history. The first push of a new branch needs `git config push.autoSetupRemote true`;
- `issues` cannot restrict arguments: `reference_name` (a write to another repository) and `state: closed` pass;
- the mod is built for the default permission modes (auto and bypass are out of scope);
- a commit message with a shell metacharacter (parentheses, `<`, `>`, `;`, `$`, backticks), or passed by heredoc, does not match `git-write`'s allow rule and asks. Keep messages to one line without these characters. `git commit -F <path>` with a message file also matches, if a longer message is needed;
- the arguments of `npm run test -- *` are not restricted.

**Conditional limitations.** The outcomes come from the Status column of the assumptions table in `docs/design.md`. The docs word each limitation from its Status: `verified` is stated as a fact; `documented` as "documented but not observed"; `partly verified` as the verified part plus the open part; `failed` as the limitation and the fallback; `open` as "not yet known". What each failure means:

- 2 fails (no agent id on the events): the subagent-Bash deny is inert.
- 10 fails (no agent id tied to the Agent call): no assignment is possible, so the `mode-gate-profiles:` marker is inert and subagents get the baseline only.
- 11 fails (hooks do not run for `bypassPermissions` agents): the docs must NOT claim such agents are gated. Draft 01's stop-and-ask rule applies before release.
- 9 (where an installed plugin is stored): the installed copy is protected only under `~/.claude/plugins/**`. A mod loaded with `--plugin-dir` lives elsewhere, so its copy is **not** protected, and headless `-p` runs need `--plugin-dir` (hot reload cannot be asked there). Word it from the Status column.
- 18 (a module that fails to load): nothing is gated. The failure is reported only in the transcript on hot reload, in `claude --debug` otherwise, and on stderr under `claude -p`.

## Out of scope / later

Docs for later items (parameterised profiles, replay, PowerShell gating). Marketplace listing text.

## Acceptance criteria

- [ ] README "what it can reach" and "what it allows" have the content defined in Scope (baseline reach: the mcp-workspace read tools in the baseline, with the two GitHub reads `github_label_list` and `github_subissue_list` credited to `issues`, including all mcp-workspace write tools and the untracked-delete caveat, each profile's additions, the unprotected known gaps), and the README says the mod is built for the default permission modes.
- [ ] README and SECURITY.md state every gap and limit in Scope, including PowerShell as a documented gap with the optional `PowerShell` deny rule in `settings.json` marked untested, symbolic links resolved best effort, and the directory containment limit with nested `.claude/settings.json` and `.npmrc`.
- [ ] README and SECURITY.md state the threat model: mistakes and prompt injection, not an adversary who can write code and run it (the test-file example), the unprotected `hooks/`, `tests/` and `types/`, and no claim that Claude cannot rewrite "the policy" in general.
- [ ] README (and SECURITY.md for the ask tier) state: `npm ci` and `npm install` ask because no rule allows them (the Bash downgrade), and a Claude Code allow rule in `settings.json` does not override the mod's ask while the mod is active; edits to `.npmrc`, `.github/workflows/**` and `.git/**` ask; every write to Claude Code's auto-memory asks, by design, with no exception; staging explicit paths in the skills is advice, not enforcement.
- [ ] README states that the profile rule syntax is a subset of Claude Code's (exact and trailing ` *`) and that a mid-string `*` is rejected, with `Bash(git push * --force)` as the example.
- [ ] README lists the Bash metacharacters in a table (names and characters, matching `BASH_METACHARACTERS`, backslash not included), says a Bash command containing one does not match an allow rule so it asks, and that a subagent's unmatched Bash call is denied and a headless run turns the ask into a deny.
- [ ] README documents the `mode-gate-profiles:` marker and the Subagents behaviour listed in Scope, including the Bash-only enforcement limit and that engine forks and teammates are treated as subagents.
- [ ] README states the headless behaviour listed in Scope (including the `isInteractive` detection and that a Claude Code ask stays an ask).
- [ ] README documents `/gate-explain` (raw-argument spacing is kept; the stand-in Claude Code verdict; exactness limits; the per-source note: "unless Claude Code denies" for a result from an active allow rule, "unless Claude Code denies or asks" for a result from the stand-in verdict) and the log (window of 1000 verdicts, concurrent sessions can lose entries, no arguments).
- [ ] README and SECURITY.md document the conditional limitations for assumptions 2, 9, 10, 11 and 18, worded from the Status column of the assumptions table with the mapping in Scope (for 9: a `--plugin-dir` mod is outside `~/.claude/plugins/`, so its copy is not protected, and headless `-p` runs need `--plugin-dir`), and never claim that `bypassPermissions` agents are gated unless assumption 11 is `verified`.
- [ ] README and SECURITY.md list the full path-guard tiers (the deny tier and the full ask tier as in Scope, checked against `docs/design.md`, Protected paths, and Draft 05), or give a summary with a pointer to that section; the ask tier is not limited to `.npmrc`, `.github/workflows/**` and `.git/**`.
- [ ] SECURITY.md states: only the user switches profiles and the mod registers no tool for it; a repo cannot set starting profiles and a project `.mode-gate.json` holds proposals only; the mod does not defend against other mods (install only trusted mods); the mod does not protect against anything done outside Claude's tool calls.
- [ ] README and SECURITY.md state that every force form, `--force-with-lease` included, does not match an allow rule, so it asks, and that an approved force push can overwrite remote history. Neither document claims that force pushes are blocked.
- [ ] README states that a commit message with a shell metacharacter, or passed by heredoc, asks, recommends one-line messages without them, and states that the first push of a new branch needs `git config push.autoSetupRemote true`. It documents the exact `git-write` push forms, and that `reference_name` and `state: closed` cannot be restricted in v1.
- [ ] README examples are copied from `tests/fixtures` or the test rows of Drafts 04, 07, 08 and 09 (the example outputs for `/gate-on` and `/gate-why` come from the rows of Draft 04 and Draft 07), except the `claude -p` example, which the README marks as a manual example.
- [ ] README replaces the "design stage, nothing is built yet" status line with the actual state (version 0, pre-release; the features of Drafts 01 to 12 implemented), says the `issues` profile hardcodes the `mcp-workspace` server name, and states the minimum Claude Code version 2.1.292.
- [ ] CHANGELOG.md is updated.
- [ ] `npm run docs:lint`, `npm run check:docs` and `npm run check` pass.

## How to start

Read `docs/design.md` (Baseline, Protected paths, Security model, Assumptions) and the merged drafts. Write the README sections in the order of Scope, then `SECURITY.md`, then run `npm run docs:lint`.

## Working rules

Concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push to the `readme-and-security-docs` branch after each major change. Branch from `main`.

**Stop and ask** means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. Leave the work uncommitted.

## Depends on

Drafts 01 to 09 and Draft 12: the docs describe their commands, the assignment marker, the log, explain and the profiles, and use Draft 01's Status column for the conditional limitations.

## References

- [Baseline](../design.md#baseline)
- [Threat model](../design.md#threat-model)
- [Matching](../design.md#matching)
- [Protected paths](../design.md#protected-paths)
- [Permission modes](../design.md#permission-modes)
- [Assumptions](../design.md#assumptions)
- [Open items](../design.md#open-items)
- [Prior art](../design.md#prior-art)
