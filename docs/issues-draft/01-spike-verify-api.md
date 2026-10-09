# Spike: verify the Claude Code API

## Context

claude-mode-gate (plugin name `mode-gate`) is a Claude Code mod, written in TypeScript (strict), that gates Claude's tool calls. A mod is a plugin of function hooks that hot-reload in a session. A fixed **baseline** plus named **profiles** (rule lists `allow`, `ask`, `deny`) decide each call. The user switches profiles with `/gate-on` and `/gate-off`. **Subagents** get the baseline plus the profiles their parent assigns. **Headless runs** (`claude -p`) read starting profiles from `MODE_GATE_PROFILES`.

The design is agreed in `docs/design.md`, but nothing is built, and 15 facts about the mods API are unverified. This spike is the first step (Draft 01 of 11). Most later drafts depend on its result. See Draft 00 for the plan. Draft ids refer to the files in docs/issues-draft/ (see 00-overview.md); they become GitHub issue numbers at creation.

Constraints the findings must respect:

- `hooks/policy.ts` is pure (no `$`, no state, no imports). `hooks/register.ts` is thin wiring. State lives in `$.state` (per session), never `$.store`.
- Planned events: `session.start`, `command.run` (commands registered `immediate: true`), `tool.call`, `tool.check`, `ui.render`.
- Decision order, first match wins: (1) a subagent calls Bash and holds no rule for it: deny with a redirect message; (2) Edit or Write on a protected path: deny; (3) across the active set, deny beats ask beats allow; (4) a call matching nothing keeps Claude Code's own verdict. A deny from Claude Code is never overridden.
- Every gating hook has a `.catch` that fails closed (ask or deny, never allow).

## The 15 unverified assumptions

`docs/design.md` ("Unverified assumptions") is the source of truth for this table. The copy here keeps the issue self-contained.

| #   | Assumption                                                                                                                                                                                                         | Why it matters                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `tool.check` exposes the tool input, such as the Bash command                                                                                                                                                      | Rules cannot look at the command without it                                                                             |
| 2   | `tool.call` and `tool.check` carry an agent id; main-session and subagent calls are distinguishable; `tool.check` still fires for a call `tool.call` denied                                                        | Subagent rules and per-agent profiles depend on it                                                                      |
| 3   | A slash command's text reaches `prompt.submit`                                                                                                                                                                     | Tells when a skill-declared profile ends                                                                                |
| 4   | The test kit can raise `tool.check` directly                                                                                                                                                                       | Otherwise the verdict hook is tested only through `decide`                                                              |
| 5   | Each terminal session has its own copy of module state; `$.state` after `/clear` and on resume, whether a signal for them exists, and whether the `session.start` event says why it fired (startup, resume, clear) | `$.state` is per session; module variables must not be used. Profiles must reset on `/clear`, not be restored on resume |
| 6   | A mod can read the current permission mode                                                                                                                                                                         | Avoids loosening in auto and bypass mode                                                                                |
| 7   | A mod can ask Claude Code how it would decide a call                                                                                                                                                               | Needed for "never override a stricter verdict"                                                                          |
| 8   | Settings files can define environment variables                                                                                                                                                                    | Decides which files protected paths must cover                                                                          |
| 9   | Plugins are stored under `~/.claude/plugins/`                                                                                                                                                                      | Decides the protected paths                                                                                             |
| 10  | A mod sees a subagent launch (the Agent call input, including the prompt), and an event or field gives the new agent's id together with the call's `toolCallId` or another value linking it to the call.           | Needed to read the profiles the parent assigns and tie them to the agent id                                             |
| 11  | Hooks run for `bypassPermissions` agents                                                                                                                                                                           | Otherwise those agents skip the mod entirely                                                                            |
| 12  | Hooks run under `claude -p`, and a hook can tell that the session is headless (a flag on the event, an environment variable, or similar)                                                                           | Needed for headless runs and for turning asks into denies there                                                         |
| 13  | A mod can draw below the entry box                                                                                                                                                                                 | Otherwise the band stays above the prompt                                                                               |
| 14  | A command can offer argument completion                                                                                                                                                                            | Decides how profile names are suggested                                                                                 |
| 15  | A mod can tell when a skill starts and ends                                                                                                                                                                        | Needed for skill-declared profiles (later)                                                                              |

