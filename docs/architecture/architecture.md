# Architecture

claude-mode-gate is a Claude Code mod: one hooks module that the engine loads from this folder. Goals, the decision order and the security model are in [design.md](../design.md). This page is the map of the code and the rules that keep it in shape. `/implementation_review` checks changes against it.

## Modules

| Path                        | Role                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/policy.ts`           | The decision: a pure function from a tool call, the active profiles and Claude Code's verdict to a verdict                     |
| `hooks/register.ts`         | Thin wiring: registers the hooks with the engine and calls `policy.ts`                                                         |
| `hooks/config.ts`           | Config parser, validator and loader. It imports only `policy.ts` (types and `decide`), `baseline.ts` and `builtin-profiles.ts` |
| `hooks/baseline.ts`         | The shipped default baseline, as rule strings                                                                                  |
| `hooks/builtin-profiles.ts` | The shipped profiles, as rule strings keyed by name                                                                            |
| `hooks/hooks.json`          | Names the one hooks module                                                                                                     |
| `types/`                    | Shared type declarations                                                                                                       |
| `.claude-plugin/`           | Plugin and marketplace manifests; `types/` there is laid by Claude Code and never committed                                    |
| `scripts/`                  | Repo gates run by `npm run` (full gate, audit, manifests, fail-closed catch, action pins, docs, engine types)                  |
| `tests/`                    | vitest tests, one file per module                                                                                              |
| `mode-gate.schema.json`     | The JSON Schema for editors                                                                                                    |

## Rules

Enforced by `npm run arch` (dependency-cruiser) and `tests/repo-structure.test.ts`:

- `hooks/policy.ts` is pure. It imports nothing and has no state or I/O, so it is tested with tables.
- `hooks/register.ts` is thin wiring that calls `policy.ts`. Nothing imports it.
- The data files `hooks/baseline.ts` and `hooks/builtin-profiles.ts` import nothing at runtime; they may import types from `policy.ts` only.
- `hooks/config.ts` may import only `policy.ts`, `baseline.ts` and `builtin-profiles.ts`.
- Production code (`hooks/`, `types/`) never imports from `tests/` or from devDependencies.
- No circular imports.
- Every gating hook has a `.catch` that fails closed (`ask` or `deny`, never `allow`), checked by `npm run check:catch`.

dependency-cruiser runs with `tsPreCompilationDeps: true`, so type-only imports count.

knip (`npm run deadcode`) rejects unused files, exports and dependencies, because dead code in a security gate is attack surface.
