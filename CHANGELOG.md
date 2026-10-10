# Changelog

## Unreleased

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
