# Step 5: `mode-gate.schema.json` and the key-set test

## LLM prompt

Read `pr_info/steps/summary.md`, then implement this step (`pr_info/steps/step_5.md`) only. Write `tests/config-schema.test.ts` first, then the schema file. Run `npm run format`, then `npm run check`, then commit with `git_commit` (explicit `paths`).

## WHERE

- `mode-gate.schema.json` (new, repo root)
- `tests/config-schema.test.ts` (new)

## WHAT

A JSON Schema (draft 2020-12) for editor validation:

- Top level: `type: object`, `additionalProperties: false`, and these properties:
  - `$schema`: string.
  - `logDir`: string, `minLength: 1`.
  - `baseline`: `$ref: #/$defs/baseline`.
  - `profiles`: an object whose `propertyNames` use the pattern `^[a-z][a-z0-9-]*$`, with `not: { enum: ["all", "baseline", "constructor", "prototype"] }`, and whose `additionalProperties` is `$ref: #/$defs/profile`.
- `$defs.ruleList`: an array of strings.
- `$defs.baseline`: `additionalProperties: false`, with `allow`, `ask` and `deny` each a `ruleList`.
- `$defs.profile`: `additionalProperties: false`, `required: ["description"]`, with:
  - `description`: string, `minLength: 1`;
  - `delegable`: boolean, `default: true`;
  - `allow`, `ask` and `deny`: each a `ruleList`.

Each property gets a short `description`. The schema is a convenience for editors. The validator in `hooks/config.ts` is the authority, so the schema doesn't try to encode the rule grammar.

## HOW

The test reads the schema with `node:fs`, which is fine in tests, and compares sorted key lists:

- `Object.keys(schema.properties)` with `TOP_LEVEL_KEYS`;
- `Object.keys(schema.$defs.baseline.properties)` with `BASELINE_KEYS`;
- `Object.keys(schema.$defs.profile.properties)` with `PROFILE_KEYS`.

## ALGORITHM

None beyond the three comparisons.

## DATA

The schema file is static JSON. Prettier formats it, and markdownlint doesn't see it.

## Done when

`npm run check` passes.

Commit message: `feat(config): ship mode-gate.schema.json`.
