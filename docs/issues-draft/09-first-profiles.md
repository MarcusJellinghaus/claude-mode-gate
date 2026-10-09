# First profiles: git-write and issues

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A fixed **baseline** allows reads, a few project writes and the check scripts. Named **profiles** add rules, each with `allow`, `ask` and `deny` lists in a subset of Claude Code's rule syntax (`mcp__server__tool` for a whole MCP tool, `Bash(git commit *)` for a prefix, `Bash(git push)` for an exact command). The user switches profiles with `/gate-on` and `/gate-off`, and inspects with `/gate-status`, `/gate-why`, `/gate-check` and `/gate-explain`. **Subagents** get the baseline plus assigned profiles. **Headless runs** take starting profiles from `MODE_GATE_PROFILES` (for example `issues,git-write`).

This is Draft 09 of 13 (plan: Draft 00). It ships the first two profiles with their tests. The user documentation (README and SECURITY.md) is Draft 13.

## Design decisions this issue relies on

- Git writes (`add`, `commit`, `push`, `checkout -b`) are not in the baseline (see `docs/design.md`, Baseline). The `git-write` profile allows them. All other Bash asks.
- Allow rules are strict (Draft 03): an exact rule matches by equality, a prefix rule by `startsWith`, and neither matches a command that contains any entry of `BASH_METACHARACTERS` (defined in Draft 03). So `git commit -m x && rm -rf .` does not match `Bash(git commit *)`.
- The v1 grammar cannot say "git push, but not with `--force`". A mid-string `*` is a rule error (the grammar is a subset of Claude Code's: only exact rules and a trailing ` *` or `:*`, which is the same thing). A bare `--force` deny would also match unrelated commands such as `rm --force`. A prefix allow `git push *` would let `git push origin main --force` through. So `git-write` allows only **exact** push forms; every other push falls through and asks (source `bash-downgrade`). Globs in deny and ask rules (a later item in the design) would allow a real force-push deny and wider push forms.
- Issue and GitHub work uses typed mcp-workspace tools, not Bash text. Version 1 matches MCP tools by whole-tool name, so arguments cannot be restricted (`reference_name`, `state: closed`). Matching by argument (for example `issues 123`) is later.
- Both built-in profiles are `delegable: true` (the schema default). Draft 06 enforces delegation; the owner can change it by replacing a built-in in the user config.
- Claude Code's own verdict reaches `decide` (Draft 03). The test tables run with the verdict `allow` (the case the Bash downgrade exists for) and, where stated, `ask` and `deny`.

## Existing code

- `hooks/builtin-profiles.ts` (Draft 02) holds the two profiles as empty placeholders of raw rule strings: `{ name, description (non-empty), delegable, allow, ask, deny }`. This draft fills them in. `/gate-check` (Drafts 02 and 04) should pass on both.
- `.claude/skills/` and `.claude/agents/` show which mcp-workspace GitHub tools the workflow uses; list tool names from the real mcp-workspace tool list, not memory.
- `CHANGELOG.md` must have `## Unreleased`.

## Goal

Define `git-write` and `issues`, and test them through `decide`.

## Scope

- `git-write` allow: `Bash(git add *)`, `Bash(git commit *)`, `Bash(git checkout -b *)`, and the exact form `Bash(git push)`. `Bash(git commit)` is not added (it opens an editor).
- `issues` allow, whole-tool rules: `mcp__mcp-workspace__github_issue_create`, `github_issue_edit`, `github_issue_comment`, `github_pr_create`, `github_subissue_add`, `github_subissue_remove`, plus the reads `github_label_list` and `github_subissue_list` (not in the baseline).
- Both profiles `delegable: true`, each with a non-empty description.
- A `CHANGELOG.md` line under `## Unreleased`.

## Out of scope / later

Parameterised profiles (`issues 123`, wider push forms). Globs in deny and ask rules. A typed commit and push tool. All README and SECURITY.md text (Draft 13).

## Acceptance criteria

- [ ] Tests run the real built-ins from `hooks/builtin-profiles.ts`: every rule string parses with `parseRule`, `description` is non-empty, and both profiles have `delegable: true`.
- [ ] Both profiles pass `/gate-check` (the validator of Draft 02) with no findings.
- [ ] Rows through `decide` with `git-write` active and the real baseline. The main table runs with Claude Code's verdict `allow`, so an unmatched Bash call becomes `ask` with source `bash-downgrade`. Allow-matched rows are also run once with Claude Code's verdict `ask`: an active allow rule overrides a Claude Code `ask` (so `git commit -m "x"` is still `allow`) but never a deny. Add one row where Claude Code's verdict is `deny` for `git push` (result `deny`, source `claude-code`, unchanged) and one where it is `allow` for `git push origin main` (result `ask`, `bash-downgrade`).

  | Command                        | Verdict | Why                                                   |
  | ------------------------------ | ------- | ----------------------------------------------------- |
  | `git push`                     | allow   | exact                                                 |
  | `git push -u origin HEAD`      | ask     | not an exact form                                     |
  | `git push --force-with-lease`  | ask     | not an exact form                                     |
  | `git push origin main`         | ask     | not an exact form                                     |
  | `git push origin main --force` | ask     | not an exact form                                     |
  | `git push --force`             | ask     | not an exact form                                     |
  | `git push -f`                  | ask     | not an exact form                                     |
  | `git commit -m "x"`            | allow   | prefix                                                |
  | `git commit -m "a;b"`          | ask     | metacharacter                                         |
  | `git commit -m x && rm -rf .`  | ask     | metacharacter                                         |
  | `git add . && git push`        | ask     | metacharacter                                         |
  | `git commit -F msg.txt`        | allow   | prefix                                                |
  | `git commit -m "x <a@b.c>"`    | ask     | metacharacter                                         |
  | `git commit -m "Fix x (y)"`    | ask     | metacharacter (parentheses)                           |
  | `git commit -F - <<'EOF'`      | ask     | metacharacter                                         |
  | `npm install`                  | ask     | no rule allows it (baseline has none): Bash downgrade |
  | `npm ci`                       | ask     | no rule allows it: Bash downgrade                     |

- [ ] The ask rows above all come from `bash-downgrade`. With `git-write` off, every row asks (`bash-downgrade`). `npm install` and `npm ci` ask with `git-write` on or off, and with Claude Code's verdict `allow` they are still downgraded (the point of the README sentence that `settings.json` allows do not override the mod's ask).
- [ ] Each of the eight `issues` tools is allowed with `issues` active (also with Claude Code's verdict `ask`). With it off and Claude Code's verdict `ask`, the six writes ask (source `claude-code`). `github_label_list` and `github_subissue_list` are not in the baseline, so with `issues` off they also ask, and with it on they are allowed. Rows cover both reads in both states. The list matches the real mcp-workspace tool names.
- [ ] Negative rows: a Claude Code `deny` for an `issues` tool stays `deny` with `issues` on; `git-write` does not allow `git push` for a subagent that was not assigned the profile (Bash from a subagent without the allow rule is denied, `subagent-bash`).
- [ ] `CHANGELOG.md` has a line for the two profiles under `## Unreleased`.
- [ ] `npm run docs:lint`, `npm run check:docs` and `npm run check` pass.

## How to start

First failing test: with `git-write` active, `git commit -m "x"` is allowed and `git commit -m "x" && ls` asks.

## Working rules

TDD, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work; Bash only for `npm run ...` and git add, commit and push. Run `npm run check` before each commit. Commit and push to the `first-profiles` branch after each major change. Branch from `main`; the work starts after PR #1 is merged.

**Stop and ask** (used throughout this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. Leave the work uncommitted.

## Depends on

Draft 02 (the built-in profile data and the validator) and Draft 03 (`decide`). Nothing else: the rows go through `decide`.

## References

- [Baseline](../design.md#baseline)
- [Matching](../design.md#matching)
- [Later](../design.md#later)
- [Prior art](../design.md#prior-art)
