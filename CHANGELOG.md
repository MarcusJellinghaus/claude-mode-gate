# Changelog

## Unreleased

- API spike (Draft 01, #3): every assumption in `docs/design.md` has a status and evidence, tested against Claude Code 2.1.292. Findings that change the design: a repo's `.claude/settings.json` `env` reaches the mod, and a module that fails to load leaves everything ungated.
- `plugin.json` names an author and `marketplace.json` has a description, which clears two `claude plugin validate` warnings.
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
