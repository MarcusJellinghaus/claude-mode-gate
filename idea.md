claude-mode-gate: goals, decisions and open points




Oct 7, 2026 · @Marcus Jellinghaus 
Summary
mode-gate is a Claude Code mod that adds switchable permission modes. One command changes what Claude may do, and everything outside the active mode still asks.
The design is agreed in outline and nothing is built yet. Two things block the build: several API details are unverified, and a few design questions need a decision. Both are listed below, followed by a work plan.
Repo description: A Claude Code mod with switchable permission modes: one command changes what Claude may do, and everything outside the active mode still asks.
Goals and non-goals
Three goals, in priority order:
1. Different modes. The user switches between named modes, and each mode allows only the tool calls scoped to it.
2. Simple, high-level control. One command changes mode. The current mode is always visible.
3. Tighter security. Bash always needs manual approval unless the active mode or command explicitly allows that exact call. Nothing is allowed by default.
The starting use cases:
• Bash commands always need manual permission.
• While /issue-update runs, updating an issue is allowed, and only that.
• In a "maintain issues" mode, all issue-related calls are allowed by default.
• A subagent that tries Bash is declined automatically and told to use MCP tools.
Out of scope for this repo:
• The recent-skills display. It is a separate mod in its own repo (claude-recent-skills).
• Sandboxing. A mod runs with the user's permissions and is not a sandbox. mode-gate gates Claude's tool calls only.
• Replacing Claude Code's permission rules. Deny rules and organisation policy keep precedence.
What we agreed
Topic
Decision
Decision logic
Plain code (booleans and patterns). No model is consulted.
Bash
Always asks. A settings allow rule for Bash is downgraded to ask unless the active mode or command allows the call.
/issue-update
Allows issue updates for that turn only. The allowance is cleared when the turn ends.
Maintain-issues mode
Toggled by a user command. While on, issue-related calls are allowed without a prompt.
Who switches modes
Only the user, through a mod command. The mod registers no tool that Claude could call to switch.
Preset at startup
An environment variable, read once at session start, can set the initial mode.
Several sessions
The mode is per session ($.state). It is not kept in $.store, which all sessions share.
Subagents
A subagent's Bash call is denied in tool.call. The deny text tells it which MCP tools to use.
Display
The current mode is always shown in the band above the prompt.
Protected paths
Edit and Write are denied on shell profiles, .claude/ and the mod's own files.
Failure
Every gating hook has a .catch handler that fails closed.
Code structure
Pure decision logic in policy.ts. Thin event wiring in register.ts. TypeScript in strict mode.
Testing
claude plugin test with table-driven policy tests. claude plugin validate, type check and lint in CI.
Repo layout
One repo per mod. This repo acts as its own marketplace.
Names
Mod mode-gate, repo claude-mode-gate, marketplace <handle>-mods or the repo name.
Design
The mod is a set of event hooks around one pure function, decide, which returns allow, ask or deny.
Events
Event
What the hook does
session.start
Reads the environment variable, sets the initial mode, registers the mode command.
command.run
Flips the mode and redraws the band. Registered with immediate: true so it works mid-turn.
prompt.submit
Sets the "updating" flag when the prompt starts with /issue-update.
turn.complete
Clears the "updating" flag when the main turn ends.
tool.call on Bash
Denies the call when a subagent made it, with a message naming the MCP tools to use.
tool.call on Edit, Write
Denies writes to protected paths.
tool.check
Returns the mode-based verdict from decide.
ui.render on AbovePrompt
Draws the mode row and keeps other mods' band content.
Decision order
The first rule that matches wins:
1. A subagent calls Bash: deny, with the redirect message.
2. Edit or Write targets a protected path: deny.
3. The call is in the active mode's scope, or in the running command's scope: allow.
4. The call is Bash and Claude Code would allow it: downgrade to ask.
5. Anything else: leave Claude Code's own verdict unchanged.
A deny from Claude Code is never overridden.
State
• Mode: $.state, seeded from the environment variable. Lasts for the session.
• Updating flag: set and cleared within one turn.
• Nothing in $.store: a stored mode would switch on in every session on the machine.
Repo layout
claude-mode-gate/
  .claude-plugin/
    plugin.json
    marketplace.json
  hooks/
    hooks.json
    register.ts     thin: wires events to policy
    policy.ts       pure: no $, no state
  types/index.d.ts  $.state declarations
  tests/
  README.md
  SECURITY.md
  CHANGELOG.md
  LICENSE
