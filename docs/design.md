# claude-mode-gate: design

Updated 9 October 2026. Owner: Marcus Jellinghaus.

## Summary

mode-gate is a Claude Code mod that limits what Claude may do. A fixed **baseline** allows read access and a few project writes. Named **profiles** add more rules (allow, ask, deny). The user switches profiles on and off with one command. Bash that no active rule allows asks. For other tools the mod adds only its own rules and guards; Claude Code's own verdict applies to the rest.

The design is agreed. Nothing is built yet. The mods API has been checked against Claude Code 2.1.292 (see [mods-api-notes.md](mods-api-notes.md)); a small verification spike still covers the open items in [Assumptions](#assumptions).

Repo description: A Claude Code mod with switchable permission profiles: a safe baseline and named profiles you switch on and off. Bash that no active rule allows asks. For other tools the mod adds only its own rules and guards; Claude Code's own verdict applies to the rest.

## Goals and non-goals

Goals, in priority order:

1. **Limited access by default.** Read access (including running checks and tests) plus a few write tools that the mcp-workspace server confines to the project folder. Git restores tracked files; deleting or overwriting an untracked file cannot be undone.
2. **Profiles.** The user switches named profiles on and off. Several can be active at once.
3. **Simple, visible control.** One command per action. The active profiles are always visible.
4. **Guard against mistakes and prompt injection.** Bash needs manual approval unless a rule allows that call. Nothing is allowed by default beyond the baseline. The mod is not a defence against an adversary who can write code and run it (see [Threat model](#threat-model)).
5. **Guidance.** A denied Bash call tells Claude which approved tool to use instead.

Non-goals:

- The recent-skills display. It is a separate mod (claude-recent-skills).
- Sandboxing. A mod runs with the user's permissions. mode-gate gates Claude's tool calls only.
- Replacing Claude Code's permission rules. Deny rules and organisation policy keep precedence.

## Threat model

The mod guards against **mistakes** (a model that wanders off or picks the wrong command) and **prompt injection** (instructions hidden in a fetched page or a file). It does not stop an adversary who can write code and run it. Claude can write a test file under `tests/`, `hooks/` or `types/` (deliberately unprotected, so the mod can be developed with itself active) and then run it with the allowed `npm run test`. The arguments of the allowed `npm run test -- *` are not restricted either. What the mod protects is the installed copy of itself and the user's own config, not the working tree.

## Working principles

- TDD: write a failing test first, then the simplest code that passes, then refactor.
- KISS: the simplest design that works. Nothing without a present need.
- Clean code: small functions, names that state intent, no dead code, comments explain why.
- Concise writing: chat, commits, PRs, docs and comments are short and readable.

## Concepts

- **Baseline.** Always-on allow rules (see below). Its asks and denies (protected paths and risky files) are path guards, not rules.
- **Profile.** A named bundle with a description and three rule lists: `allow`, `ask` and `deny`. The same shape as the `permissions` block in `settings.json`. A profile that only has `deny` entries is a restriction, for example a read-only profile.
- **Delegable.** A boolean per profile, default `true`. A non-delegable profile cannot be handed to a subagent.
- **Active set.** The baseline plus the profiles that are switched on.
- **Rule syntax.** A **subset** of Claude Code's: `mcp__server__tool`, `Bash(npm run check)`, `Bash(git commit *)`. Version 1 supports exact rules and a trailing ` *` prefix rule. A trailing `:*` (and only a trailing one) is accepted and means exactly ` *`, as in Claude Code: `Bash(git push:*)` is the prefix `git push ` (a word boundary, so it does not match `git pushd`). A `:` anywhere else is a literal character. A Bash `*` is valid only as the final character and only as the whole argument (`Bash(*)`) or directly after a space. Any other `*`, including a mid-string one (Claude Code supports it; v1 does not) and one glued to a word (`Bash(git*)`, `Bash(npm run check*)`, a prefix without a word boundary in Claude Code), is a rule error whose message names this limit. An argument with leading whitespace, an empty or whitespace-only argument (`Bash()`, `Bash( *)`) and an exact argument with trailing whitespace are rule errors too. For example, this repo's `.claude/settings.json` uses `Bash(git push * --force)`, which the validator rejects. Globs in deny and ask rules are a [Later](#later) item.

### Where profiles live

Three layers:

1. The **baseline** is built into the mod and cannot be overridden.
2. **Built-in profiles** (`git-write`, `issues`) ship with the mod and work with no config file.
3. The **user file** adds profiles and may replace a built-in by reusing its name. The whole definition wins, with no merging.

The user file is JSON at `$XDG_CONFIG_HOME/mode-gate/config.json`, falling back to `~/.config/mode-gate/config.json` on all platforms, Windows included. `MODE_GATE_CONFIG` overrides the path, mainly for tests and headless runs. The mod reads the environment through `$.env.get("NAME")` with literal names only (`MODE_GATE_PROFILES`, `MODE_GATE_CONFIG`, `XDG_CONFIG_HOME`, `HOME`, `USERPROFILE`); the home folder is `HOME`, else `USERPROFILE`. An empty-string value counts as unset for `MODE_GATE_CONFIG`, `XDG_CONFIG_HOME`, `HOME` and `USERPROFILE`. The shape is `{ "logDir": "logs", "profiles": { "<name>": { "description", "delegable", "allow", "ask", "deny" } } }`. `logDir` is optional (default `logs`). A JSON Schema, `mode-gate.schema.json`, ships in the repo, and users reference it with `$schema`.

A project may contain `.mode-gate.json` at its root, in the same shape. Its profiles are proposals and are never active. In the loaded config, `profiles` is a `Record<string, Profile>` keyed by profile name (the loader sets `Profile.name` from the key, so the two cannot differ) and the proposals are a second `Record<string, Profile>`. `/gate-check` lists them. The user adopts one by copying it into their own config by hand. Across active profiles, deny beats ask beats allow, whatever the source. An invalid config fails closed: only the baseline is active (starting profiles included: they are informational then, never activated), and the errors are shown.

### Baseline

Always on:

- **Reads:** the mcp-workspace read tools (`read_file`, `list_directory`, `search_files`, the reference-project tools, read-only `git`, `check_*`) and the GitHub reads `github_issue_view`, `github_issue_list`, `github_pr_view` and `github_search`. `github_label_list` and `github_subissue_list` are not in the baseline; they belong to the `issues` profile.
- **Writes:** `edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`. The mcp-workspace server confines them to the project folder. Protected paths still deny and risky files ask (path guards, below). Git restores tracked files; deleting or overwriting an untracked file cannot be undone.
- **Checks:** the exact scripts `npm run check`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `test:mutation`, `arch`, `deadcode`, `docs:lint`, `check:manifests`, `check:catch`, `check:pins`, `check:docs` and `audit` (sixteen exact rules, each `Bash(npm run <name>)`; no prefix rule covers the `check:` scripts), plus the prefix `npm run test -- *` so a test loop such as `npm run test -- tests/x.test.ts` does not ask each run. The arguments after `--` are not restricted.
- **Other tools:** Skill, Agent, web fetch and web search. A fetched URL or a search query can leak data, and fetched pages can carry injected instructions. The baseline accepts this.
- **Ask (path guard):** edits to `package.json`, `scripts/`, the tool configs and the other files listed under [Protected paths](#protected-paths), because the allowed `npm run` scripts execute or read them.
- **Deny (path guard):** the protected paths.

The baseline has no ask or deny rules. `npm ci` and `npm install` run install scripts and are not allowed by any rule, so they ask through the Bash downgrade (an unmatched Bash call asks, see [Decision order](#decision-order)). A Claude Code allow such as `Bash(npm ci)` in `settings.json` is still downgraded to ask while the mod is active, so the README must say that the mod asks for them and that `settings.json` allows do not override this.

The path guards are implemented in Draft 05, not as profile rules: the v1 rule grammar has only whole-tool and Bash rules, so it cannot say "edit tool, but only for this path".

Not in the baseline: git writes (`add`, `commit`, `push`, `checkout -b`). A `git-write` profile allows `git add`, `git commit` and `git checkout -b` as prefix rules, and `git push` only in the exact form `git push` (new branches need `git config push.autoSetupRemote true`). The v1 grammar cannot deny `--force` without over-matching (no mid-string `*`), nor allow a push prefix without letting `--force` through, so every other push asks, force pushes and `git push -u origin HEAD` included. Globs in deny and ask rules (see [Later](#later)) would allow a real force-push deny and wider push forms. Both built-in profiles are delegable. All other Bash asks.

### Decision order

Claude Code's own verdict for the call arrives from `next(e)` in the `tool.check` hook as `{ decision, reason, rule }`. The engine lets a hook answer in either direction, so the mod could override a deny. It must not: **a deny from Claude Code is returned unchanged** (source `claude-code`), before the steps below.

Otherwise the first rule that matches wins:

1. A subagent calls Bash and holds no rule for it: deny, with the redirect message.
2. A covered write tool targets a protected path: deny.
3. Across the active set, deny beats ask beats allow. Malformed input (a Bash call without a string `command`, a call without a tool name) sits here after the denies: a matching whole-tool deny or a deny guard result still wins, otherwise the result is an ask with source `malformed`.
4. A call that matches nothing keeps Claude Code's own verdict.

An allow from Claude Code is downgraded to ask for Bash (source `bash-downgrade`) unless an active rule allows the call. An active allow rule overrides a Claude Code ask, never a deny. "Holds no rule" in step 1 means that no active allow rule matches the call. A call is a subagent call when the event carries an agent id (see [Subagents](#subagents)).

The `tool.call` hook cannot ask Claude Code (calling `next` there runs the tool), and `/gate-explain` is a dry run. Both decide with a stand-in Claude Code verdict of `allow` and are documented as such: `tool.call` only ever returns a deny, so the stand-in cannot loosen anything.

The path guards are extra sources fed into this order, not overrides: a protected-path deny is a step-2 deny, and the ask-path guard is an ask source at step 3, so a profile deny still wins over it. A guard never turns a deny into an ask or an allow. Within one verdict class, guard results come first (in list order), then rule results (set order, then list order); the first match is the one reported, so when a guard and a rule both apply the decision has `source` `guard`, with no `rule` and no `profile`.

`source` is one of: `rule`, `guard`, `subagent-bash`, `bash-downgrade`, `malformed`, `claude-code`.

### Matching

- Tools match by name and, later, by argument. Version 1 uses whole-tool rules only for non-Bash tools.
- Bash rules are exact or trailing-` *` prefix rules (a subset of Claude Code's syntax; a trailing `:*` is parsed as ` *`). Matching uses string operations only and never builds a regular expression from rule text, so `.`, `+`, `(`, `[`, `^` and `$` in a rule are literal. **Allow rules are strict**: exact equality or `startsWith`, and never a match if the command contains any Bash metacharacter. Anything unusual asks. The metacharacters are the exported constant `BASH_METACHARACTERS` in `hooks/policy.ts` (defined in Draft 03; ten entries including the newline; the backslash is not one).
- **Deny rules and profile ask rules use a boundary-checked substring test**, with or without metacharacters. The rule text (prefix with trailing whitespace trimmed, or the exact command text) must appear in the command after the start, whitespace or a metacharacter, and before whitespace, a metacharacter or the end. "Whitespace" here is JavaScript `\s` (tab, CR, VT, FF, NBSP and the other Unicode spaces count), the safe direction because more commands fire; allow prefixes stay a literal space. Every occurrence is tested, and one valid occurrence is enough. Both tests apply to every rule, with no exception. An empty prefix always matches. So `deny Bash(git push *)` fires on `git push`, `git push<TAB>origin`, `x;git push`, `git push&&y` and `xgit push; git push`, but not on `git pushd`; `deny Bash(rm -rf /)` fires on `rm -rf / b` and `a; rm -rf /`, but not on `rm -rf /tmp`. A plain `startsWith("git push ")` would miss the bare forms and make the deny inert. A quote, a backslash, `/` and `=` are not boundaries, so `bash -c "git push"`, `sh -c 'git push'`, `/usr/bin/git push`, `\git push`, `git  push` and `git -C . push` do not trigger the deny. These are known bypasses that degrade to an ask through the Bash downgrade, never to an allow, and the matcher is deliberately not widened.
- The redirect text of the step-1 deny comes from `redirectHint` in `hooks/guards.ts`; `gate.ts` adds it to the hook result, `decide` does not build it.
- A whole-tool `Bash` rule matches every Bash call.
- Issue and GitHub work uses the typed mcp-workspace tools, not Bash text.

## Commands

| Command                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `/gate-on <profile>...`  | Switch profiles on. Prints a short summary of what they allow.                                 |
| `/gate-off <profile>...` | Switch profiles off. `all` switches every profile off.                                         |
| `/gate-status`           | Baseline summary, active profiles, config path in use, and `log: failing` if writes fail.      |
| `/gate-why [n]`          | The last n verdicts with the rule and profile that fired.                                      |
| `/gate-check`            | Validate the config: conflicts, unknown tools, over-broad rules. Also lists project proposals. |
| `/gate-explain <tool> …` | Dry run one call and show the verdict and the rule chain.                                      |

Commands are registered with `$.command.register({ name, description, argumentHint?, immediate? })` in the `session.start` hook and served by `command.run` hooks. The hook gets the raw argument text in `e.args` and returns `{ text?, context?, exitCode? }`.

`/gate-explain` decides with the stand-in Claude Code verdict `allow`, so it shows what the mod does when Claude Code allows. A result is exact for a `deny` from a rule or a guard on a main-session, non-headless call. Every result for `--agent` or converted by the headless rule is flagged as an approximation, whatever its verdict (a real assignment could allow the call). The note on a non-deny result depends on its source: a result from an active allow rule is shown with "unless Claude Code denies" (an active allow overrides a Claude Code ask), and a result from the stand-in verdict (an unmatched non-Bash call, source `claude-code`) with "unless Claude Code denies or asks". Other non-deny results (an ask from a rule, guard, Bash downgrade or malformed input) say "unless Claude Code denies".

Only the user switches profiles. The mod registers no tool that Claude could call to switch.

## Lifetimes

- A profile the user switches on lasts the session.
- A profile that a skill declares lasts until the next prompt.
- Profiles are cleared when a session ends (`session.end`, which is how `/clear` shows up) and never restored on resume: profiles switched on in an earlier session do not come back.
- The band shows profile names, so a forgotten profile stays visible.

`/clear` fires `session.end` with reason `clear` and **no** `session.start`. `session.start` has no reason field. A hot reload re-fires `session.start` and wipes module variables, so all state lives in `$.state`, and starting profiles apply only while the state is not yet started.

## Subagents

- A subagent gets the baseline plus the profiles its parent assigns at spawn. Allow rules come only from those; restrictions are inherited (below).
- **Any call with an `agentId` is a subagent call.** The id is absent on the main loop. It is also set for teammates and for the engine's own forks (compaction, memory), whose ids no list names. Such callers are treated as subagents: they get the baseline plus the main session's deny and ask lists, and a fork's Bash call outside the baseline is denied at step 1.
- The parent assigns profiles in the prompt of its Agent tool call. The first line is `mode-gate-profiles: name1, name2`. An absent or empty marker means baseline only. The mod reads it from the Agent call (`e.prompt` on `tool.call`, `e.input.prompt` on `tool.check`) with one pure function, `parseAssignmentMarker(prompt)` in `hooks/assignment.ts`, shared by the live wiring and `/gate-explain`.
- **Matching a launch to the new agent.** The key is the Agent call's `toolCallId` (`tool_use_id`). The mod keeps a pending assignment record under that id and binds it to the subagent's agent id on the event that carries the new id (assumption 10). Matching by arrival order or "the only pending record" is forbidden. If the id-bearing event carries no `toolCallId` (or other linking value), or there is no id-bearing event, there is no binding and the subagent gets the baseline only. The **binding hook** is a `register.ts` registration on the event and matcher that spike row 10 names. It must fire before the subagent's first gated call; if ordering is not guaranteed, the fallback is baseline only for every subagent. The hook returns `next(e)`, writes `$.state` only and has a fail-closed `.catch` (a throw leaves the subagent baseline-only). Parallel spawns therefore cannot swap assignments. At bind time the assignment is intersected with the parent's currently held set; `/gate-off` and the session-end reset also clear pending records.
- **Writing the record.** For any Agent call that is not denied, once, idempotently by `toolCallId`, only on the live decision path. The record stores the calling agent's id (`main` for the main session), so binding knows whose held set to intersect with. A `tool.call` hook never sees an allow, so whichever live hook first sees the call and returns a non-deny verdict writes it. The write lives in `register.ts`, after the shared path returns a non-deny verdict for an Agent call (`Agent` or `Task`). In `tool.call` it is written before `next(e)` is called, because `next(e)` runs the Agent tool, that is, the whole subagent run, and a later write would never exist when the subagent's first event arrives (nothing would bind, silently baseline-only); in `tool.check` it is written after `next(e)` resolves. `gate.ts` has no injection point for it, so a dry run (`/gate-explain`) never writes it. Neither does an Agent call that was denied or rejected as an invalid assignment.
- The parent can assign only profiles it holds, so authority only narrows down the tree. The chain ends at the user. Nested agents can only narrow.
- **Restrictions are inherited, allows are not.** The `deny` and `ask` lists of the main session's active profiles also apply to every subagent (deny beats ask beats allow as usual); `allow` lists apply to a subagent only when assigned. So a deny-only profile in the main session, such as a read-only profile, cannot be escaped by launching a subagent. A subagent's effective set is the baseline, its assigned profiles' rules, and the main session's active profiles' deny and ask lists.
- The parent writes the advice to use only the assigned profiles into the spawn prompt itself; the mod adds nothing to the prompt. That is advice; the mod enforces the same list.
- An Agent call whose marker names a profile the parent does not hold, or one that is not delegable or unknown, is denied. The deny is a guard result (`source` `guard`) from the pure function `checkAssignment(requested, held, profiles)` in `hooks/assignment.ts`, which returns the offending names; `register.ts` wires it as a closure over `$.state`. The caller's held set is `gate.active` for the main session and the caller's own assigned set for a subagent; an agent id with no entry in `assignments` holds nothing (baseline only), so any marker naming a profile is denied, and the check never falls back to `gate.active`. The message names the profiles and who decides: the parent for a profile it does not hold, the user (via `/gate-on` in the main session) for a non-delegable one.
- A subagent with no assignment record (unknown agent id, wiped state, no marker, no binding) gets the baseline only, plus the inherited deny and ask lists.
- A denied subagent call (also in a headless run) returns this message, built by the `profileHint(decision, call)` function in `gate.ts` (it needs `decide`; `/gate-explain` runs the same function and shows it too), not by `register.ts` afterwards. `gate.ts` takes the candidate profiles by injection (`availableProfiles(call)`). It is not the list of all switched-off profiles that a main-session call gets. It names the delegable profiles that would allow it and that the parent holds, or for a non-delegable one, telling the subagent to ask the user to run `/gate-on <name>`. The subagent stops and reports. The parent decides, and profiles marked non-delegable go to the user. There is no request tool.
- Switching a profile off removes it from all descendants (children and grandchildren) and from pending records, through the pure `revoke(gate, names)` in `assignment.ts`, which `register.ts` applies after `commands.ts` returns the new `active` (a record whose list becomes empty is deleted). Assignments are cleared by the session-end reset. Switching the profile on again does not bring delegated copies back.
- Limit: the subagent-Bash deny (decision step 1) covers Bash only. An unmatched non-Bash call keeps Claude Code's verdict, which is allow in a `bypassPermissions` agent. What holds: the allow rules of profiles that were not assigned never apply to a subagent, and the main session's deny and ask lists always do.
- Fallbacks: without assumption 2 the subagent-Bash deny is inert and every call counts as main-session; without assumption 10 (the link, or the binding event firing before the subagent's first gated call) no assignment is possible, so subagents get the baseline only; without assumption 11 the mod cannot gate `bypassPermissions` agents, so work stops until the owner decides.

Later: skills and agents may declare profiles in their definitions, which would make the dedicated "specialist" agents unnecessary.

## Headless runs

- Starting profiles come from the environment variable `MODE_GATE_PROFILES`, read at the first `session.start` of a process (state not yet started) and applied in every new process, including `claude --resume`, for example `MODE_GATE_PROFILES=issues,git-write`. A repo cannot set it. A hot reload or `/clear` does not re-apply them.
- Profiles cannot change during a run.
- Headless means `session.start.isInteractive` is false (`claude -p` or the SDK, where `surface` is `null`). The hook stores the flag in state, because only `session.start` carries it.
- A call that would ask because of an active rule, a guard, the Bash downgrade or malformed input is denied (a passed-through Claude Code ask stays `ask`), with a message naming the available profiles whose allow rules would match the call, or a generic message if none would.

## Permission modes

Auto and bypass mode are out of scope for version 1. The README says the mod is built for the default modes. If the API shows the mode, profiles do not loosen anything in auto or bypass. A later **enforce mode** could invert this: baseline plus profiles become the allowlist, and everything else is denied.

## Protected paths

Covered tools: the mcp-workspace write tools (`edit_file`, `save_file`, `append_file`, `move_file`, `delete_this_file`, `delete_directory`; a tool name matches on the part after the last `__`) and the native `Edit` and `Write`. A directory that contains a fixed-path entry counts.

- **Deny:**
  - the mod's config file and the log folder;
  - `settings*.json` inside any `.claude` folder, in the project and in the home folder (hook definitions live there);
  - `~/.claude/plugins/**`, the installed copy of the mod;
  - shell profiles in the home folder: `.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.config/fish/config.fish`, and the PowerShell `*profile*.ps1` files under `Documents/PowerShell` and `Documents/WindowsPowerShell`.
- **Ask:**
  - the rest of `.claude/` (skills, agents, `CLAUDE.md`) in the project and the home folder;
  - in the project: `package.json`, `scripts/`, the tool configs, `.mcp.json`, `.github/workflows/**` and everything under `.git/` (hooks, config and the other internals; an allowed `git commit` runs hooks);
  - any file named `.npmrc`, at any directory level (a basename match, so it covers the project, its subdirectories and the home folder; npm runs its settings under the allowed scripts);
  - `~/.claude.json`.

  `.mcp.json` and `~/.claude.json` can launch programs. Writes to Claude Code's auto-memory (`~/.claude/projects/*/memory/**`) match `~/.claude/**` and therefore ask on every save, by design; there is no exception.

- The project's own `hooks/`, `types/`, `tests/` and `.claude-plugin/` are not protected. Denying them would block development of this repository while the mod is active. There is deliberately no ask on `tests/**`, `hooks/` or `types/` (see [Threat model](#threat-model)).
- Paths are compared Unicode-normalised (`.normalize('NFC')`) and then case-folded. A leading `~` segment (alone, or followed by a separator) means the home folder; a first segment `~name` (another user's home) and a `~` path with no home folder ask (cannot verify). Whether the file tools expand `~` is undocumented (spike row 25), so the guard treats it as expanded. Any segment that contains `~` followed by a digit (an 8.3 short name such as `CLAUDE~1`) asks (cannot verify). Both `/` and `\` are separators, and `.` and `..` are resolved without touching the file system. Windows forms are normalised first, in this order: the `\\?\` and `\\.\` prefixes (either separator, any case, so `//?/C:/` and `\\?\unc\server\share` are covered); MSYS drive paths (`/c/Users/x` becomes `c:\Users\x`, also for the home folder); then per segment (never the drive prefix) NTFS stream suffixes (everything from the first `:`, on every segment, not just the last) and trailing dots and spaces; then two leading separators of either kind (`//`, `\\`, `/\`, `\/`) form a UNC prefix and become `\\server\share` (before the empty-segment drop, which would otherwise collapse them; on POSIX, where `//home/u` equals `/home/u`, both readings are tested and any hit decides, deny beating ask); then empty segments are dropped; then `.` and `..` are folded. A drive-relative path (`C:.claude\settings.json`, `X:` not followed by a separator) resolves against the project folder when the drive is the project's drive, otherwise the guard asks (cannot verify).
- **Missing home folder.** If neither `HOME` nor `USERPROFILE` is set (an empty, whitespace-only or non-absolute value counts as not set), an absolute path outside the project asks (cannot verify). The config-path and log-folder denies are always evaluated, also then, and a deny beats that ask.
- **Symbolic links.** The guard stays pure and cannot touch the file system. The wiring resolves each path field of a covered call with `$.fs.stat(path, { resolve: true })` (`realPath`; for a target that does not exist yet, the nearest existing ancestor plus the remaining segments, since the write tools create folders) and hands the resolved paths to the guard as an input. The guard checks both the spelled and the resolved path. The wiring resolves the project and home folders the same way, once per guarded call, and passes both spellings; the guard matches the entries for either. Hard links, case aliases and volume spellings keep their own spelling, so this is best effort. Relative paths of the mcp-workspace tools resolve against that server's root (`MCP_CODER_PROJECT_DIR`), which can differ from `$.session.cwd()`: if spike row 26 finds a session-root API, its folder is checked as a further project folder; otherwise only `$.session.cwd()` is, and the difference is a known gap.
- A directory counts only when a fixed-path entry lies under it. A nested `.claude` inside an arbitrary subdirectory, or a nested `.npmrc`, is not found (known limit: the guard is pure and cannot list directories).
- No profile can unlock a protected path for the covered tools. A Bash command that a profile rule allows is not path-guarded, so for example an allowed `git add *` is not checked for the file it names.
- Other write routes (the native NotebookEdit, other MCP file tools, hard links, 8.3 short names that `realPath` does not expand) are a known gap. So is a relocated Documents folder (for example `OneDrive\Documents\PowerShell\...profile.ps1` after a Known Folder Move): the PowerShell profile entries are protected only at the default location under the home folder, and no open-ended pattern is added. **PowerShell is a documented gap:** version 1 gates Bash only. The optional Claude Code `PowerShell` deny rule in `settings.json` is a user option, marked untested.

## Decision log

- The mod writes `mode-gate.log.jsonl` in the folder named by the config key `logDir` (default `logs`), resolved relative to the session's project directory; an absolute path is allowed. It writes the file itself with `$.fs`, not through a tool call. `$.fs.write` replaces the whole file (there is no append) and rejects above 4 MiB. The writer therefore reads the file, adds the new line in memory and rewrites it, keeping only the newest 1000 lines. The log is a window of recent verdicts, not a full history. Within one session, parallel tool calls run their hooks concurrently, so the writer serialises log writes in-process (a module-level promise chain in `register.ts`; it holds no state that must survive a hot reload). Two sessions that share the folder can still lose entries to a read-modify-write race. A failed write is swallowed and `/gate-status` shows `log: failing` until the next successful write.
- One JSON object per line with the fields `time` (ISO 8601), `verdict`, `source`, `rule` (the raw matched rule for the mod-sourced sources `rule`, `guard` and `bash-downgrade`, otherwise null; never Claude Code's rule string, because "always allow" clicks can put secrets in it), `profile` (or `baseline`, or null), `agent` (`main` unless the call carries an agent id, then the agent id), `tool`, `toolCallId` (if the event carries one) and `session` (from `$.session.id()` when available). It records no arguments.
- A call seen by both gating hooks is logged once, by tool-call id, with the last 200 ids kept in session state. Without an id it may be logged twice.
- `/gate-why [n]` (n a positive integer, default 10) reads the log and shows this session's entries when entries carry a session id, otherwise the last n of all sessions.

## Failure

Every gating hook has a `.catch` that fails closed (never allow): `tool.call` returns deny, because it cannot ask; `tool.check` returns ask.

The engine's rules: a hook that throws, overruns its budget or answers a wrong shape is skipped, and the call runs, unless the registration has a `.catch` that answers in its place. The hook budget is 10 s and counts only the hook's own code (waits on `next` and `$` calls are free); the `.catch` handler has 1 s. A handler that itself throws leaves the hook skipped, so handlers return constants or a value the hook already holds (the `tool.check` hook keeps Claude Code's verdict in a local variable of its closure, so its handler can return an earlier deny). Calling `next(e)` inside a handler is allowed on re-entry only (the API notes' sample). When a `$` call that the hook makes raises the same event beneath it (re-entry), the hook is not run again and its `.catch` is asked (`next.error.kind === 're-entry'`); the handler must answer that case too.

A module that fails to load registers no hooks, so it is assumed that nothing is gated (assumption 18). The failure is only reported (a transcript line during hot reload, `claude --debug` otherwise, stderr under `claude -p`). The docs do not say what stays gated, so the spike tests it (assumption 18). A launcher check is the only reliable signal and is an open item.

## Code structure

- `policy.ts`: pure decision logic and the `Rule`, `Profile`, `RuleSet`, `Call`, `GuardResult`, `ClaudeVerdict`, `Decision` and `BASH_METACHARACTERS` definitions. No `$`, no state, no imports.
- `gate.ts`: the shared decide path used by `tool.call` and `tool.check`, plus the pure event normalisers `callFromToolCall(e)` and `callFromToolCheck(e)`. `tool.call` spreads the tool's arguments beside `tool`, `tool_use_id` and `agentId` (`e.command` for Bash); `tool.check` nests them as `e.input`. Both normalisers return the same `call` object `{ toolName, input, agentId?, toolCallId? }`. The path imports `policy.ts`, holds `profileHint(decision, call)` (it needs `decide`) and takes the effective set (a function of the call returning `RuleSet[]`), guards, `redirectHint`, `availableProfiles(call)`, `log`, a `hook` kind (`call` or `check`; the path calls `log` after the verdict is computed, for `call` only on a deny), the `headless` flag and Claude Code's verdict by injection. It uses no `$` and does no I/O. `/gate-explain` injects the same functions, so it shows the same denial text. Only `/gate-explain` passes `withChain`; the live hooks never build the rule chain. The effective set comes from a pure helper in `assignment.ts`; the live closure over `$.state` wraps it, and explain calls it with explicit lists. `decide` has the signature `decide({ call, sets, guards, claude, withChain? }): Decision` with `sets: RuleSet[]`; the types `Rule`, `Profile`, `RuleSet`, `Call`, `GuardResult`, `ClaudeVerdict` and `Decision` are exported from `policy.ts`.
- Result shapes. `tool.call` returns `{ deny: message }` or the result of `next(e)`; `tool.check` returns `{ decision, reason?, rule? }`. `gate.ts` returns `{ verdict, message? }`, and `register.ts` maps it.
- `guards.ts`: pure path guards (with resolved symlink paths as an input) and `redirectHint`. No runtime imports; type imports from `policy.ts` are allowed (it returns `GuardResult`), so the dependency-cruiser rule needs `tsPreCompilationDeps: true` to see them. Under the coverage, mutation and purity gates.
- `config.ts`: config loader and validator. It imports only `baseline.ts`, `builtin-profiles.ts` and types from `policy.ts`; same gates as `guards.ts`.
- `assignment.ts`: the four pure functions `parseAssignmentMarker`, `checkAssignment`, `effectiveSet` (returns `RuleSet[]`) and `revoke(gate, names)`, nothing else (`profileHint` lives in `gate.ts`). No runtime imports (type imports from `policy.ts` are allowed); same gates as `guards.ts`.
- `explain.ts`: pure text of a decision and its chain, with the exactness notes. It imports only types from `policy.ts` (the decision type is one of them), and sits under the same coverage, mutation and purity gates as `guards.ts`.
- `commands.ts`: pure logic of the profile state and commands: the start and reset transitions, `/gate-on`, `/gate-off`, the `/gate-status` text, all-or-nothing name validation, reserved names, proposal hints and usage text. It returns the new state or active list and the message; `register.ts` stores it and prints the message. Imports only types from `policy.ts` and `config.ts` (the `loadConfig` result held in `gate.config`); same gates as `guards.ts`.
- `log-format.ts`: pure decision-log formatting (one JSON line per verdict, no arguments), the bounded append, `/gate-why` line parsing and filtering, and the band text. Imports only types from `policy.ts`; same gates as `guards.ts`. The `$.fs` calls stay in `register.ts`.
- `register.ts`: thin event wiring: `export const register: Register = (on, options) => { ... }` with `on(event, matcher, hook)` registrations. The only importer of host APIs; it wires the real dependencies into `gate.ts`.
- TypeScript in strict mode. The engine supplies the API types (`claude-code`). The mod only needs its own `PluginState` contract in `types/index.d.ts`, declared under the mod's name and named in `plugin.json` as `"types": "./types/index.d.ts"`.
- State lives in `$.state` (per session, survives a hot reload), never in `$.store` and never in module variables, all under one literal key `gate`: `config`, `active` (profile names in switch-on order), `started`, `headless`, `logFailing`, `seenIds`, `assignments` and `pending`. The whole `gate` is one `$.state` value, so every write replaces all of it: each write re-reads `gate` immediately before setting it, with no `await` between the read and the set, and after any slow step (the config load) it re-reads and changes only its target field. The session id and working directory are read from `$.session.id()` and `$.session.cwd()` when needed.

### Events

| Event           | What the hook does                                                                            |
| --------------- | --------------------------------------------------------------------------------------------- |
| `session.start` | Stores `isInteractive`, starts the state once, applies starting profiles, registers commands. |
| `session.end`   | Resets the state (the way `/clear` is seen).                                                  |
| `command.run`   | Switches profiles and redraws the band. Commands are registered with `immediate: true`.       |
| binding event   | Binds a pending assignment record to the new subagent id (event and matcher from row 10).     |
| `tool.call`     | Denies subagent Bash and protected-path writes.                                               |
| `tool.check`    | Returns the verdict from `decide`.                                                            |
| `ui.render`     | Draws the active profiles in the band and keeps other mods' content.                          |

### Repo layout

```text
claude-mode-gate/
  .claude-plugin/   plugin.json, marketplace.json
  hooks/            hooks.json, register.ts, gate.ts, policy.ts, config.ts, baseline.ts,
                    builtin-profiles.ts, guards.ts, assignment.ts, commands.ts,
                    log-format.ts, explain.ts
  types/            index.d.ts
  tests/            unit tests, fixtures/
  docs/             design.md, mods-api-notes.md, issues-draft/
  scripts/          check scripts
```

## Testing

See `CLAUDE.md`, "Testing strategy". Policy tests are table-driven and cover the decision order, chained and substituted Bash, protected paths, fail-closed behaviour and the reset after `/clear`.

## Security model

The rule is that only the user changes profiles, and the mod never returns a verdict weaker than Claude Code's own deny.

| Route                                     | Risk                                            | How it is closed                                                                                                              |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Claude switches a profile itself          | Claude widens its own permissions               | Commands are for the user. The mod registers no tool for switching.                                                           |
| Claude edits the mod's config or install  | The installed copy is rewritten                 | Protected-paths deny on the covered write tools. The working-tree `hooks/`, `tests/` and `types/` are unprotected on purpose. |
| Claude writes code and runs it            | Any code runs under an allowed `npm run` script | Not closed. Out of the threat model (see above): the mod guards mistakes and prompt injection, not a code-writing adversary.  |
| Claude sets the environment variable      | The profile set changes mid-session             | Not possible: the variable is read once, and a child cannot change its parent.                                                |
| Claude writes the variable into a profile | The next session starts in the wrong state      | Protected-paths deny on shell profiles. The band shows the state.                                                             |
| A repo grants itself permissions          | A project file pre-enables profiles             | Starting profiles come only from the user's environment.                                                                      |
| Another mod submits a prompt as the user  | A skill-declared profile is triggered           | Install only trusted mods.                                                                                                    |
| Chained or substituted Bash               | `gh issue edit 1 && rm -rf .` passes a prefix   | Metacharacters make an allow rule not match. Prefer typed tools.                                                              |
| A hook throws, overruns or answers badly  | The hook is skipped and the call runs           | `.catch` on every gating hook returns ask or deny; handlers return constants.                                                 |
| The module fails to load                  | No hook is registered, nothing is gated         | Reported only in the transcript, debug log or stderr. Spike row 18. Open: a launcher check.                                   |
| Auto mode                                 | An allow skips the classifier                   | Out of scope. Profiles do not loosen when the mode is known.                                                                  |
| Claude Code denies, the mod could allow   | The engine lets a hook override a deny          | `decide` returns a Claude Code deny unchanged.                                                                                |
| A forgotten profile                       | A standing permission                           | Names in the band, cleared on session end, never restored on resume.                                                          |
| A subagent asks for more                  | Confused deputy                                 | The parent decides, and non-delegable profiles go to the user.                                                                |
| Other write routes                        | PowerShell, NotebookEdit, hard links, Bash      | Not closed. PowerShell is a documented gap; a Bash command a profile allows is not path-guarded; symbolic links are resolved. |

The mod does not protect against anything a mod or program does outside Claude's tool calls.

## Assumptions

The mods API is early access. [mods-api-notes.md](mods-api-notes.md) records what was verified against Claude Code 2.1.292 and is the authority for the rows marked verified. Rows 1 to 17 keep their numbers; rows 18 to 27 are new. Draft 01 (the spike) covers the open rows.

| #   | Assumption                                                                                                                                                                             | Status           | Evidence and remaining work                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tool.check` exposes the tool input, such as the Bash command                                                                                                                          | verified         | Notes 4: `e.input`; `tool.call` spreads the arguments.                                                                                                                 |
| 2   | `tool.call` and `tool.check` carry an agent id; main-session and subagent calls are distinguishable; `tool.check` still fires for a call `tool.call` denied                            | partly verified  | Notes 4: `agentId` on both events, absent on the main loop. Open: does `tool.check` fire after a `tool.call` deny.                                                     |
| 3   | A slash command's text reaches `prompt.submit`                                                                                                                                         | not needed in v1 | Commands use `command.run` (notes 13). Recheck with skill-declared profiles (Later).                                                                                   |
| 4   | The test kit can raise `tool.check` directly                                                                                                                                           | documented       | `claude plugin test` and `claude-code/testing` exist (notes 9). Open: raising `tool.check` by hand.                                                                    |
| 5   | State is per session; what `/clear` and resume do to it; whether `session.start` says why it fired                                                                                     | verified         | Notes 1, 2: `/clear` is `session.end` (reason `clear`), no `session.start`, no reason field; `$.state` survives a hot reload.                                          |
| 6   | A mod can read the current permission mode                                                                                                                                             | open             | Not in the notes. Not needed for v1 (auto and bypass are out of scope).                                                                                                |
| 7   | A mod can ask Claude Code how it would decide a call                                                                                                                                   | verified         | Notes 5: `next(e)` resolves to `{ decision, reason, rule }`. The engine does not enforce a deny, so `decide` passes it through.                                        |
| 8   | Settings files can define environment variables                                                                                                                                        | open             | Docs read. Decides which files the protected paths must cover.                                                                                                         |
| 9   | Plugins are stored under `~/.claude/plugins/`                                                                                                                                          | open             | Check the installed path (a read-only look at `~/.claude/plugins` is allowed). A `--plugin-dir` mod lives elsewhere and is not protected.                              |
| 10  | A mod sees a subagent launch (the Agent call input, including the prompt), and an event or field gives the new agent's id together with a value linking it to the call's `tool_use_id` | partly verified  | Notes 13: `e.prompt` on `tool.call`. Open: the event that gives the new id and its link (`agent.spawn`?), and whether it fires before the subagent's first gated call. |
| 11  | Hooks run for `bypassPermissions` agents                                                                                                                                               | open             | Probe.                                                                                                                                                                 |
| 12  | Hooks run under `claude -p`, and a hook can tell that the session is headless                                                                                                          | verified         | Notes 6: `session.start.isInteractive` is false for `-p` and the SDK (`surface` is null there). Only `session.start` carries it, so the hook stores it.                |
| 13  | A mod can draw below the entry box                                                                                                                                                     | open             | Docs read. Fallback: the band stays above the prompt.                                                                                                                  |
| 14  | A command can offer argument completion                                                                                                                                                | partly verified  | Notes 13: `argumentHint` exists; completion is not documented. Fallback: usage text lists the profile names.                                                           |
| 15  | A mod can tell when a skill starts and ends                                                                                                                                            | not needed in v1 | Needed only for skill-declared profiles (Later).                                                                                                                       |
| 16  | A mod's hook file can import sibling files (`./policy`, `./guards`)                                                                                                                    | documented       | Notes 12: static `import` of plugin files works. Open: the packaged plugin, as opposed to the documented one.                                                          |
| 17  | A mod can read the user config and write the log folder                                                                                                                                | verified         | Notes 3: no Node; `$.fs` (read, write, list, exists, stat); `write` replaces the whole file, no append, 4 MiB cap.                                                     |
| 18  | What is gated when a module fails to load                                                                                                                                              | open             | Notes 8: reported, not stated. Probe; assume nothing is gated.                                                                                                         |
| 19  | `$` calls made inside a hook (`$.fs.stat`, `$.fs.write`) do or do not raise `tool.call` and `tool.check` again                                                                         | open             | Notes 8, "re-entry". It decides whether the log write or path resolution can trip the mod's own guards, and what the `.catch` must answer.                             |
| 20  | `$.session.id()` returns the new id after `/clear`; `$.session.cwd()` is the project folder; `session.start` does or does not fire after an in-process resume                          | open             | Probe.                                                                                                                                                                 |
| 21  | Which engine forks and teammates carry an `agentId` and call tools                                                                                                                     | open             | Notes 4. Consequence: they are treated as subagents (see Subagents).                                                                                                   |
| 22  | `$.env.get` gives the real values of `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME` and `MODE_GATE_*` on Windows, macOS and Linux                                                            | open             | Notes 3. The config path depends on it.                                                                                                                                |
| 23  | `claude plugin validate` and `claude plugin test` run in CI, and what they need to authenticate                                                                                        | open             | Notes 9. Draft 10 uses the result.                                                                                                                                     |
| 24  | `$.state` offers a finer-grained or atomic update than replacing the whole `gate` value                                                                                                | open             | Notes 10. Without it, the re-read-then-set rule applies (see Code structure).                                                                                          |
| 25  | The Read, Edit and Write tools expand `~` in `file_path`                                                                                                                               | open             | Permission rules expand `~`; the tool input is undocumented. Until known, the path guard treats `~` as expanded.                                                       |
| 26  | The mcp-workspace tools resolve relative paths against `MCP_CODER_PROJECT_DIR`; a session-root API exists that differs from `$.session.cwd()`                                          | open             | Notes list `$.session.root()`. Decides which project folders the path guard checks relative paths against.                                                             |
| 27  | `$.fs.stat(path, { resolve: true }).realPath` returns long names for 8.3 short-name paths                                                                                              | open             | Notes 11. Until known, a `~digit` segment asks (cannot verify).                                                                                                        |

Minimum Claude Code version: 2.1.292, the version the notes were verified against. Older versions are untested.

## Later

- Parameterised profiles, for example `issues 123` for one issue only.
- Profiles that skills and agents declare in their definitions.
- Globs in deny and ask rules (boundary-checked), which would allow a real force-push deny and wider `git-write` push forms.
- Gate PowerShell like Bash.
- Replay: an offline command-line tool (`npm run replay`) that re-runs a session transcript against a config and a set of profiles and reports what each call would have been, flagged as an approximation.
- Project profiles that become usable after per-repo approval, and a command that adopts a proposal into the user config.
- A typed commit and push tool, so those calls need no Bash.
- Enforce mode for bypass.
- A persistent log with arguments, and log rotation to files.
- A launcher check that the module loaded.
- Official plugin directory listing.

## Open items

- The marketplace name.
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

Thirteen issue drafts in `docs/issues-draft/` (see `00-overview.md`).

1. **Verify.** Draft 01: the small spike over the open rows of [Assumptions](#assumptions), the manifest shape, and how `typecheck` gets the engine's types.
2. **Build.** `policy.ts` with `decide` and tests first (03), then the config (02), the state and commands (04), the shared path and hook wiring (12), the guards (05), subagent profiles (06), the band and log (07), `/gate-explain` (08) and the built-in profiles (09).
3. **Test.** Policy tables, protected paths, fail-closed, reset after `/clear`, band, CI with `claude plugin validate` and `claude plugin test` (10).
4. **Publish.** README with "what it can reach" and "what it allows", SECURITY.md (13), CHANGELOG, licence, topics, awesome-list submission, repo settings (11).
