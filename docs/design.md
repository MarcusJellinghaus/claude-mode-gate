# claude-mode-gate: design

Updated 9 October 2026. Owner: Marcus Jellinghaus.

## Summary

mode-gate is a Claude Code mod that limits what Claude may do. A fixed **baseline** allows read access and a few undoable project writes. Named **profiles** add more rules (allow, ask, deny). The user switches profiles on and off with one command. Everything else asks, and Bash asks unless a rule allows that exact kind of call.

The design is agreed. Nothing is built yet. Several API details are unverified (see [Unverified assumptions](#unverified-assumptions)), so a verification spike comes first.

Repo description: A Claude Code mod with switchable permission profiles: a safe baseline, named profiles you switch on and off, and everything else still asks.

## Goals and non-goals

Goals, in priority order:

1. **Limited access by default.** Read access (including running checks and tests) plus a few write tools confined to the project folder, all undoable with git.
2. **Profiles.** The user switches named profiles on and off. Several can be active at once.
3. **Simple, visible control.** One command per action. The active profiles are always visible.
4. **Tighter security.** Bash needs manual approval unless a rule allows that call. Nothing is allowed by default beyond the baseline.
5. **Guidance.** A denied Bash call tells Claude which approved tool to use instead.

Non-goals:

- The recent-skills display. It is a separate mod (claude-recent-skills).
- Sandboxing. A mod runs with the user's permissions. mode-gate gates Claude's tool calls only.
- Replacing Claude Code's permission rules. Deny rules and organisation policy keep precedence.

## Working principles

- TDD: write a failing test first, then the simplest code that passes, then refactor.
- KISS: the simplest design that works. Nothing without a present need.
- Clean code: small functions, names that state intent, no dead code, comments explain why.
- Concise writing: chat, commits, PRs, docs and comments are short and readable.

## Concepts

- **Baseline.** Always-on rules (see below). It also holds the fixed denies (protected paths).
- **Profile.** A named bundle with a description and three rule lists: `allow`, `ask` and `deny`. The same shape as the `permissions` block in `settings.json`. A profile that only has `deny` entries is a restriction, for example a read-only profile.
- **Delegable.** A boolean per profile, default `true`. A non-delegable profile cannot be handed to a subagent.
- **Active set.** The baseline plus the profiles that are switched on.
- **Rule syntax.** Claude Code's: `mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`.

### Where profiles live

Three layers:

1. The **baseline** is built into the mod and cannot be overridden.
2. **Built-in profiles** (`git-write`, `issues`) ship with the mod and work with no config file.
3. The **user file** adds profiles and may replace a built-in by reusing its name. The whole definition wins, with no merging.

The user file is JSON at `$XDG_CONFIG_HOME/mode-gate/config.json`, falling back to `~/.config/mode-gate/config.json` on all platforms, Windows included. `MODE_GATE_CONFIG` overrides the path, mainly for tests and headless runs. The shape is `{ "logDir": "logs", "profiles": { "<name>": { "description", "delegable", "allow", "ask", "deny" } } }`. `logDir` is optional (default `logs`). A JSON Schema, `mode-gate.schema.json`, ships in the repo, and users reference it with `$schema`.

A project may contain `.mode-gate.json` at its root, in the same shape. Its profiles are proposals and are never active. `/gate-check` lists them. The user adopts one by copying it into their own config by hand. Across active profiles, deny beats ask beats allow, whatever the source, and nothing loosens the baseline's denies. An invalid config fails closed: only the baseline is active, and the errors are shown.

### Baseline

Always on:

- **Reads:** the mcp-workspace read tools (files, directories, search, reference projects, read-only `git`, GitHub reads, `check_*`).
- **Writes:** `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`. Protected paths still deny. Deleting untracked files cannot be undone with git.
- **Checks:** the exact scripts `npm run check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:*` and `audit`. `npm ci` and `npm install` ask, because they run install scripts.
- **Other tools:** Skill, Agent, web fetch and web search. A fetched URL or a search query can leak data, and fetched pages can carry injected instructions. The baseline accepts this.
- **Ask:** edits to `package.json`, `scripts/` and the tool configs, because the allowed `npm run` scripts execute them.
- **Deny:** the protected paths (see [Protected paths](#protected-paths)).

The Ask and Deny bullets are implemented as path guards (Draft 05), not as profile rules: the v1 rule grammar has only whole-tool and Bash prefix rules, so it cannot say "edit tool, but only for this path".

Not in the baseline: git writes (`add`, `commit`, `push`, `checkout -b`). A `git-write` profile allows them. All other Bash asks.

### Decision order

The first rule that matches wins:

1. A subagent calls Bash and holds no rule for it: deny, with the redirect message.
2. Edit or Write targets a protected path: deny.
3. Across the active set, deny beats ask beats allow.
4. A call that matches nothing keeps Claude Code's own verdict.

A deny from Claude Code is never overridden. An allow from Claude Code is downgraded to ask for Bash unless an active rule allows the call. "Holds no rule" in step 1 means that no active allow rule matches the call.

The path guards are extra sources fed into this order, not overrides: a protected-path deny is a step-2 deny, and the ask-path guard is an ask source at step 3, so a profile deny still wins over it. A guard never turns a deny into an ask or an allow.

### Matching

- Tools match by name and, later, by argument. Version 1 uses whole-tool rules only.
- Bash rules are exact or prefix rules in Claude Code's syntax. Allow rules are strict: exact equality or `startsWith`, and never a match if the command contains any of `& ; | $ ( ) \` < >` or a newline. Anything unusual asks.
- Deny and ask rules always use a boundary-checked substring test, with or without metacharacters. The rule text (prefix with trailing whitespace trimmed, or the exact command text) must appear in the command after the start, whitespace or a metacharacter, and before whitespace, a metacharacter or the end. Every occurrence is tested, and one valid occurrence is enough. The end test is skipped only for prefix rules whose trimmed prefix ends in a colon, as in `npm run check:`; exact rules always need it. An empty prefix always matches. So `deny Bash(git push *)` fires on `git push`, `git push<TAB>origin`, `x;git push`, `git push&&y` and `xgit push; git push`, but not on `git pushd`; `deny Bash(rm -rf /)` fires on `rm -rf / b` and `a; rm -rf /`, but not on `rm -rf /tmp`. A plain `startsWith("git push ")` would miss the bare forms and make the deny inert.
- When Claude Code's own verdict is unavailable (assumption 7), `decide` treats it as `ask`.
- The redirect text of the step-1 deny comes from `redirectHint` in `hooks/guards.ts`; `register.ts` adds it to the hook result, `decide` does not build it.
- A whole-tool `Bash` rule matches every Bash call.
- Issue and GitHub work uses the typed mcp-workspace tools, not Bash text.

## Commands

| Command                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `/gate-on <profile>...`  | Switch profiles on. Prints a short summary of what they allow.                                 |
| `/gate-off <profile>...` | Switch profiles off. `all` switches every profile off.                                         |
| `/gate-status`           | Baseline summary, active profiles and the config path in use.                                  |
| `/gate-why [n]`          | The last n verdicts with the rule and profile that fired.                                      |
| `/gate-check`            | Validate the config: conflicts, unknown tools, over-broad rules. Also lists project proposals. |
| `/gate-explain <tool> …` | Dry run one call and show the verdict and the rule chain.                                      |

Replay runs offline as a command-line tool. It reads a Claude Code session transcript and reports what each call would have been under a given config.

Only the user switches profiles. The mod registers no tool that Claude could call to switch.

## Lifetimes

- A profile the user switches on lasts the session.
- A profile that a skill declares lasts until the next prompt.
- Profiles are cleared on `/clear` (the config is reloaded) and never restored on resume: profiles switched on in an earlier session do not come back.
- The band shows profile names, so a forgotten profile stays visible.

## Subagents

- A subagent gets the baseline plus the profiles its parent assigns at spawn. Allow rules come only from those; restrictions are inherited (below).
- The parent assigns profiles in the prompt of its Agent tool call. The first line is `mode-gate-profiles: name1, name2`. An absent or empty marker means baseline only. The mod reads it from the Agent call input (assumption 10).
- **Matching a launch to the new agent.** The key is the Agent call's `toolCallId`. The mod keeps a pending assignment record under that id and binds it to the subagent's agent id on the event that carries the new id (assumption 10). Matching by arrival order or "the only pending record" is forbidden. If the id-bearing event carries no `toolCallId` (or other linking value), or there is no id-bearing event, there is no binding and the subagent gets the baseline only. Parallel spawns therefore cannot swap assignments. At bind time the assignment is intersected with the parent's currently held set; `/gate-off` and `/clear` also clear pending records.
- **Writing the record.** For any Agent call that is not denied, once, idempotently by `toolCallId`, only on the live decision path. The record stores the calling agent's id (`main` for the main session), so binding knows whose held set to intersect with. A `tool.call` hook never sees an allow, so whichever live hook first sees the call and returns a non-deny verdict writes it. A dry run (`/gate-explain`) never writes it, and neither does an Agent call that was denied or rejected as an invalid assignment.
- The parent can assign only profiles it holds, so authority only narrows down the tree. The chain ends at the user. Nested agents can only narrow.
- **Restrictions are inherited, allows are not.** The `deny` and `ask` lists of the main session's active profiles also apply to every subagent (deny beats ask beats allow as usual); `allow` lists apply to a subagent only when assigned. So a deny-only profile in the main session, such as a read-only profile, cannot be escaped by launching a subagent. A subagent's effective set is the baseline, its assigned profiles' rules, and the main session's active profiles' deny and ask lists.
- The parent writes the advice to use only the assigned profiles into the spawn prompt itself; the mod adds nothing to the prompt. That is advice; the mod enforces the same list.
- An Agent call whose marker names a profile the parent does not hold, or one that is not delegable or unknown, is denied. The deny is a guard result (`source` `guard`) from the pure function `checkAssignment(requested, held, profiles)` in `hooks/assignment.ts`, which returns the offending names; `register.ts` wires it as a closure over `$.state`. The message names the profiles and who decides: the parent for a profile it does not hold, the user (via `/gate-on` in the main session) for a non-delegable one.
- A subagent with no assignment record (unknown agent id, wiped state, no marker, no binding) gets the baseline only, plus the inherited deny and ask lists.
- A denied subagent call (also in a headless run) returns this message, not the list of all switched-off profiles that a main-session call gets. It names the delegable profiles that would allow it and that the parent holds, or for a non-delegable one, telling the subagent to ask the user to run `/gate-on <name>`. The subagent stops and reports. The parent decides, and profiles marked non-delegable go to the user. There is no request tool.
- Switching a profile off removes it from all descendants (children and grandchildren). Assignments are cleared on `/clear` and on `session.start`. Switching the profile on again does not bring delegated copies back.
- Limit: the subagent-Bash deny (decision step 1) covers Bash only. An unmatched non-Bash call keeps Claude Code's verdict, which is allow in a `bypassPermissions` agent. What holds: the allow rules of profiles that were not assigned never apply to a subagent, and the main session's deny and ask lists always do.
- Fallbacks: without assumption 2 the subagent-Bash deny is inert and every call counts as main-session; without assumption 10 no assignment is possible, so subagents get the baseline only; without assumption 11 the mod cannot gate `bypassPermissions` agents, so work stops until the owner decides.

Later: skills and agents may declare profiles in their definitions, which would make the dedicated "specialist" agents unnecessary.

## Headless runs

- Starting profiles come from the environment variable `MODE_GATE_PROFILES`, read once per process and applied in every new process, including `claude --resume`, for example `MODE_GATE_PROFILES=issues,git-write`. A repo cannot set it.
- Profiles cannot change during a run.
- A call that would ask because of an active rule or a guard is denied (a passed-through Claude Code verdict stays `ask`), with a message naming the available profiles whose allow rules would match the call, or a generic message if none would. This needs the session to be detectably headless (assumption 12). If it is not detectable, the mod returns `ask` and Claude Code resolves it.

## Permission modes

Auto and bypass mode are out of scope for version 1. The README says the mod is built for the default modes. If the API shows the mode, profiles do not loosen anything in auto or bypass. A later **enforce mode** could invert this: baseline plus profiles become the allowlist, and everything else is denied.

## Protected paths

Covered tools: the mcp-workspace write tools (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`; a tool name matches on the part after the last `__`) and the native `Edit` and `Write`. A directory that contains a protected path counts.

- **Deny:**
  - the mod's config file and the log folder;
  - `settings*.json` inside any `.claude` folder, in the project and in the home folder (hook definitions live there);
  - `~/.claude/plugins/**`, the installed copy of the mod;
  - shell profiles in the home folder: `.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.config/fish/config.fish`, and the PowerShell `*profile*.ps1` files under `Documents/PowerShell` and `Documents/WindowsPowerShell`.
- **Ask:** the rest of `.claude/` (skills, agents, `CLAUDE.md`) in the project and the home folder, and in the project `package.json`, `scripts/`, the tool configs, `.mcp.json`, `.git/hooks/**` and `.git/config` (an allowed `git commit` runs hooks). Also `~/.claude.json`. `.mcp.json` and `~/.claude.json` can launch programs.
- The project's own `hooks/`, `types/` and `.claude-plugin/` are not protected. Denying them would block development of this repository while the mod is active.
- Paths are compared case-folded, with `/` and `\` as separators and `.` and `..` resolved without touching the file system. Windows forms are normalised first: `\\?\` and `\\.\` prefixes, trailing dots and spaces on a segment, NTFS stream suffixes (`:name`, `::$DATA`) and MSYS drive paths (`/c/Users/x` becomes `c:\Users\x`, also for the home folder).
- A directory counts only when a fixed-path entry lies under it. A nested `.claude` inside an arbitrary subdirectory is not found (known limit: the guard is pure and cannot list directories).
- Other write routes (PowerShell, NotebookEdit, other MCP file tools, symbolic links) are a known gap.

## Decision log

- The mod writes a log file in the folder named by the config key `logDir` (default `logs`), resolved relative to the session's project directory; an absolute path is allowed.
- Each entry has a timestamp, the verdict, the rule and profile that fired, the agent and the tool name. It records no arguments.
- `/gate-why` reads the log. Replay uses session transcripts, not the log.

## Failure

Every gating hook has a `.catch` handler that fails closed (never allow): `tool.call` returns deny, because it cannot ask; `tool.check` returns ask.

## Code structure

- `policy.ts`: pure decision logic. No `$`, no state, no imports.
- `register.ts`: thin event wiring.
- TypeScript in strict mode.
- State lives in `$.state` (per session), never in `$.store`.

### Events

| Event           | What the hook does                                                         |
| --------------- | -------------------------------------------------------------------------- |
| `session.start` | Reads `MODE_GATE_PROFILES`, sets starting profiles, registers commands.    |
| `command.run`   | Switches profiles and redraws the band. Registered with `immediate: true`. |
| `tool.call`     | Denies subagent Bash and protected-path writes.                            |
| `tool.check`    | Returns the verdict from `decide`.                                         |
| `ui.render`     | Draws the active profiles in the band and keeps other mods' content.       |

### Repo layout

```text
claude-mode-gate/
  .claude-plugin/   plugin.json, marketplace.json
  hooks/            hooks.json, register.ts, policy.ts
  types/            index.d.ts
  tests/
  docs/             design.md
  scripts/          check scripts
```

## Testing

See `CLAUDE.md`, "Testing strategy". Policy tests are table-driven and cover the decision order, chained and substituted Bash, protected paths, fail-closed behaviour and the reset after `/clear`.

## Security model

The rule is that only the user changes profiles, and the mod never makes Claude Code's own verdict weaker than a deny.

| Route                                     | Risk                                          | How it is closed                                                               |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Claude switches a profile itself          | Claude widens its own permissions             | Commands are for the user. The mod registers no tool for switching.            |
| Claude edits the mod's source or config   | The policy is rewritten                       | Protected-paths deny on Edit and Write.                                        |
| Claude sets the environment variable      | The profile set changes mid-session           | Not possible: the variable is read once, and a child cannot change its parent. |
| Claude writes the variable into a profile | The next session starts in the wrong state    | Protected-paths deny on shell profiles. The band shows the state.              |
| A repo grants itself permissions          | A project file pre-enables profiles           | Starting profiles come only from the user's environment.                       |
| Another mod submits a prompt as the user  | A skill-declared profile is triggered         | Install only trusted mods.                                                     |
| Chained or substituted Bash               | `gh issue edit 1 && rm -rf .` passes a prefix | Metacharacters make a prefix rule not match. Prefer typed tools.               |
| A hook throws or times out                | The hook is skipped and the call runs         | `.catch` on every gating hook returns ask or deny.                             |
| Auto mode                                 | An allow skips the classifier                 | Out of scope. Profiles do not loosen when the mode is known.                   |
| Deny rules                                | A mod cannot approve what a deny refuses      | Keep Bash out of deny. Use ask as the baseline.                                |
| A forgotten profile                       | A standing permission                         | Names in the band, cleared on `/clear`, never restored on resume.              |
| A subagent asks for more                  | Confused deputy                               | The parent decides, and non-delegable profiles go to the user.                 |
| Other write routes                        | PowerShell, NotebookEdit, symlinks            | Not closed yet.                                                                |

The mod does not protect against anything a mod or program does outside Claude's tool calls.

## Unverified assumptions

Check each against the mods reference and its TypeScript declarations before building.

| #   | Assumption                                                                                                                                                                                                         | Why it matters                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tool.check` exposes the tool input, such as the Bash command                                                                                                                                                      | Rules cannot look at the command without it.                                                                                              |
| 2   | `tool.call` and `tool.check` carry an agent id; main-session and subagent calls are distinguishable; `tool.check` still fires for a call `tool.call` denied                                                        | The subagent rules and per-agent profiles depend on it.                                                                                   |
| 3   | A slash command's text reaches `prompt.submit`                                                                                                                                                                     | Needed to tell when a skill-declared profile ends.                                                                                        |
| 4   | The test kit can raise `tool.check` directly                                                                                                                                                                       | Otherwise the verdict hook is tested only through `decide`.                                                                               |
| 5   | Each terminal session has its own copy of module state; `$.state` after `/clear` and on resume, whether a signal for them exists, and whether the `session.start` event says why it fired (startup, resume, clear) | `$.state` is documented as per session. Do not rely on module variables. Profiles must reset on `/clear` and never be restored on resume. |
| 6   | A mod can read the current permission mode                                                                                                                                                                         | Needed to avoid loosening in auto and bypass mode.                                                                                        |
| 7   | A mod can ask Claude Code how it would decide a call                                                                                                                                                               | Needed for "never override a stricter verdict".                                                                                           |
| 8   | Settings files can define environment variables                                                                                                                                                                    | Decides which files the protected paths must cover.                                                                                       |
| 9   | Plugins are stored under `~/.claude/plugins/`                                                                                                                                                                      | Decides the protected paths.                                                                                                              |
| 10  | A mod sees a subagent launch (the Agent call input, including the prompt), and an event or field gives the new agent's id together with the call's `toolCallId` or another value linking it to the call.           | Needed to read the profiles the parent assigns and tie them to the agent id.                                                              |
| 11  | Hooks run for `bypassPermissions` agents                                                                                                                                                                           | Otherwise those agents skip the mod entirely.                                                                                             |
| 12  | Hooks run under `claude -p`, and a hook can tell that the session is headless (a flag on the event, an environment variable, or similar)                                                                           | Needed for headless runs and for turning asks into denies there.                                                                          |
| 13  | A mod can draw below the entry box                                                                                                                                                                                 | Otherwise the band stays above the prompt.                                                                                                |
| 14  | A command can offer argument completion                                                                                                                                                                            | Decides how profile names are suggested.                                                                                                  |
| 15  | A mod can tell when a skill starts and ends                                                                                                                                                                        | Needed for skill-declared profiles.                                                                                                       |

## Later

- Parameterised profiles, for example `issues 123` for one issue only.
- Profiles that skills and agents declare in their definitions.
- Project profiles that become usable after per-repo approval, and a command that adopts a proposal into the user config.
- A typed commit and push tool, so those calls need no Bash.
- Enforce mode for bypass.
- Replay refinements and a persistent log with arguments.
- Official plugin directory listing.

## Open items

- The exact rules of the first profiles (`git-write`, `issues`) and which profiles are non-delegable.
- The marketplace name and the minimum Claude Code version.
- Repo setup: apply the ruleset on `main` (PR and CI required, admins included), CodeQL, action pinning.

## Prior art

| Project                | What to borrow                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| issue-board            | Match typed tools, not Bash text. Scope to one issue. Refuse sensitive tools in auto mode. |
| intact-bash-mod        | Never override a stricter verdict. Watch for commands rewritten by other mods.             |
| Flightdeck             | A decision log with credentials masked. A "what it can reach" README section.              |
| review-before-edit     | Ask instead of a flat deny. Its list of uncovered write routes.                            |
| sec-default (built in) | Canonical fail-closed patterns. Not yet read.                                              |
| cmd-guard              | Sturdier command parsing, if Bash matching grows.                                          |
| cc-bash-guard          | Policy as data with its own tests.                                                         |
| mcp-coder              | Governance, CI conventions and the agent-permissions decision record.                      |

## Work plan

1. **Verify.** Check Claude Code version, read the type declarations Claude Code provides and write a minimal hand-written `types/index.d.ts` from observed shapes, check assumptions 1 to 15 with a small probe mod, read the sec-default source.
2. **Build.** `policy.ts` with `decide` and tests first, then `register.ts`, then the commands, the band and the log.
3. **Test.** Policy tables, protected paths, fail-closed, reset after `/clear`, band, CI with `claude plugin validate` and `claude plugin test`.
4. **Publish.** README with "what it can reach" and "what it allows", SECURITY.md, CHANGELOG, licence, topics, awesome-list submission.
