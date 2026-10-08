# CLAUDE.md

claude-mode-gate is a Claude Code mod (TypeScript, strict mode) with switchable permission profiles. Goals, decisions and open items live in [docs/design.md](docs/design.md). Read it first.

## MCP tools

Start Claude with `claude.bat` (Windows) or `claude.sh` (macOS, Linux), not bare `claude`. The launcher finds the `mcp-workspace` install and sets `MCP_CODER_VENV_PATH`, `MCP_CODER_VENV_DIR`, `MCP_CODER_PROJECT_DIR`, `DISABLE_AUTOUPDATER` and `MCP_TIMEOUT`, which `.mcp.json` needs. `.mcp.linux.json` and `.mcp.macos.json` are the platform variants.

**Always use the `mcp__mcp-workspace__*` tools** instead of native `Read`, `Write`, `Edit`, `Glob` and `Grep` for file and git work. Use Bash only for `npm run ...` commands, `git commit/add/push/checkout -b`, `gh` writes with no MCP tool, and anything else with no MCP equivalent.

**Justify Bash.** Before a Bash command, say in chat, on two lines:

- _What it does_ — one sentence.
- _Why MCP doesn't_ — which tool you would have used, and what stops it.

If you can't name the gap, use the MCP tool. Exempt: the approved `npm run` check commands and `git add/commit/push` for the standing commit-and-push workflow. Subagents follow the same rule.

| Task                            | MCP tool                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Read, edit, write, append files | `read_file`, `edit_file`, `save_file`, `append_file`                                                  |
| Delete, move                    | `delete_this_file`, `delete_directory`, `move_file`                                                   |
| List, search                    | `list_directory`, `search_files`                                                                      |
| Git read-only                   | `git` (status, diff, log, show, fetch, branch list)                                                   |
| GitHub read-only                | `github_issue_view`, `github_issue_list`, `github_pr_view`, `github_search`                           |
| Branch status, size checks      | `check_branch_status`, `get_base_branch`, `check_file_size`                                           |
| Reference projects              | `get_reference_projects`, `read_reference_file`, `list_reference_directory`, `search_reference_files` |

**Reference project:** `mcp-coder` (local clone at `~/Documents/VSCC/mcp_coder_1179`). It is the model for the skills, agents and launcher scripts copied into this repo. Check it before asking how something is done there.

**Skills and agents** in `.claude/skills` and `.claude/agents` are copied from mcp-coder. The Python tools (`mcp-tools-py`) are replaced by the matching `npm run` scripts: format → `npm run format`, pylint and ruff → `npm run lint`, mypy → `npm run typecheck`, pytest → `npm run test`, vulture → `npm run deadcode`, import-linter → `npm run arch`. The sleep tool is dropped; the skills no longer wait. They still assume mcp-coder's `mcp-coder gh-tool` for issue status and `.claude/knowledge_base/*.md`, which this repo does not have. The three agents run with `bypassPermissions`. Review them before relying on them here.

Ask questions as plain text in the chat, not with a question tool. Tell me at once if the MCP tools are not available.

## Principles

- **TDD.** Write a failing test first, make it pass with the simplest code, then refactor. A bug fix starts with a failing test that reproduces it.
- **KISS.** Choose the simplest design that works. No feature, option or abstraction without a present need. Defer what "Later" and "Open items" in `docs/design.md` leave open.
- **Clean code.** Small functions with one job. Names that state intent. No dead code and no comments that restate the code. Comments explain why, not what.
- **Concise writing.** Chat, commit messages, PR text, docs and comments are short and readable. Lead with the outcome, say it once, and use complete sentences.

## Commands

Run everything with `npm run check`. It runs each gate below in order and stops at the first failure. Individual gates:

| Command                   | Gate                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `npm run typecheck`       | `tsc --noEmit`, strict mode                                |
| `npm run lint`            | ESLint, type-aware `strictTypeChecked` rules               |
| `npm run format:check`    | Prettier (`npm run format` fixes)                          |
| `npm run arch`            | dependency-cruiser architecture rules                      |
| `npm run deadcode`        | knip: unused files, exports, dependencies                  |
| `npm run docs:lint`       | markdownlint                                               |
| `npm run check:manifests` | plugin, marketplace and hooks JSON are valid and agree     |
| `npm run check:catch`     | every gating hook in `register.ts` has a `.catch`          |
| `npm run check:docs`      | required docs exist (`RELEASE=1` also bans placeholders)   |
| `npm run test`            | vitest unit tests                                          |
| `npm run test:coverage`   | unit tests with a 95% threshold on `policy.ts`             |
| `npm run test:mutation`   | Stryker mutation tests on `policy.ts` (slow)               |
| `npm run audit`           | `npm audit` at high severity, minus `audit-allowlist.json` |

These commands are pre-approved in `.claude/settings.json`, so run them freely without asking. Run `npm run check` before every commit.

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
- Do not add a LICENSE or pick the marketplace name without asking. Both are open items in `docs/design.md`.
