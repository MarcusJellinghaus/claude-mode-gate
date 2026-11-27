# Summary: config schema, loader and validator (issue #4, Draft 02)

## Goal

Define the config schema, load the three layers (baseline, profiles, project proposals), derive the starting profiles from `MODE_GATE_PROFILES`, and validate everything for `/gate-check`. Everything is table-tested and test-first. The full requirements are in issue #4. This plan is the simple route to them.

## Precondition for the whole plan

Issue #5 (Draft 03) must be merged: `hooks/policy.ts` exports `Rule`, `Profile`, `RuleSet`, `Call`, `Decision` and `decide({ call, sets, guards, claude, withChain? })`. Each step that needs one of them checks it first. If it is missing, the step writes one line to `pr_info/.blocked.txt` and stops.

## Architectural and design changes

- **Three new production modules.**
  - `hooks/config.ts` holds the parser, the validator, the loader and the pure path helpers. It may import only `hooks/policy.ts`, `hooks/baseline.ts` and `hooks/builtin-profiles.ts`. From `policy.ts` it imports the types with `import type` and `decide` with a value import, because the "covers" check calls `decide`, so the validator and `decide` cannot disagree.
  - `hooks/baseline.ts` and `hooks/builtin-profiles.ts` hold raw rule strings. They import nothing at runtime; type imports from `policy.ts` are allowed.
- **Configurable baseline.**
  - The baseline is no longer fixed. The user file's top-level `baseline` replaces the shipped default whole, with no merging.
  - Every failed load gives an empty baseline and `startProfiles: []` (fail closed).
- **One parse path for every layer.**
  - An internal `checkFile(input, source)` validates one file's content and returns its issues together with the parsed baseline and the valid profiles. `validateConfig` is that function's `issues`.
  - The shipped default baseline (`source: 'baseline'`) and the built-ins (`source: 'builtin'`) go through the same function, wrapped as `{ baseline: … }` and `{ profiles: … }`. So the same rules check them, and the issue paths come out as `baseline.allow[0]` and `profiles.git-write.allow[0]` with no extra code.
- **One "same pattern" key**, `` `${tool}|${kind}|${arg ?? ''}` ``, for every duplicate check.
- **Cross-layer duplicates in one ordered pass** over the baseline in effect, the built-ins not replaced by a user profile, and the user profiles.
- **One result builder**, so every failure kind produces the same fail-closed shape. The result is plain JSON, because it is stored in `$.state`.
- **Project proposals.** `.mode-gate.json` profiles are validated by the same `checkFile`, with every issue downgraded to a warning. A proposal with any error is left out. Proposals are never active.
- **Prototype safety.**
  - The name check (pattern plus the reserved `all`, `baseline`, `constructor` and `prototype`) runs before any insert into a `Record<string, Profile>`.
  - Lookups use `Object.hasOwn`.
- **No new runtime dependency.** The parser is hand-written. The path helpers are pure string functions, with no `node:path`.
- **Tool names.**
  - `KNOWN_TOOLS` is copied by hand from the keys of `BuiltinToolInputs` in `.claude-plugin/types/claude-code-tools/index.d.ts`. The types were written by Claude Code 2.1.326 (first line of `.claude-plugin/types/claude-code/index.d.ts`), and the PR text names that version.
  - There is no `Task` alias.
- **Gates.**
  - dependency-cruiser gets `tsPreCompilationDeps: true` and three new rules.
  - vitest coverage moves to `perFile: true` and includes `hooks/config.ts`.
  - Stryker mutates `hooks/config.ts` too.

## Main types (in `hooks/config.ts`)

```ts
type Severity = "error" | "warning";
type Source = "baseline" | "builtin" | "user" | "project" | "env";
interface Issue {
  severity: Severity;
  source: Source;
  path: string;
  message: string;
}

interface RawRuleLists {
  allow?: string[];
  ask?: string[];
  deny?: string[];
} // baseline.ts shape
interface RawProfile extends RawRuleLists {
  description: string;
  delegable?: boolean;
} // builtin-profiles.ts values

interface ModeGateEnv {
  MODE_GATE_PROFILES?: string | undefined;
  MODE_GATE_CONFIG?: string | undefined;
  XDG_CONFIG_HOME?: string | undefined;
  HOME?: string | undefined;
  USERPROFILE?: string | undefined;
}
type EnvName = keyof ModeGateEnv;

interface LoadDeps {
  readFile: (path: string) => Promise<string | undefined>; // undefined = missing; reject = unreadable
  env: ModeGateEnv;
  untrustedEnv: readonly EnvName[];
  cwd: string;
  baseline?: RawRuleLists;
  builtins?: Record<string, RawProfile>; // default: the shipped data
}

type LoadResult =
  | {
      ok: true;
      config: {
        baseline: RuleSet;
        profiles: Record<string, Profile>;
        proposals: Record<string, Profile>;
      };
      configPath?: string;
      logDir: string;
      startProfiles: string[];
      warnings: Issue[];
    }
  | {
      ok: false;
      errors: Issue[];
      baseline: RuleSet;
      configPath?: string;
      logDir: string;
      startProfiles: [];
      warnings: Issue[];
    };
```

