# Step 15: architecture map, `CLAUDE.md` and `CHANGELOG.md`

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_15.md`) only. It changes documentation only, so there is no unit test. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

File size is not a task of this step: every step keeps its own new and changed files under the 600-line limit (see summary.md, "Rules for every step").

## WHERE

- `docs/architecture/architecture.md` (modified)
- `.claude/CLAUDE.md` (modified; not a protected file)
- `CHANGELOG.md` (modified)

## WHAT

1. **`docs/architecture/architecture.md`.**
   - The module table gains three rows:
     - `hooks/config.ts`: config parser, validator and loader. It imports only `policy.ts` (types and `decide`), `baseline.ts` and `builtin-profiles.ts`.
     - `hooks/baseline.ts`: the shipped default baseline, as rule strings.
     - `hooks/builtin-profiles.ts`: the shipped profiles, as rule strings keyed by name.
   - Add a root row for `mode-gate.schema.json`: the JSON Schema for editors.
   - Rules gain two bullets: the data files import nothing at runtime (type imports from `policy.ts` only), and `config.ts` may import only those three modules.
   - Add one sentence: dependency-cruiser runs with `tsPreCompilationDeps: true`, so type-only imports count.
2. **`.claude/CLAUDE.md`.**
   - Architecture rules gain the same two bullets.
   - Commands:
     - the `test:coverage` row becomes "unit tests with a 95% threshold per file on `policy.ts` and `config.ts`";
     - the `test:mutation` row names `policy.ts` and `config.ts`.
3. **`CHANGELOG.md`**, a new first bullet under "Unreleased":
   - Config schema, loader and validator (`hooks/config.ts`, `mode-gate.schema.json`): user config at `MODE_GATE_CONFIG`, `$XDG_CONFIG_HOME/mode-gate/config.json` or `~/.config/mode-gate/config.json`.
   - An optional `baseline` replaces the shipped default whole, and profiles replace built-ins by name.
   - The project `.mode-gate.json` profiles are proposals only.
   - Every failed load gives an empty baseline and no starting profiles.
   - `/gate-check` findings come with severities.
   - Coverage is enforced per file.

README is not changed here: the loader isn't wired into any command yet, and the README is Draft 13's scope.

## HOW / ALGORITHM / DATA

Not applicable: text edits only. Prettier realigns the tables.

## Done when

`npm run check` passes.

Commit message: `docs: map the config modules and record the config schema`.