`docs/design.md` is the source of truth for this table. If it changes, re-sync this table.

Assumption 4 means the plugin test facility: the way to run a mod's hooks in a test and raise `tool.check` by hand. Look for `claude plugin test` and the "Test a mod" docs page (step 2). These names are unverified.

**Bash-only session:** a session whose only way to run Claude Code is `claude -p` from Bash. It has no interactive terminal (TTY).

Each row gets exactly one verification method (row 12 covers both parts: hooks run under `claude -p`, and headless is detectable):

| Method                                             | Rows                    |
| -------------------------------------------------- | ----------------------- |
| `claude -p`                                        | 1, 2, 6, 10, 11, 12, 15 |
| declarations plus a `claude -p "/<command>"` probe | 3                       |
| declarations                                       | 7                       |
| docs                                               | 4, 8, 9                 |
| docs and any declaration                           | 5                       |
| docs and declarations (no interactive check here)  | 13, 14                  |

A docs or declarations row is `unknown` only if no source states the fact.

Row 7 (declarations only) maps to a status like this:

| Finding in the declarations                           | Status     |
| ----------------------------------------------------- | ---------- |
| They expose a complete way to ask for the verdict     | `verified` |
| They expose an incomplete way                         | `partial`  |
| They were read and expose no way                      | `failed`   |
| No source states it (declarations unreadable or mute) | `unknown`  |

## Existing code

- `types/index.d.ts`: only a comment and `export {}`. It declares nothing yet, not even `$.state`. This spike declares `$.state` and every other shape the mod uses.
- `hooks/register.ts`: wiring stub. `hooks/policy.ts`: only `export type Verdict = "allow" | "ask" | "deny"`. `hooks/hooks.json`: `{}`.
- `scripts/check-gating-catch.mjs`: scans `hooks/register.ts` for `$.on("event", ...)` registrations and requires `.catch(` on `tool.call`, `tool.check`, `prompt.submit` and `command.run`. Both the `$.on` syntax and the event list are assumptions. It reads the hard-coded path `hooks/register.ts`, has no export and runs `process.exit` at the top level, so it cannot be unit tested as written.
- `scripts/check-action-pins.mjs`, `scripts/check-action-pins.d.mts` and `tests/check-action-pins.test.ts`: the model for a testable script (exported pure function, typing file, thin main behind an `import.meta.url` guard, test).
- `scripts/check-manifests.mjs`, `.claude-plugin/plugin.json` and `tests/repo-structure.test.ts`: manifest checks and the structure test that must keep passing.
- `CLAUDE.md`: commands, testing strategy, principles. `docs/design.md`: the design and the assumptions table.

## Goal

Replace guesses with facts. Verify each of the 15 assumptions against a real Claude Code, write minimal type declarations from what is observed, and record every design change.

## Scope

