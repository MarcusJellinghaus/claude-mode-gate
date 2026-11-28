# Architecture

claude-mode-gate is a Claude Code mod: one hooks module that the engine loads from `plugin/`. Only `plugin/` ships; the root holds the marketplace and the dev tooling. Goals, the decision order and the security model are in [design.md](../design.md). This page is the map of the code and the rules that keep it in shape. `/implementation_review` checks changes against it.

## Modules

| Path                       | Role                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `plugin/hooks/policy.ts`   | The decision: a pure function from a tool call, the active profiles and Claude Code's verdict to a verdict    |
| `plugin/hooks/register.ts` | Thin wiring: registers the hooks with the engine and calls `policy.ts`                                        |
| `plugin/hooks/hooks.json`  | Names the one hooks module                                                                                    |
| `plugin/types/`            | Shared type declarations                                                                                      |
| `plugin/.claude-plugin/`   | Plugin manifest; `types/` there is laid by Claude Code and never committed                                    |
| `plugin/tests/`            | Kit tests (`claude-code/testing`), run by the engine, never by vitest                                         |
| `.claude-plugin/`          | Marketplace manifest; its one plugin's source is `./plugin`                                                   |
| `scripts/`                 | Repo gates run by `npm run` (full gate, audit, manifests, fail-closed catch, action pins, docs, engine types) |
| `tests/`                   | vitest tests, one file per module                                                                             |

## Rules

Enforced by `npm run arch` (dependency-cruiser) and `tests/repo-structure.test.ts`:

- `plugin/hooks/policy.ts` is pure. It imports nothing and has no state or I/O, so it is tested with tables.
- `plugin/hooks/register.ts` is thin wiring that calls `policy.ts`. Nothing imports it.
- Production code (`plugin/hooks/`, `plugin/types/`) never imports from `tests/` or from devDependencies.
- No circular imports.
- Every gating hook has a `.catch` that fails closed (`ask` or `deny`, never `allow`), checked by `npm run check:catch`.

knip (`npm run deadcode`) rejects unused files, exports and dependencies, because dead code in a security gate is attack surface.
