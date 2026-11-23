# Changelog

## Unreleased

- `check:catch`, `check:manifests` and `check:docs` export their checks as pure functions and have unit tests, including the cases that must fail.
- `npm run check` runs the gates with `scripts/check.mjs` instead of `run-s`: one line per gate, and only the failing gate's last 60 lines, without colour codes. `npm-run-all2` is gone.
- `npm run format` lists only the files it changed. `.claude/settings.json` follows mcp-coder's allow list (MCP file, read and Obsidian tools, WebFetch, skills); `npm run test:mutation`, `npm ci` and Bash git writes now ask. `.mcp-file-access` also protects the platform MCP configs and exposes the engine types and `node_modules` read-only. `CLAUDE.md` has a full tool mapping.
- The agents that need Bash (`commit-pusher`, `code-engineer`, `issue-analyst`, `plan-engineer`) carry a `PreToolUse` hook, `scripts/agent-bash-guard.mjs`, that denies any Bash call other than their named `npm run` scripts. An agent's `tools:` list cannot restrict Bash by command.
- Synced with mcp-coder (chore list #40): skills and agents refreshed with `mcp-coder init --just-skills` and re-adapted to the `npm run` scripts; the three missing supervisor agents, the knowledge base, `pr_comment_triage`, `.mcp-file-access` and `mcp-coder.toml` added; the agents use scoped hooks instead of `bypassPermissions`; `docs/architecture/architecture.md` maps the code.
- `.claude/settings.json` no longer sets the mcp-workspace variables. Its hard-coded `MCP_CODER_PROJECT_DIR` had a typo and overrode the launcher, so the server never started. `claude.bat` and `claude.sh` set them, as in mcp-coder.
- The mcp-coder reference project points at `~/Documents/GitHub/mcp_coder` in all three MCP configs, and `mcp-tools-py` is added as a second reference project.
- `npm run typecheck` lays the engine types with Claude Code 2.1.323 and newer too: `scripts/lay-types.mjs` sets `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, without which `claude -p` no longer writes them.
- Dev dependencies fixed for four high advisories: markdown-it and zod via updates, and `re2js` via an `overrides` entry until markdownlint drops its 2.8.6 pin. The withdrawn `braces` advisory left the allowlist, which is now empty (closes #2).
- API spike (Draft 01, #3): every assumption in `docs/design.md` has a status and evidence, tested against Claude Code 2.1.292. Findings that change the design: a repo's `.claude/settings.json` `env` reaches the mod, and a module that fails to load leaves everything ungated.
- `plugin.json` names an author, `marketplace.json` has a description, and `CLAUDE.md` moved to `.claude/CLAUDE.md`, so `claude plugin validate --strict` passes.
- `verbatimModuleSyntax` and `erasableSyntaxOnly` are on: the engine compiles the mod's TypeScript and accepts both.
- `hooks/hooks.json` names the one hooks module, `register.ts` is typed `Register`, and `npm run check:manifests` enforces both.
- `npm run typecheck` lays the engine's `claude-code` types with `scripts/lay-types.mjs` (`npm run types:lay` forces it); CI installs Claude Code 2.1.292.
- Stricter TypeScript flags; scripts are type-checked.
- `npm run arch` fails when dependency-cruiser does not cruise a source file, instead of passing on zero modules.
- Node floor raised to match the dependency tree, with .node-version and engine-strict.
- v1 plan as GitHub issues #3 to #15, tracked by the overview issue #16.
- Workflow actions are pinned to commit SHAs, enforced by `npm run check:pins`.
- MIT licence, Dependabot config and a real security policy.
- Initial repo scaffold.
- Design agreed and recorded in `docs/design.md` (baseline plus switchable profiles).
- Test and CI tooling: strict type check, ESLint, Prettier, dependency-cruiser, knip, markdownlint, vitest with coverage, Stryker, GitHub Actions.
- mcp-workspace MCP server config, launchers (`claude.bat`, `claude.sh`) and mcp-coder skills and agents copied as a reference.
- `npm run audit` allowlists single advisories in `audit-allowlist.json`; the `braces` one is tracked in issue #2.
