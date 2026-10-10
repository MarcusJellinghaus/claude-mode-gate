# Claude Code mods API notes

Facts verified against the API definitions that ship with Claude Code, for
claude-mode-gate. The API is early access and moves between releases, so the
declaration file is the authority. Part of [design.md](design.md); the
"Assumptions" table there cites the claim numbers below.

The path of the types file below is regenerated per process and is not stable.
Do not hard-code it anywhere; load the `plugin-authoring` skill to get the
current path.

## Version and sources

- Claude Code version: `2.1.292` (`claude --version`), binary
  `C:\Users\Marcu\.local\bin\claude.exe`.
- Types (the authority, about 16,000 lines), written by the engine when the
  `plugin-authoring` skill loads, so the path changes with each process:
  `C:/Users/Marcu/AppData/Local/Temp/claude/bundled-skills/2.1.292/14d40ec2ff092af7d794dc36658ca09b/plugin-authoring/types/claude-code.d.ts`
- Long form: `.../plugin-authoring/reference.md` (same folder).
- Skill entry point (not on disk, loaded through the Skill tool): `plugin-authoring`.
- Example: `.../plugin-authoring/examples/tool-call.ts`.
- Once the engine has loaded a mod from a mods folder or `--plugin-dir`, the same
  types are laid in `<mod>/.claude-plugin/types/claude-code/index.d.ts` and
  `claude-code-tools/index.d.ts`, with a `tsconfig.json` the mod extends.
- Line numbers below refer to `claude-code.d.ts`.

## Claims

### 1. `/clear` fires `session.end` with `reason: 'clear'`, no `session.start` follows, `session.start` has no `reason` - CONFIRMED

`SessionEndInput.reason` (line 10978): "`clear` is how a hook sees a `/clear`:
the conversation ends, the process goes on under a new session id, and no
`session.start` fires for it." `reference.md` says the same: "`session.end` with
`reason: 'clear'`, and no `session.start` after it".

`SessionStartInput` (line 11591) has exactly `cwd`, `surface`, `isInteractive`.
No `reason`. See "Other facts" for the types.

Consequence: after `/clear` the session id changes (`SessionEndInput.sessionId`
is the old id) and the module's variables survive, so a mod must reset its
active profile in `session.end`.

### 2. A hot reload re-fires `session.start` - CONFIRMED