Security model
The rule is that only the user changes the mode, and the mod never makes Claude Code's own verdict weaker than a deny. Each known way around that, and how it is closed:
Route
Risk
How it is closed
Claude switches the mode itself
Claude grants itself wider permissions
Commands are for the user. The mod registers no tool for switching.
Claude edits the mod's source or saved data
The policy is rewritten
Protected-paths guard on Edit and Write. Bash already asks.
Claude sets the environment variable in a running session
The mode changes mid-session
Not possible: a child process cannot change its parent's environment, and the variable is read once.
Claude writes the variable into a shell profile or settings file
The next session starts in the wrong mode
Protected-paths guard. The band shows the mode at a glance.
Another mod submits a prompt as the user
The /issue-update flag is tripped
Install only trusted mods. Review their claude plugin validate output.
Chained or substituted Bash commands
gh issue edit 1 && rm -rf . passes a naive pattern
Reject shell metacharacters. Better: match tool names, not Bash text (open question 1).
A hook throws or times out
The hook is skipped and the call runs
.catch on every gating hook, returning ask or deny.
Auto mode
A call the mod allows skips the classifier check
The allow branch is the only gate there, so keep it narrow (open question 5).
Deny rules
A mod cannot approve what a deny rule refuses
Keep Bash out of deny. Use ask as the baseline.
The mod's own tools
A plugin's tool skips the permission check unless its hook calls next(e)
If the mod ever registers a tool, call next(e) first and act only on approval.
Other write routes
PowerShell, NotebookEdit, MCP file tools and symbolic links bypass an Edit/Write guard
Not closed yet (open question 7).
What the mod does not protect against: anything a mod or program does outside Claude's tool calls. Deny rules and this gate apply to Claude's calls only.
Unverified assumptions
Nine details were assumed during the discussion and not confirmed. Check each against the mods reference and its linked TypeScript declarations before building.
#
Assumption
Why it matters
1
tool.check exposes the tool's input, such as the Bash command, as tool.call does
Without it the mode verdict cannot look at the command.
2
tool.call and tool.check carry an agent id for subagent calls
The subagent Bash rule depends on it. If it is missing, every subagent call passes.
3
A slash command's text reaches prompt.submit
The /issue-update flag is set there.
4
The test kit can raise tool.check directly
Otherwise the verdict hook is tested only through the pure function.
5
Each terminal session has its own copy of module state
$.state is documented as per session, so use it and do not rely on module variables.
6
A mod can read the current permission mode (auto, bypass)
Needed to refuse loosening in those modes.
7
A mod can ask Claude Code how it would decide a call
intact-bash-mod does this. Needed for "never override a stricter verdict".
8
Settings files can define environment variables for a session
Decides which files the protected-paths guard must cover.
9
Plugins are stored under ~/.claude/plugins/
Taken from third-party sources. Decides the protected paths.
Still to discuss
Nine questions need a decision. The first three shape the code most.
1. How are issue updates recognised? Three options: patterns over gh commands in Bash, the tool names of a GitHub MCP server, or a typed tool the mod registers itself. Matching tool names removes most of the pattern risk. Recommendation: tool names.
2. What is /issue-update? A mod command, an existing skill, or a custom slash command. This decides how the mod detects it. Should it also be scoped to one issue number, so /issue-update 123 allows changes to #123 only?
3. Are modes hard-coded or configured? A published mod needs modes and their allowed calls defined in settings. Which modes exist at launch besides normal and maintain-issues, and what exactly does each allow?
4. Does a mode cover subagents? Either a mode's allowances apply to subagents too, or subagents never get them.
5. What happens in auto and bypass mode? Option A: mode-gate refuses to loosen anything there. Option B: it behaves the same in every permission mode.
6. Subagent Bash: all subagents or some? Decline Bash for every subagent, or only for named agent types. Which MCP tools does the message name?
7. Protected paths: deny or ask? A flat deny, or a $.ui.ask question with a preview. Which paths exactly? Blocking all of .claude/ may be too broad. How are the other write routes covered?
8. Should the mode survive a session? Session only, or restored on resume. What is the environment variable called? MAINTAIN_ISSUES fits one mode only; MODE_GATE_MODE=<name> fits several.
9. Is there a decision log? A row or pane with the last few verdicts and which rule fired, with credentials masked.
Smaller points: the licence, the minimum Claude Code version, the marketplace name (needs the GitHub handle), and whether to seek a listing in the official plugin directory.
Still to do
In order. Verification comes first because its answers can change the design.
1. Verify
[ ] Check Claude Code is v2.1.287 or later (claude --version)
[ ] Load any mod once so Claude Code writes the type declarations, then check assumptions 1 to 7 against them
[ ] Confirm where plugins and settings live on this machine (assumptions 8 and 9)
[ ] Read the source of the built-in sec-default guard for its fail-closed patterns
2. Decide
[ ] Answer open questions 1 to 3
[ ] Answer open questions 4 to 9
[ ] Pick the licence and the marketplace name
3. Build
[ ] Create the repo claude-mode-gate with the manifest and marketplace files
[ ] Write policy.ts with decide and its types
[ ] Write register.ts: session start, mode command, verdict hook, subagent Bash rule, protected paths, band row
[ ] Add .catch to every gating hook
[ ] Move mode definitions into settings (if question 3 says configured)
4. Test and check
[ ] Policy table tests: allowed calls, chained commands, substitution, newlines, odd spacing
[ ] Protected-path tests, including relative paths and ..
[ ] Fail-closed test: a guard that throws produces a deny
[ ] Reset test: after /clear the mode is not silently permissive
[ ] Band test with $.ui.mount
[ ] CI: claude plugin validate, type check, lint, claude plugin test
[ ] CI check that every gating hook has a .catch
[ ] Pin the Claude Code version in CI and test against the latest weekly
[ ] Try it in a real session in a practice folder
5. Publish
[ ] README with "what it can reach" and "what it allows" sections
[ ] SECURITY.md, CHANGELOG.md, licence
[ ] Make the repo public and add the topics claude-code-mod and claude-code-plugin
[ ] Submit to the awesome-claude-code-mods index
[ ] Look into the official plugin directory
Prior art and what to borrow
No published mod combines user-switched modes, Bash that always asks, and allowances scoped to one command. These are the closest, as found on 7 October 2026.
Project
What it does
What to borrow
issue-board
Typed issue tools. Some calls skip the prompt, such as moving the status of the issue you started. Sensitive tools are refused in auto and bypass mode.
Match tools, not Bash text. Scope to one issue. The approvedOf check after next(e). Two-call confirmation. A CI check for .catch. Mutation tests.
intact-bash-mod
Rewrites fragile Bash commands on Windows. Its tool.check hook mirrors Claude Code's own deny or ask and never allows.
Never override a stricter verdict. Watch for commands rewritten by other mods.
Flightdeck
A dashboard that shows every permission check, colour-coded, with credentials masked. It only observes.
A decision log. A "what it can reach" README section. A schemaVersion on state.
review-before-edit tutorial
Asks a custom question through $.ui.ask before Edit or Write touches one file.
Ask instead of a flat deny. Its list of uncovered write routes.
sec-default (built in)
Loads ahead of user mods. Where it loads, a user's mod cannot approve what a deny rule refuses.
Read its source for canonical patterns. Not yet read.
cmd-guard
A settings hook that parses piped and chained commands with tree-sitter and checks each stage.
Command parsing that is sturdier than regex, if Bash matching stays.
cc-bash-guard
A settings hook with YAML rules and tests that returns allow, ask or deny.
Policy as data with its own tests.
Sources
• Mods overview
• React to events
• Use the mods API
• Draw in the interface
• Test a mod
• Mods reference
• Manage mods for your organization
• issue-board: permission bug and fix, issue 228
• issue-board: project.ts
• astrosteveo/claude-plugins: CLAUDE.md