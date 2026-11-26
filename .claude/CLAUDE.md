# CLAUDE.md

claude-mode-gate is a Claude Code mod (TypeScript, strict mode) with switchable permission profiles. Goals, decisions and open items live in [docs/design.md](../docs/design.md). Read it first.

## MCP tools — mandatory

Start Claude with `claude.bat` (Windows) or `claude.sh` (macOS, Linux), not bare `claude`. The launcher finds the `mcp-workspace` install and sets `MCP_CODER_VENV_PATH`, `MCP_CODER_VENV_DIR`, `MCP_CODER_PROJECT_DIR`, `DISABLE_AUTOUPDATER` and `MCP_TIMEOUT`, which `.mcp.json` needs. `.mcp.linux.json` and `.mcp.macos.json` are the platform variants.

**Use the `mcp__mcp-workspace__*` tools for every file, git and GitHub operation they cover**, writes included. Native `Read`, `Write`, `Edit`, `Glob`, `Grep` and Bash are only for what they do not cover. Check the mapping table first.

**Justify any native tool.** Before Read, Write, Edit, Glob, Grep or Bash, say in chat, on two lines:

- _What it does_ — one sentence.
- _Why MCP doesn't_ — which tool you would have used, and what stops it.

If you can't name the gap, use the MCP tool. Exempt: the approved `npm run` scripts (see Commands). Put the same two lines in the Bash `description`, where the permission prompt shows them. Do not ask in chat before a Bash call: the prompt is the one approval. Subagents follow the same rule. Read logs and output files with `read_file` or `search_files`, never with shell `cat`, `tail` or `grep`.

**Protected files** (`.mcp*.json`, `.claude/settings*.json`, `.mcp-file-access`): MCP refuses writes to them by design. Stop and ask the user to edit the file. A refusal is not a gap, so never fall back to native Edit, Write, Bash or PowerShell.

