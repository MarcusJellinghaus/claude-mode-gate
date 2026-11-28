# Task Status Tracker

## Instructions for LLM

This tracks **Feature Implementation** consisting of multiple **Tasks**.

**Summary:** See [summary.md](./steps/summary.md) for implementation overview.

**How to update tasks:**

1. Change [ ] to [x] when implementation step is fully complete (code + checks pass)
2. Change [x] to [ ] if task needs to be reopened
3. Add brief notes in the linked detail files if needed
4. Keep it simple - just GitHub-style checkboxes

**Task format:**

- [x] = Task complete (code + all checks pass)
- [ ] = Task not complete
- Each task links to a detail file in steps/ folder

---

## Tasks

### Step 1: dependency-cruiser rules for the config modules ([step_1.md](./steps/step_1.md))

- [x] Implementation: `tsPreCompilationDeps: true` and the three new rules in `.dependency-cruiser.cjs`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 2: `parseRule` and the per-file coverage gate ([step_2.md](./steps/step_2.md))

- [x] Implementation: `tests/config-rule.test.ts`, `parseRule` in `hooks/config.ts`, `vitest.config.ts` and `stryker.config.json`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 3: the shipped data files ([step_3.md](./steps/step_3.md))

- [x] Implementation: `tests/config-data.test.ts`, `hooks/baseline.ts`, `hooks/builtin-profiles.ts`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 4: `validateConfig`, structure ([step_4.md](./steps/step_4.md))

- [x] Implementation: `tests/config-validate.test.ts`, `validateConfig`, `checkFile` and `checkRuleLists` in `hooks/config.ts`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 5: `mode-gate.schema.json` and the key-set test ([step_5.md](./steps/step_5.md))

- [x] Implementation: `tests/config-schema.test.ts`, `mode-gate.schema.json`, export the key sets
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 6: per-rule findings (over-broad allow, unknown tool names) ([step_6.md](./steps/step_6.md))

- [x] Implementation: `tests/config-findings.test.ts`, `KNOWN_TOOLS` and the per-rule checks in `hooks/config.ts`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 7: per-set findings (duplicates, covered allows) ([step_7.md](./steps/step_7.md))

- [x] Implementation: `covers` table and rows in `tests/config-findings.test.ts`, `covers` and `checkSetFindings` in `hooks/config.ts`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 8: path helpers, environment filter, config path ([step_8.md](./steps/step_8.md))

- [x] Implementation: `tests/config-paths.test.ts`, `isAbsolutePath`, `joinPath`, `trustedEnv`, `resolveConfigPath`
- [x] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [x] Commit message prepared

### Step 9: `parseStartProfiles` ([step_9.md](./steps/step_9.md))

- [ ] Implementation: `tests/config-start-profiles.test.ts`, `parseStartProfiles` in `hooks/config.ts`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 10: `loadConfig`, success path, baseline selection and merge ([step_10.md](./steps/step_10.md))

- [ ] Implementation: `tests/config-fixtures.ts`, `tests/config.test.ts`, `loadConfig`, `readJson` and `buildResult` in `hooks/config.ts`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 11: `loadConfig`, fail-closed result, `logDir`, start profiles, untrusted env ([step_11.md](./steps/step_11.md))

- [ ] Implementation: `tests/config-fail.test.ts`, extend `loadConfig`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 12: project proposals from `.mode-gate.json` ([step_12.md](./steps/step_12.md))

- [ ] Implementation: `tests/config-proposals.test.ts`, `loadProposals` in `hooks/config.ts`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 13: cross-layer duplicate findings ([step_13.md](./steps/step_13.md))

- [ ] Implementation: `tests/config-layers.test.ts`, `crossLayerFindings` in `hooks/config.ts`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 14: `docs/design.md` for the configurable baseline and the config module ([step_14.md](./steps/step_14.md))

- [ ] Implementation: the five edits to `docs/design.md`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

### Step 15: architecture map, `CLAUDE.md` and `CHANGELOG.md` ([step_15.md](./steps/step_15.md))

- [ ] Implementation: `docs/architecture/architecture.md`, `.claude/CLAUDE.md`, `CHANGELOG.md`
- [ ] Quality checks (`npm run format`, `npm run check`) — fix all issues
- [ ] Commit message prepared

## Pull Request

- [ ] PR review: review the full branch diff against the base branch and address the findings
- [ ] PR summary prepared (names Claude Code 2.1.326 as the source of `KNOWN_TOOLS`)