SKILL.md: "A reload is a fresh load of the module: `register` runs again and
`session.start` fires again. Values in `$.state` (the session's) and `$.store`
(across sessions) are the host's and stay; the module's own variables start
over." A reload also drops the previous environment's timers. A hot reload is
a reload of the plugin's own files, so a mod cannot tell it from a fresh start
by `session.start` alone; keep the active profile in `$.state` if it must
survive.

### 3. No DOM, no Node, everything through `$`; env vars; `$.fs`; `$.process.run` - CONFIRMED

reference.md: "The module runs in an environment of its own, with no DOM and no
Node: everything outside it is reached through `$`."

Environment variables are read with `$.env.get(name)` (line 3560), not
`process.env`:

```ts
get: (name: string) => Promise<string | undefined>;
set: (name: string, value: string | undefined) => Promise<void>;
```

`name` must be a string literal. "`claude plugin validate` lists the names, and
a name the module does not spell is refused." So `$.env.get("MODE_GATE_PROFILES")`,
`$.env.get("HOME")` and `$.env.get("XDG_CONFIG_HOME")` work, but a computed name
does not. Unset reads as `undefined`. On Windows read `USERPROFILE` as well as
`HOME`; the docs give no platform fallback.

`$.fs` (line 3195). Paths are "relative to the working directory, or absolute":

```ts
read: FsReadCall; // (path) => Promise<string>; (path, { as: 'bytes' }) => Promise<{ base64 }>
write: (path: string, text: string) => Promise<void>;
list: (path?: string) => Promise<FsEntry[]>;
exists: (path: string) => Promise<boolean>;
stat: (path: string, options?: FsStatOptions) => Promise<FsStat>;
ancestors: (request: FsAncestorsRequest) => Promise<readonly FsAncestor[]>;
```

Limits: a read or write over 4 MiB rejects; `read` rejects when the file is
missing; `exists` rejects only for a network location, which is never touched.

`$.process.run` (line 3470):

```ts
run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>;
```

No shell. `ProcessRunInit = { cwd?, env?: Record<string,string>, stdin?: string, timeoutMs? }`
(default 30 s, 10 minutes at most). Result:
`{ exitCode, stdout, stderr, isStdoutTruncated, isStderrTruncated }`, each stream
capped at 4 MiB. It resolves for any exit code. A child ended by a signal reads
as exit code 1. It rejects when the command cannot start or is still running at
the timeout. "Git runs with repo hooks off." CLI only. A `$.process.spawn`
streaming variant also exists.

### 4. `tool.check` carries `input`; `agentId` on both tool events, absent on the main loop - CONFIRMED

`ToolCheckInput` (line 12731): `tool: string`, `input: unknown` ("The tool's
arguments as the permission decision reads them (`{ command }` for Bash,
`{ file_path, ... }` for the file tools)"), `tool_use_id?`, `agentId?`, `ceiling?`.

`agentId` on `tool.check`: "The id of the loop the call is decided in, on a real
call inside a subagent's or a teammate's loop: the one its `tool.call` carried.
Absent on the main loop and on a query." On `tool.call` it comes from
`AgentLoop` (line 194): "for a subagent or a teammate ... absent on the main
loop". Caveat: "A workflow's agents and the engine's own forks (compaction,
memory) carry ids no list names." `input` is `unknown`, so a hook must narrow it
itself. `tool.check` runs "after the `tool.call` and PreToolUse hooks and before
the mode settles an ask".

### 5. `next(e)` resolves to the engine's verdict `{decision, reason, rule}` - CONFIRMED

Doc on `tool.check` (line 3932): "`next(e)` resolves to the engine's verdict
(rules, mode, the tool's own check, PreToolUse's decision) and runs no tool:
return any `{ decision }`, a deny after it too." So Claude Code's own verdict
(including a settings deny rule) is visible. `ToolCheckResult` (line 12778) has
`decision`, `reason?`, `rule?`, `hook?`, `ceiling?`. "A hook may answer any
verdict in either direction; the last word up the chain is the decision." So the
engine does not enforce that a deny from Claude Code stays a deny; the mod must
return `next(e)`'s deny itself. Managed-settings deny: "Managed-settings hooks'
deny comes first" (for `tool.call`). For a tool that requires the person (a
question, a plan), "a hook only tightens: its `allow` does not dismiss the dialog."

### 6. `session.start.isInteractive` gives headless detection - CONFIRMED

"Whether a person is at the prompt: true under the REPL, false for a `-p` run or
the SDK." `surface` is `null` for `-p` and the SDK. Note `isInteractive` is only
on `session.start`, so a hook that needs it later must store it. Also: a headless
`claude -p` "always loads fresh" and the mod folder's hot-reload question is not
asked there.

### 7. Event shapes - CONFIRMED

`tool.call` spreads the arguments (line 12567): "the tool's arguments spread
beside them (`e.command` for Bash)". `tool.check` nests them as `e.input`.

Results: `tool.call` returns `ToolCallResult` = `{ deny: string }` | `{ result,
context?, ref?, text?, isReadOnly? }` | `{ isError: true, ... }`; `tool.check`
returns `{ decision: 'allow'|'ask'|'deny', reason?, rule?, hook?, ceiling? }`.
`tool_use_id` and `agentId` on `tool.call` are reserved: "a rewrite of any is
refused." `tool.check`'s input is pinned entirely: "a hook decides about this
call, it does not change it".

### 8. Throwing or over budget is skipped (fail-open) - CONFIRMED (with refinements); module load failure silent - PARTLY REFUTED

Fail-open without a handler. Line 3908: "At every one, a hook that fails
(throws, overruns its budget: HookBudget, answers a wrong shape) is skipped: the
hooks beneath and core run in its place ... @remarks So a guard fails open
unless its registration carries a `.catch` that refuses in its place."

Time budget (`HookBudget`, line 5070):

- `ms: 10_000` per hook per dispatch, counting only the hook's own code: the
  clock stops while a `next(e)` or any `$` call is in flight (a `$.clock` wait
  excepted).
- `catchMs: 1_000` grace for a `.catch` handler.
- `session.end` is different: "One short wall-clock bound (1.5 s by default)
  covers every hook, its `$` waits and core" and its clock never stops.
- `engine.create` has no budget.

A `.catch` fixes the fail-open: `on(...).catch(($, e, next) => next.called ?
next(e) : { deny: 'why' })`. At `tool.check`: `.catch(() => ({ decision: "deny" }))`.
A handler that itself throws leaves the hook skipped. One `.catch` per
registration (a second throws).

Re-entry: a `$` call a hook makes can raise the same event beneath the hook's own
frame; the hook is not run again there, and its `.catch` is asked instead
(`next.error.kind === 're-entry'`). A guard needs a handler that denies there too.
That is the API author's advice. claude-mode-gate does not follow it: it passes a
re-entrant event through with `next(e)`, because the nested event is its own `$`
call and denying would block its own reads and writes (see design.md, "Failure";
spike row 19 decides).

Module that fails to load: the docs do not say "everything ungated"; they say a
failed hook or module is reported, not silent. While the session hot-reloads the
plugin folder the transcript shows a dim line "naming the plugin, the event and
the reason when a hook fails or a module does not load"; in any other session
that line goes to the debug log only (`claude --debug`). `claude -p` prints a
`--plugin-dir` plugin that failed to load "once on stderr with the reason"
(text output); json or stream-json keep it in the debug log. The docs do not
state what is gated when a module does not load, but a hook that never
registered cannot gate, so treat load failure as fail-open and check it at
startup (for example with a `session.start` canary, which cannot run if the
module did not load, so a launcher check is the only reliable signal).

### 9. Registration shape - CONFIRMED

- `Register = (on: On, options: PluginOptions) => unknown` (line 9244);
  `on(event, matcher?, hook)`; hook is `($, e, next)`. SKILL.md:
  `export const register: Register = (on, options) => { ... }`, type from `'claude-code'`.
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`, "one path, relative to that file".
- `claude plugin validate`: "Under what it hooks, a `gating hook with .catch:`
  or `gating hook without .catch:` line names each hook at a site whose answer
  can refuse what was asked (`tool.call`, `tool.check`, `prompt.submit`,
  `prompt.mention`, `config.set`, `plugin.register`, `command.run`, a call on
  `$`, among others; its JSON report lists them as `gatingHooks`)". "a fact,
  never a warning". Flags: `--json`, `--strict`.
- `claude plugin test [dir]` ("Run a mod's tests") exists (`claude plugin --help`).
  Tests are `*.test.ts`; import `test`, `expect`, `mock` from `claude-code/testing`;
  the test's `on` stands for the engine beneath the plugin.
- `On` also takes a glob pattern (`*`, `classic.*`, `!tool.*`) and a matcher
  object narrowing on event keys (`{ tool: 'Bash' }`, `{ command: 'quote' }`).
  A repeat registration of the same pattern and matcher throws.

### 10. The engine provides the API types; a mod needs only its own `PluginState` contract - CONFIRMED (conditional)

The engine writes `claude-code` types; "there is no command to run". A mod "that
keeps values in `$.state` has a fourth file, `types/index.d.ts`: its type
contract, declaring each value in `interface PluginState` under the mod's name,
named in `plugin.json` as `"types": "./types/index.d.ts"`. The module imports its
value types from `'../types'`". Without `$.state` use no contract file is needed.
`PluginState` is empty by default and merged through `declare module "claude-code"`
(line 7729). The `$.state` `plugin` and `key` must be literals in source, and
only the owning plugin writes a value. Note `types/index.d.ts` is also the
contract for a noun a plugin adds to `$` in `engine.create`.

### 11. `$.fs.stat(path, {resolve: true})` returns `realPath` - CONFIRMED

`FsStat.realPath?: string` (line 4988): "Where the path landed ... absolute, every
symbolic link followed, `.` and `..` folded; else absent. Absent too when the
path leads nowhere or a hook above withheld it, so a guard denies without it;
and a hard link, a volume or file-id spelling (macOS `/.vol/`) or a case alias
keeps its own spelling." `stat` rejects `ENOENT` for a missing path (so a not-yet-existing
Write target needs its parent resolved; the d.ts has a worked `placed()` example
that also rejects drive-relative `D:x`, `\\` and `//` paths). "A deny-list on
spellings is thus best effort; an allow-list on `realPath` under a root resolved
the same way is the robust guard."

### 12. Sibling files, writing a log, reading user config - CONFIRMED / see notes

- Imports: reference.md: the module "and every file it imports from the plugin"
  may be `.ts`, `.tsx`, `.jsx`, `.js`, `.mjs`, `.cjs`, `.mts`, `.cts`; "is an ES
  module whatever its suffix. A file of the plugin is imported with an `import`
  declaration. A module holding `import()` does not load." So multi-file works with
  static `import`; no bundling step is described. Importing npm packages is not
  documented (no Node, no `node_modules` resolution mentioned): NOT FOUND.
  A file the plugin ships is read with `$.fs.read(`${$.plugin.root}/...`)`.
- Write a file: `$.fs.write(path, text)` creates the file and directories but
  replaces the whole content; there is no append (4 MiB cap). Alternatives:
  `$.ui.log(text, { to: 'debug' })` (debug log), `$.store.set/get` (JSON, "A JSON
  file of the plugin's own under the user's Claude Code configuration directory",
  4 MiB total).
- User config: the manifest's `userConfig` fields arrive as `options`
  (`PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>`);
  they live in settings under `pluginConfigs` and each non-secret field is a row in
  `/config`. A change reloads the module. Other config: `$.settings.read()` (merged
  settings, read only, `{ source }` for one source), `$.fs.read` of an absolute path.
  No documented API for a mod-specific config file path (for example `~/.claude/...`
  needs `$.env.get("HOME")` and `$.fs.read`).

### 13. Agent prompt, Bash text, `command.run` - CONFIRMED

- Bash: `tool.call` has `e.command` (line 15984); `tool.check` has
  `e.input.command`.
- Agent tool: `BuiltinToolInputs.Agent` has `description`, `prompt`,
  `subagent_type?`, `model?`, `effort?`, `name?` and more (line 15782), so a
  `tool.call` hook on `{ tool: 'Agent' }` sees `e.prompt` and `e.subagent_type`.
  `agent.offer` / `agent.spawn` events also exist.
- Slash command API (line 3028 and 1876):

```ts
export type CommandSpec = {
  name: string; // no slash; letters, digits, _, -; up to 64
  description: string; // typeahead and /help
  argumentHint?: string;
  immediate?: true; // run at once, even mid-turn
};
```

`await $.command.register(spec)` in `session.start` ("listed in the typeahead
from the next keystroke on"; registering a name again replaces it; a built-in's
name is refused). Serve with a hook on `command.run`. `/gate-on args`:

```ts
on("session.start", async ($, e, next) => {
  await $.command.register({
    name: "gate-on",
    description: "Activate a profile.",
    argumentHint: "[profile]",
  });
  return next(e);
});
on("command.run", { command: "gate-on" }, async ($, e) => {
  // e.args is everything after the name, as typed ("" when none)
  return { text: `profile ${e.args} on` };
});
```

`CommandRunInput` = `{ command, args, origin, presentation }`; `CommandRunResult` =
`{ text?, context?: readonly string[], exitCode?, ref? }`. `context` is read by the
model only; `exitCode` (0-255) applies to `claude -p "/cmd"`. A `command.run`
hook that answers its own command is not in `gatingHooks`; validate prints
`answers its own command:` for it. `$.command.run({ command, args? })` runs a
command from a plugin; `$.command.list()` lists them.

## Other facts a mod author needs

### Layout

```text
<mod>/.claude-plugin/plugin.json   { "name", "version", "description", ["types": "./types/index.d.ts"], [userConfig] }
<mod>/hooks/hooks.json             { "modules": ["./register.tsx"] }
<mod>/hooks/register.ts(x)         export const register: Register = (on, options) => { ... }
<mod>/types/index.d.ts             only when the mod uses $.state
```

Install line for others: `/plugin install <mod> --marketplace <owner>/<repo>`; a
repo becomes a marketplace with `.claude-plugin/marketplace.json`
(`{ name, owner: { name }, plugins: [{ name, source: "./" }] }`). A mod loads with
`claude --plugin-dir <folder>` or `CLAUDE_CODE_PLUGIN_DIRS`.

### Session events (verbatim)

```ts
export type SessionStartInput = {
  cwd: string;
  surface: RenderSurface | null; // null for -p or the SDK
  isInteractive: boolean;
};
export type SessionStartResult = { cwd: string };

export type SessionEndInput = {
  reason: SessionEndReason; // ClassicHookInputs['SessionEnd']['reason']
  sessionId: string;
  resume: SessionResume;
};
export type SessionEndResult = { sessionId: string };
// reasons: prompt_input_exit | clear | resume | logout | other
```

### Tool events (verbatim)

```ts
export type AgentLoop = { agentId?: string };
export type ToolCallInput = ToolCallEnvelope & AgentLoop;   // e.tool, e.tool_use_id, e.<args...>

export type ToolCallResult<Name extends string = string> =
  | { deny: string; result?: undefined; ... }
  | { result: ToolResultOf<Name>; context?: readonly string[]; ref?: number;
      text?: string; isReadOnly?: true; isError?: undefined; deny?: undefined }
  | { isError: true; ...; deny?: undefined };

type ToolCheckDecision = 'allow' | 'ask' | 'deny';
type ToolCheckInput = {
    tool: string;
    input: unknown;
    tool_use_id?: string;
    agentId?: string;
    ceiling?: ToolCheckDecision;
};
type ToolCheckResult = {
    decision: ToolCheckDecision;
    reason?: string;
    rule?: string;        // e.g. Bash(git push:*)
    hook?: string;        // classic hook event that decided, e.g. PreToolUse
    ceiling?: ToolCheckDecision;
};
```

`$.tool.check({ tool, input })` runs the same chain with nothing executed (no
`agentId`). `tool.check` hook sample: `on("tool.check", { tool: "Read" }, () => ({ decision: "allow" }))`.

### Hook plumbing (verbatim)

```ts
export type Register = (on: On, options: PluginOptions) => unknown;
export type Registration<F> = { readonly catch: (handler: CatchHandler<F>) => void };
// Next<N>: (e) => Promise<result>; also next.to(e, tier), next.signal, next.is(pattern, e),
//   next.event, next.origin, next.trace, next.budget { ms, remainingMs }
//   in a .catch handler: next.called, next.error.kind ('re-entry'), next.error.cause ('lent')
export type HookBudget = { readonly ms: 10_000; readonly catchMs: 1_000; ... };
```

Rules worth remembering:

- A hook that returns nothing is a failure; one that returns without `next` answers for itself.
- A hook that `deny`s after calling `next(e)` undoes nothing that ran.
- Plugins nest in order, "first outermost"; a managed (organization) hook comes first
  and no user hook skips its tier.
- `session.append` and many other events exist; the list is in `EngineEventOf` (line 3915).
- Classic settings hooks are hookable as `classic.<Event>` (`classic.PreToolUse`,
  `classic.SessionEnd`), `e` being what the hook gets on stdin.

### `$` nouns this mod will use

```ts
$.plugin   { name: string; root: string }
$.env      { get(name: string): Promise<string | undefined>; set(name, value) }   // name literal
$.fs       { read, write, list, exists, stat, ancestors }                          // see claim 3
$.process  { run(argv, init?), spawn(request) }
$.store    { get(key), set(key, value), delete(key), keys() }                      // across sessions
$.state    { get(ref), set(...) }                                                  // per session, survives hot reload
$.settings { read(args?) }                                                         // read only
$.command  { list(), run(...), register(spec) }
$.tool     { call(input), check(args), register(spec) }
$.session  { cwd(), id(), root(), messages(), append(), usage(), version(), ... }
$.ui       { log(text, { to }), toast, status, ... }
```

### Behaviour notes

- Hot reloading is switched on by the person's answer to a prompt ("Enable hot
  reloading for this session?"); under `claude -p` nobody can be asked and a
  `--plugin-dir` mod is needed.
- `claude plugin validate <dir>` reads the manifest and module source and lists the
  env names, `$.state` keys and gating hooks the module spells.
- A guard that calls `$.fs`/`$.process` inside a hook can see those calls raise
  events that other hooks (and, via re-entry, itself) see; give it a `.catch`
  that handles `next.error.kind === 're-entry'`.
- Not found anywhere in the shipped docs: a documented way to append to a file,
  a per-mod config path, npm package imports, and a statement of what is gated
  when a module fails to load.
