# Changelog

## Unreleased

- `.claude/settings.json` no longer sets the mcp-workspace variables. Its hard-coded `MCP_CODER_PROJECT_DIR` had a typo and overrode the launcher, so the server never started. `claude.bat` and `claude.sh` set them, as in mcp-coder.
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