- Find the Claude Code documentation for mods and the procedures to load, run and launch (step 2 of "How to start").
- Load a small probe mod (the prototype) by those procedures and observe the real shapes of events, payloads and declarations.
- Verify each row by its method in the table above. Probe rows (`claude -p`): tool input in `tool.check` (1); agent id on `tool.call` and `tool.check`, whether main-session and subagent calls are distinguishable (for example only subagent calls carry an id, or the id differs from a known main-session id), and whether `tool.check` still fires for a call that `tool.call` denied (2; run a main-session call and a subagent call, and a call that a `tool.call` deny should block); permission mode readable (6); subagent launch visibility: the Agent tool call input with its prompt, which event or field gives the new subagent's agent id, and whether that event also carries the Agent call's `toolCallId` or another value linking it to the call (10); hooks under `bypassPermissions` agents (11); hooks under `claude -p` and whether a hook can detect that the session is headless (a flag on the event, an environment variable, or similar) (12); skill start and end (15).
- Rows that need an interactive terminal cannot be observed in a Bash-only session: slash commands run live, the band (13), argument completion (14), hot-reload and two concurrent sessions. Rows 13 and 14 are read from the docs and declarations. They end `documented` or `verified` if those state the fact, and `unknown` only if nothing does. The Evidence cell gives the source or the reason, and the row states its fallback or why none is needed. Do not block on them; the owner may check them interactively later. The design already has fallbacks: the band stays above the prompt (13), and an unknown profile name returns an error that lists the valid names (14).
- Row 5 (state per session, what happens to `$.state` on `/clear` and on resume, whether a signal for them exists, and whether `session.start` says why it fired) is verified from the docs and any declaration. It becomes `unknown` only if neither states it. Draft 04 depends on this finding.
- While probing row 5, also note whether a session id is available (on the `session.start` event or on the hook events). Draft 07 puts it in log entries and `/gate-why` filters by it. No new assumption row; the count stays 15.
- Also note the transcript line format that Draft 08's replay reads (the JSON Lines entries: `tool_use` content blocks with `id`, `name` and `input`, the sidechain marker for subagent calls, `cwd` and the session id). No new assumption row; the count stays 15.
- With the same `claude -p "/<command>"` probe, note whether a command handler receives the raw argument text or only tokens. Draft 08's `/gate-explain` needs the raw text to keep odd spacing in a Bash command. No new assumption row; the count stays 15.
- Row 3 settles whether `prompt.submit` stays in the gating event list. Its methods are the declarations plus a `claude -p "/<command>"` probe.
- Rows 4, 7, 8 and 9 use their single method (docs for 4, 8 and 9; declarations for 7); none is probed.
- Read the built-in sec-default source if it is readable and note its fail-closed patterns. Its location is unknown. If the source is not readable, record that and rely on the docs.
- Propose the minimum supported Claude Code version in `docs/design.md`, marked "proposed". The owner's confirmation is recorded in the PR review.
- Update `docs/design.md`: add "Status" and "Evidence" columns to the assumptions table and change any section the findings affect. Run `npm run format` after editing tables there, because Prettier and markdownlint check them.
- Match `hooks/hooks.json` (currently `{}`), `.claude-plugin/plugin.json` and `scripts/check-manifests.mjs` to the real manifest shape, with `tests/repo-structure.test.ts` still passing.
- Make `scripts/check-gating-catch.mjs` testable, tests first. The script has no export and exits at the top level, so write `tests/check-gating-catch.test.ts` first, importing the not-yet-exported pure function. The tests fail. Then extract the function like `scripts/check-action-pins.mjs` (exported pure function, `.d.mts`, thin main) and the tests pass. The tests pin down the current behaviour: the registration pattern, the event list and the `.catch` check. Adjust the syntax and events afterwards, once the real syntax is known from the docs step.
- Write `types/index.d.ts` by hand (see Acceptance criteria).
- Decide the `prompt.submit` question: keep it in the gating list if assumption 3 holds, otherwise remove it from the script and the docs.

## Out of scope / later

Building any production feature beyond the items in Scope. The probe mod is throw-away.

## If an assumption fails

Any `failed` or `partial` row gets a fallback written into `docs/design.md`, with an impact note for each affected draft.

Assumptions 1, 6 and 7 are central to the design. Row 7 uses the status mapping in Scope: a complete way is `verified`, an incomplete way is `partial`, declarations read that expose none are `failed`, and no source stating it is `unknown`. If any of the three is `failed`, `partial` or `unknown`, finish observing the other rows (they are independent), then report everything together to the owner (see "Stop and ask" in Working rules). Draft no fallback for 1, 6 or 7 until the owner answers.

Known impacts to start from:

- Assumption 2, no agent id, or main-session and subagent calls not distinguishable: subagent profiles (Draft 06) cannot be enforced per agent, and every call counts as main-session, so the subagent-Bash deny (Draft 03 and 04) is inert. Say what is dropped. If `tool.check` still fires for a call that `tool.call` denied, Draft 04 and 07 log that call once, by tool-call id.
- Assumption 10: the launch is not visible, no event or field gives the new subagent's agent id, or that event carries no `toolCallId` or other value linking it to the Agent call: no assignment can be tied to an agent (matching by arrival order is not allowed), so subagents get the baseline only (Draft 06). Say what is dropped.
- Assumption 11: `bypassPermissions` agents skip the mod and cannot be gated, so stop and ask (Draft 06). Draft 10 also stops and asks at once, without waiting for Drafts 06 and 09, and must not leave the three agents running ungated.
- Assumption 12: if hooks do not run under `claude -p`, headless runs are unsupported. If they run but headless cannot be detected, the ask-to-deny conversion is inert (Draft 04) and Claude Code resolves asks itself.