## Exports

Export only what a test imports at that step. knip (`npm run deadcode`) reports every other export, including an export kept for a later draft and an export used only inside `hooks/config.ts`; the later drafts add the exports they need. The types above therefore stay internal (`Severity`, `Source`, `Issue`, `ParsedRule`, `ModeGateEnv`, `EnvName`, `LoadResult`, the raw types), except `LoadDeps`, which `tests/config-fixtures.ts` imports. An internal type in an exported signature is fine: `tsconfig.json` sets `noEmit` and no `declaration`. Exports by step:

| Step | Exports added                                                                     |
| ---- | --------------------------------------------------------------------------------- |
| 2    | `parseRule`, `ARG_ON_NON_BASH`, `STAR_POSITION`, `ARG_WHITESPACE`                 |
| 3    | `baseline` (`hooks/baseline.ts`), `builtinProfiles` (`hooks/builtin-profiles.ts`) |
| 4    | `validateConfig`                                                                  |
| 5    | `TOP_LEVEL_KEYS`, `BASELINE_KEYS`, `PROFILE_KEYS`                                 |
| 7    | `covers`                                                                          |
| 8    | `isAbsolutePath`, `joinPath`, `trustedEnv`, `resolveConfigPath`                   |
| 9    | `parseStartProfiles`                                                              |
| 10   | `loadConfig`, `LoadDeps`; `fakeDeps` (`tests/config-fixtures.ts`)                 |

## Files

Created:

- `hooks/config.ts`
- `hooks/baseline.ts`
- `hooks/builtin-profiles.ts`
- `mode-gate.schema.json`
- `tests/config.test.ts` (the `loadConfig` success path, starting with issue #4's "How to start" rows), `tests/config-rule.test.ts`, `tests/config-data.test.ts`, `tests/config-validate.test.ts`, `tests/config-schema.test.ts`, `tests/config-findings.test.ts`, `tests/config-paths.test.ts`, `tests/config-start-profiles.test.ts`, `tests/config-fail.test.ts`, `tests/config-proposals.test.ts`, `tests/config-layers.test.ts`
- `tests/config-fixtures.ts` (the shared fake `LoadDeps`; not a test file)

Modified:

- `.dependency-cruiser.cjs`
- `vitest.config.ts`
- `stryker.config.json`
- `docs/design.md`
- `docs/architecture/architecture.md`
- `.claude/CLAUDE.md`
- `CHANGELOG.md`

**Deviation from "one test file per module"** (`.claude/knowledge_base/planning_principles.md`). `hooks/config.ts` gets eleven test files instead of one, split by topic. One file would hold several hundred table rows and go well over the repo's 600-line file limit (`check_file_size`). The first `loadConfig` rows stay in `tests/config.test.ts`, as issue #4's "How to start" says. Every other file is named `tests/config-<topic>.test.ts`, so they all sort next to it.

## Steps

1. dependency-cruiser: `tsPreCompilationDeps` and the three new rules.
2. `parseRule`, plus the per-file coverage and Stryker settings.
3. The data files `hooks/baseline.ts` and `hooks/builtin-profiles.ts`.
4. `validateConfig`, structure: keys, types, names, `description`, `delegable`, `logDir`, rule entries.
5. `mode-gate.schema.json` and the key-set test.
6. Per-rule findings: over-broad allow, unknown tool names.
7. Per-set findings: duplicates and covered allows (via `decide`).
8. Path helpers, environment filter, config path resolution.
9. `parseStartProfiles`.
10. `loadConfig`, success path: user file, defaults, baseline selection, merge, result shapes.
11. `loadConfig`, fail-closed result: every failure kind, `logDir`, start profiles, untrusted env.
12. Project proposals from `.mode-gate.json`.
13. Cross-layer duplicate findings.
14. `docs/design.md` updates.
15. `docs/architecture/architecture.md`, `.claude/CLAUDE.md` and `CHANGELOG.md` updates.

## Rules for every step

- TDD: write the failing test first, then the simplest code that passes it, then refactor.
- Before the commit, run `npm run format` and then `npm run check`. Commit with `git_commit` and explicit `paths`.
- Tests never touch the real home folder, the network or the clock. They inject the reader, the environment, `untrustedEnv` and `cwd`, and the default baseline and built-ins (except the one default-deps test).
- Imports use extensionless specifiers, never `./x.ts`. Types are imported with `import type`.
- Every file a step creates or changes stays under the 600-line limit. Check it with `check_file_size` (MCP) before the commit; it is not part of `npm run check`. A test file near the limit is split by topic in that same step. `hooks/config.ts` cannot be split, because rule (b) fixes its imports. If it goes over 600 lines, that step adds a `hooks/config.ts` entry to `.large-files-allowlist` and commits it with the code.
- User-facing messages never name a draft number.
