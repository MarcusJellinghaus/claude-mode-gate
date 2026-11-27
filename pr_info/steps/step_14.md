# Step 14: `docs/design.md` for the configurable baseline and the config module

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_14.md`) only. It changes documentation only, so there is no unit test; `npm run docs:lint` and `npm run check:docs` are the checks. `docs/design.md` is about 89 KB, so read and edit it section by section with `read_file` ranges and `edit_file`. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `docs/design.md` (modified)

## WHAT

Edit each place below. Keep the sentences short, and name no draft numbers in user-facing text. Draft names in the design's own planning sections are fine.

1. **Concepts, the "Baseline" bullet** (around line 42): the baseline is always active. The mod ships a default, which a top-level `baseline` in the user file replaces whole, with no merging. Its path asks and denies remain path guards.
2. **"Where profiles live"** (around lines 48–58):
   - Layer 1 becomes: the baseline is the user file's `baseline` if present, else the shipped default. Drop "cannot be overridden".
   - The shape gains `"baseline": { "allow": [], "ask": [], "deny": [] }`.
   - The baseline has no `description` and no `delegable`.
   - The failure sentence becomes: an invalid config fails closed. Only an empty baseline is active (all three lists empty, never the default, so a broken setup cannot widen a baseline the user narrowed), and `startProfiles` is always `[]`. Drop "informational".
   - Add: a `baseline` or `logDir` in a project `.mode-gate.json` is ignored with a warning.
3. **Baseline section** (around lines 60–71):
   - The opening says this is the shipped default.
   - The read tools drop `github_issue_view` and list the 14 tools of `hooks/baseline.ts`.
   - Add one sentence: `github_issue_view` is not in the default because its `body_file` writes a project file, which the path guards don't cover. It belongs to the `issues` profile.
   - "The baseline has no ask or deny rules" becomes "The default baseline has no ask or deny rules; a user `baseline` may have them."
4. **Code structure, the `config.ts` row** (around line 209): it imports only `baseline.ts`, `builtin-profiles.ts` and `policy.ts`. From `policy.ts` that is the types plus `decide` at runtime, for the "covers" check. The data files import nothing at runtime.
5. **Impact on the drafts, the Draft 02 row** (around line 331): sibling imports use extensionless or `./x.js` specifiers, not `./x.ts`, because `tsconfig.json` doesn't set `allowImportingTsExtensions`.

After editing, `search_files` on `docs/design.md` for `cannot be overridden`, `informational` and `./x.ts` must find nothing that contradicts issue #4.

## HOW / ALGORITHM / DATA

Not applicable: these are text edits only. Markdown tables keep their column alignment; Prettier fixes it.

## Done when

`npm run check` passes, including `docs:lint`.

Commit message: `docs(design): configurable baseline and the config module`.