If `CLAUDE_CONFIG_DIR` is not supported (step 4), stop and ask. Do not probe against the live config.

## Acceptance criteria

- [ ] Every one of the 15 rows in the `docs/design.md` assumptions table has a Status and an Evidence cell. Status is one of:
  - `verified`: observed at runtime, or stated explicitly in the type declarations.
  - `documented`: only the docs say so.
  - `failed`, `partial` or `unknown` otherwise. `unknown` is allowed only for a row whose docs or declarations do not state the fact, or a probe row that could not be observed (see "Scope"). Its Evidence cell gives the reason, and the row states a fallback or why none is needed.
  - Row 7 follows the mapping in Scope: complete way `verified`, incomplete way `partial`, declarations read and expose none `failed`, no source `unknown`.
- [ ] Every Evidence cell cites its source: a declaration line, a doc section, or for a runtime-verified row a short quoted excerpt with the date and Claude Code version, secrets redacted. Probe logs are never committed, so the excerpt in `docs/design.md` is the evidence.
- [ ] Every `failed` or `partial` row has a fallback and an impact note for the affected drafts in `docs/design.md`. If row 1, 6 or 7 is `failed`, `partial` or `unknown`, the owner was told first and no fallback was drafted before that.
- [ ] `docs/design.md` records the Claude Code version tested, the version the docs say introduced mods, and the minimum supported version, marked "proposed". The owner's confirmation is recorded in the PR review.
- [ ] `docs/design.md` records what step 2 found: how a mod is loaded and hot-reloaded, how to run `claude` and `claude -p` with it, and how to launch a subagent and a `bypassPermissions` agent.
- [ ] `docs/design.md` records the real hook and plugin manifest shape. `hooks/hooks.json`, `.claude-plugin/plugin.json` and `scripts/check-manifests.mjs` match it, and `tests/repo-structure.test.ts` passes.
- [ ] `docs/design.md` summarises the sec-default fail-closed patterns, or states that its source is not readable.
- [ ] `types/index.d.ts` is a hand-written minimal declaration file. It declares `$.state` and the other shapes the mod uses, written from observed shapes and checked against the installed Claude Code version, which the file states. Claude Code's own declaration file is not copied into the repo. `npm run check` passes with it without new lint, knip or tsconfig exceptions, unless one is recorded next to it with the reason.
- [ ] `tests/check-gating-catch.test.ts` was written first against the unexported function and failed. `scripts/check-gating-catch.mjs` now exports a pure function, has a `.d.mts` typing file and a thin main, and the tests pass, pinning down the registration pattern, event list and `.catch` check. After the docs step, its registration pattern and event list match the real syntax and gating event names, with tests updated. The `prompt.submit` decision is applied in the script and in `docs/design.md`.
- [ ] When the spike edits `docs/design.md`, it also refreshes the "Updated" date line at the top, and `npm run format` and `npm run check:docs` still pass.
- [ ] No probe code, probe file or log is committed. Nothing probe-related remains in `hooks/`.
- [ ] The spike branches from `main`, so it starts after PR #1 (the initial repo setup) is merged. The work ends with a PR to `main`, and `npm run check` passes.

## How to start