**Scratch files** go in `.scratch/`: gitignored, and writable for MCP through its `read-write` rule in `.mcp-file-access`. Delete it when done. Only a file that must live outside the repo (the API spike's probes, issue #3) goes in the session scratchpad.

### Tool mapping

| Task                                                   | Tool                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Read, edit, write, append files                        | `read_file`, `edit_file`, `save_file`, `append_file`                                                  |
| Delete file or directory, move                         | `delete_this_file`, `delete_directory`, `move_file`                                                   |
| List, search                                           | `list_directory`, `search_files`                                                                      |
| Engine API (`claude-code` types)                       | `read_file` / `search_files` on `.claude-plugin/types/claude-code/index.d.ts`                         |
| Dependency source                                      | `read_file` / `search_files` under `node_modules/<package>/`                                          |
| Reference projects                                     | `get_reference_projects`, `read_reference_file`, `list_reference_directory`, `search_reference_files` |
| Branch status, base branch, file size                  | `check_branch_status`, `get_base_branch`, `check_file_size`                                           |
| Git read (status, diff, log, show, fetch, ls_files, …) | `git`                                                                                                 |
| Git write (branch, commit, push, force-push)           | `git_branch`, `git_branch_delete`, `git_commit`, `git_push`, `git_push_force`                         |
| GitHub read                                            | `github_issue_view`, `github_issue_list`, `github_pr_view`, `github_search`, `github_label_list`      |
| GitHub write                                           | `github_issue_create`, `github_issue_edit`, `github_issue_comment`, `github_pr_create`                |
| Issue workflow status                                  | `github_issue_set_status`                                                                             |
| PR review threads                                      | `github_review_comment_reply`, `github_review_thread_resolve`                                         |
| Format, type-check, lint, test, every other gate       | `npm run <script>` via Bash (see Commands)                                                            |
| Check a JS/TS/Node behaviour before claiming it        | scratch probe (below)                                                                                 |
| Follow mcp-coder's Jenkins builds for an issue         | `/jenkins_watch` (`python tools/jenkins_watch.py`; tests: `python -m pytest tests/tools -q`)          |

`.mcp-file-access` exposes `.claude-plugin/types/` and `node_modules/` read-only, although both are gitignored.

**Never call the tools behind the npm scripts directly:** no `npx tsc`, `npx eslint`, `npx prettier`, `npx vitest`, `npx depcruise`, `npx knip`, and no `node -e`. The scripts carry the config and flags CI uses, and only they are pre-approved. One test file: `npm run test -- tests/<name>.test.ts`.

**Reference projects:** `mcp-coder` (`~/Documents/GitHub/mcp_coder`) is the model for the skills, agents, launcher scripts and settings copied into this repo. Check it before asking how something is done there. `mcp-tools-py` (`~/Documents/GitHub/mcp-tools-py`) is the model for the code-quality MCP tools. The reference tools and `git` with `reference_name` are the only cross-repo route; for a repo that is not a reference project, stop and report.

### Scratch probes

Don't assert JavaScript, TypeScript or Node behaviour you haven't run. Probe it: `save_file(".scratch/probe.mjs", …)` (or `.ts`: Node strips the types), then `node .scratch/probe.mjs`, which asks for approval. Delete `.scratch/` when done. If you reason instead of running, label the conclusion analytical.

### Git and GitHub

- **Bash only for** `git rebase` and the other steps the `/rebase` skill lists, `git push --force-with-lease` when `git_push_force` refuses, and `gh pr edit` (no MCP tool). Never `git add`, `git commit` or `git push` via Bash.
- **Before every commit:** `npm run format`, then `npm run check`, then `git_commit`.
- **`git_commit`:** always pass `paths`, never `all=True`, which commits every untracked file that is not gitignored.
- **Commit messages and PR text:** conventional format, no attribution footers (`attribution` in `.claude/settings.json` is empty).
- **Status labels:** `github_issue_create` and `github_issue_edit` reject `status-*` labels; use `github_issue_set_status`.
- **Privileged agents:** `commit-pusher`, `issue-updater` and `issue-approver` carry a frontmatter `PreToolUse` hook that allows their extra tools without a prompt (`git_commit` and `git_push`, `github_issue_edit`, `github_issue_set_status`). No `bypassPermissions`. Frontmatter hooks are skipped in untrusted folders and under `-p`, where those tools prompt or are denied.
- **Agent Bash guard:** the agents that need Bash for the npm checks (`commit-pusher`, `code-engineer`, `issue-analyst`, `plan-engineer`) carry a `PreToolUse` hook, `scripts/agent-bash-guard.mjs`, that denies every Bash call except `npm run <script>` for the scripts named in the hook. It only denies: a call it lets through still needs the allow rules in `.claude/settings.json`. Where frontmatter hooks are skipped, the agents fall back to those rules alone.
- **Bash discipline:** no `cd` prefix, no `git -C`: commands already run in the project directory. Don't chain approved with unapproved commands.

### Skills, agents and knowledge base

`.claude/skills`, `.claude/agents` and `.claude/knowledge_base` are deployed by `mcp-coder init --just-skills` and then adapted: the Python tools (`mcp-tools-py`) are replaced by the npm scripts (format → `npm run format`, pylint and ruff → `npm run lint`, mypy → `npm run typecheck`, pytest → `npm run test`, vulture → `npm run deadcode`, import-linter → `npm run arch`) and `python.md` is dropped. A refresh redeploys them and re-applies those adaptations (wiki: `Processes/Chore Implementation`, step 3). Chores are collected in the chore list issue #40.

### Obsidian knowledge base

Shared knowledge base across the repos (`obsidian-dev-wiki`), via the `obsidian-wiki` MCP server.

**Read at the start of non-trivial work:** `Home.md`, `Repos/claude-mode-gate.md`, and any `Processes/` note matching the task. If a process note covers the task, follow it.

**Write only what is durable, general and homeless** (see the wiki's `Conventions.md`). Always write to `Field Notes/`; edit `Repos/`, `Processes/` or `Plans/` only when asked. Call the Obsidian tools one at a time.

### Asking questions and MCP outages

Ask questions as plain text in the chat, never with a question tool. Say at once if the MCP tools are not available: it blocks all work.

## Principles

- **TDD.** Write a failing test first, make it pass with the simplest code, then refactor. A bug fix starts with a failing test that reproduces it.
- **KISS.** Choose the simplest design that works. No feature, option or abstraction without a present need. Defer what "Later" and "Open items" in `docs/design.md` leave open.
- **Clean code.** Small functions with one job. Names that state intent. No dead code and no comments that restate the code. Comments explain why, not what.
- **Concise writing.** Chat, commit messages, PR text, docs and comments are short and readable. Lead with the outcome, say it once, and use complete sentences.

## Commands

Run everything with `npm run check`. It runs each gate below in order (`scripts/check.mjs`) and stops at the first failure. It prints one line per gate and only the failing gate's last 60 lines, so read its output as it is, without `tail` or `grep`. Individual gates:

| Command                   | Gate                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`       | Lays the engine's types if missing (`npm run types:lay` forces it; needs Claude Code on the PATH), then `tsc --noEmit`, strict mode plus noUncheckedIndexedAccess, exactOptionalPropertyTypes and more; scripts included |
| `npm run lint`            | ESLint, type-aware `strictTypeChecked` rules                                                                                                                                                                             |
| `npm run format:check`    | Prettier (`npm run format` fixes and lists only the files it changed)                                                                                                                                                    |
| `npm run arch`            | dependency-cruiser architecture rules; fails when a source file is not cruised                                                                                                                                           |
| `npm run deadcode`        | knip: unused files, exports, dependencies                                                                                                                                                                                |
| `npm run docs:lint`       | markdownlint                                                                                                                                                                                                             |
| `npm run check:manifests` | plugin, marketplace and hooks JSON are valid and agree                                                                                                                                                                   |
| `npm run check:catch`     | every gating hook in `register.ts` has a `.catch`                                                                                                                                                                        |
| `npm run check:pins`      | workflow actions are pinned to a full commit SHA                                                                                                                                                                         |
| `npm run check:docs`      | required docs exist (`RELEASE=1` also bans placeholders)                                                                                                                                                                 |
| `npm run test`            | vitest unit tests                                                                                                                                                                                                        |
| `npm run test:coverage`   | unit tests with a 95% threshold on `policy.ts`                                                                                                                                                                           |
| `npm run test:mutation`   | Stryker mutation tests on `policy.ts` (slow)                                                                                                                                                                             |
| `npm run audit`           | `npm audit` at high severity, minus `audit-allowlist.json`                                                                                                                                                               |

These commands, plus `npm run types:lay` and `npm run test -- <file>`, are pre-approved in `.claude/settings.json`, so run them freely without asking. `npm run test:mutation` is not: it is slow and runs in CI, so it asks. Run `npm run check` before every commit.

## Testing strategy

The strategy is layered. Cheap, deterministic gates run first, and the security boundary gets the strictest checks.

1. **Static analysis.** Strict TypeScript and type-aware ESLint catch type errors, unhandled promises (`no-floating-promises` matters here: an unhandled promise skips the fail-closed `.catch`) and non-exhaustive `switch` statements over verdicts or modes. Prettier keeps formatting out of reviews.
2. **Architecture checks.** dependency-cruiser enforces the structure in "Architecture rules" below. knip removes dead code, which in a security gate is also attack surface.
3. **Unit tests (vitest).** `policy.ts` is pure, so it is tested with tables: one row per case, with the call, the mode and the expected verdict. Cover at least:
   - every rule in the decision order, and the order itself (the first match wins);
   - Bash with chained commands (`&&`, `;`, `|`), substitution (`$()`, backticks), newlines and odd spacing;
   - protected paths, including relative paths and `..`;
   - that a deny from Claude Code is never overridden;
   - that unknown input falls back to `ask` or `deny`, never `allow`.
4. **Wiring tests.** `register.ts` is thin and is tested through the plugin test kit once its API is verified (assumption 4 in `docs/design.md`). Include fail-closed tests (a guard that throws produces a deny), the reset test (after `/clear` no profile stays active) and the band test.
5. **Mutation tests (Stryker).** Line coverage says little about a policy function. Mutation testing shows whether a flipped condition or a changed `allow`/`deny` would be caught. It runs weekly and on demand in CI.
6. **Contract checks.** `check:manifests` validates the manifests and `check:catch` validates the fail-closed rule. `claude plugin validate` and `claude plugin test` join CI once verified, pinned to a Claude Code version, plus a weekly run against the latest.
7. **Documentation checks.** markdownlint, a link check (lychee, CI only) and `check:docs`. A change that alters behaviour updates README.md and CHANGELOG.md in the same commit.
8. **Security checks.** `npm audit` and gitleaks in CI. SECURITY.md is kept in step with the security model in `docs/design.md`.

Rules for writing tests:

- Test behaviour through `decide`, not its internals.
- Every security rule gets a negative test: the case that must not be allowed.
- Write the test before the code (see Principles).
- Tests must not touch the real `~/.claude`, the network or the clock.

## Architecture rules

Enforced by `npm run arch` and `tests/repo-structure.test.ts`.

- `hooks/policy.ts` is pure. It imports nothing and uses no `$`, no state, no I/O.
- `hooks/register.ts` is thin wiring that calls `policy.ts`. Nothing imports it.
- Production code (`hooks/`, `types/`) never imports from `tests/` or from devDependencies.
- No circular imports.
- Every gating hook has a `.catch` that fails closed (`ask` or `deny`, never `allow`).

## Workflow

- Work on a feature branch. Commit and push after each major change.
- Run `npm run check` before committing. CI runs the same gates, plus the Windows matrix, link check, secret scan and mutation tests.
- Do not pick the marketplace name without asking. It is an open item in `docs/design.md`. The licence is MIT.