1. Run `claude --version`. If mods are unavailable in the installed version, stop and ask.
2. **Find the docs and learn how to load a mod.** The docs location and the load command are not recorded anywhere yet. Do not invent a URL, command or manifest shape. Find them in the Claude Code documentation or the installed Claude Code. These names come from the original brainstorm and are unverified: pages titled "Mods overview", "React to events", "Use the mods API", "Draw in the interface", "Test a mod" and "Mods reference"; the CLI commands `claude plugin validate` and `claude plugin test`; and a minimum Claude Code version of 2.1.287. Learn, and record, how a mod is loaded and hot-reloaded, how to run `claude` and `claude -p` with it, and how to launch a subagent and a `bypassPermissions` agent. Also learn where Claude Code writes its own type declarations when a mod is loaded (step 5 uses them). Later steps and the acceptance criteria refer to this step for the procedures.
3. Check that PR #1 is merged. Run `git fetch` and `git pull --ff-only` on `main`, then create the branch `spike/verify-api` from it (not from `feature/initial-repo-setup`).
4. Create the probe in a temporary directory outside the repo, not in `hooks/`: the session scratchpad directory if the session's instructions list one, otherwise an OS temp directory. Load it the way step 2 found. The mcp-workspace write tools reach only the project directory, so use the native Write tool for probe files and Bash to run them, in that directory only (the exception in Working rules). Log the payload of each event to a file outside git. Run the probe with bare `claude`, not `claude.bat` (the repo launcher), with `CLAUDE_CONFIG_DIR` set to an isolated directory in the same command, so it cannot gate or disturb a live session. Check which shell is available on Windows (Git Bash or PowerShell) and use its syntax to set the variable. Verify first that the variable is supported; if not, stop and ask. The isolated directory may have no login. If the probe `claude` cannot authenticate, stop and ask. Do not use the live config, and do not set an API key on your own.

   Choose the permission flags for `claude -p` probes from `claude --help` (permission mode, allowed tools), so the probe's tool calls do not stall on permission prompts. The exact flag names are unverified: read them from `claude --help`. Run row 6 (reading the current permission mode) once under each permission mode the CLI offers. Use bypass-style flags only inside the isolated `CLAUDE_CONFIG_DIR` and only for the probe.

5. **Read Claude Code's type declarations.** Claude Code writes its own declarations when a mod is loaded; the location comes from step 2. Read them to mark rows `verified` by declaration, and to write the minimal hand-written `types/index.d.ts`. Do not copy the file into the repo.
6. Refactor `scripts/check-gating-catch.mjs` like `scripts/check-action-pins.mjs`. Read `scripts/check-action-pins.mjs`, `scripts/check-action-pins.d.mts` and `tests/check-action-pins.test.ts` first to confirm the pattern. The script has no export and exits at the top level, so it cannot be tested as it stands. Write `tests/check-gating-catch.test.ts` first, importing the not-yet-exported pure function, and see it fail. Then extract the function, add a `.d.mts` typing file and leave a thin main; the tests pass. They pin down the current behaviour (registration pattern, event list, `.catch` check). Keep knip and lint green. Once the real syntax and events are known from step 2, adjust the registration pattern and event list, with the tests first.
7. Fill in one table row per assumption, citing the evidence. Redact secrets from every excerpt.

## Working rules

TDD where code exists, KISS, clean code, concise writing. Use the mcp-workspace MCP tools for file and git work. Bash is allowed only for:

- `npm run ...`;
- `git add`, `git commit`, `git push` and `git checkout -b`;
- `git fetch` and `git pull --ff-only` on `main`, to start from an up-to-date `main`;
- running Claude Code itself (`claude --version`, `claude`, `claude -p`, launching subagents) and the probe.

Exception, because no MCP tool exists for it: the native Write tool and Bash may create and run probe files in the temp directory outside the repo, and only there.

Nothing else.

**Stop and ask** (used throughout this issue) means: report to the owner in the session chat if an owner is attached, otherwise comment on the GitHub issue. List what is done and what is blocked. If the branch exists, leave the work uncommitted on it; if no branch exists yet, just report, as there is nothing to leave uncommitted.

Commit and push to the `spike/verify-api` branch after each major change, and run `npm run check` first. Keep probe files and logs out of git.

## Depends on

none (starts after PR #1 is merged to `main`)

## Open questions

- The docs location, the mod load command and the location of the sec-default source are unknown (step 2).
- `prompt.submit` is a gating event in the script but not in the design's Events table. The spike settles it (see Scope).

## References

- [Unverified assumptions](../design.md#unverified-assumptions)
- [Events](../design.md#events)
- [Work plan](../design.md#work-plan)
- [Prior art](../design.md#prior-art)
- [Failure](../design.md#failure)
