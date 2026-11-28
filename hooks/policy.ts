// Pure decision logic: no `$`, no state. See docs/design.md, "Decision order".
export type Verdict = "allow" | "ask" | "deny";

export type Source =
  "rule" | "guard" | "subagent-bash" | "bash-downgrade" | "malformed" | "claude-code";

export type Rule =
  | { tool: string; kind: "whole"; raw: string }
  | { tool: "Bash"; kind: "exact" | "prefix"; arg: string; raw: string };

export interface RuleSet {
  name: string;
  allow: Rule[];
  ask: Rule[];
  deny: Rule[];
}

export interface Profile extends RuleSet {
  description: string;
  delegable: boolean;
}

// toolName and decision are unknown: the engine's input is not trusted to match its types.
export interface Call {
  toolName?: unknown;
  input: unknown;
  agentId?: string;
  toolCallId?: string;
}

export interface GuardResult {
  kind: "deny" | "ask";
  message: string;
}

export interface ClaudeVerdict {
  decision?: unknown;
  reason?: string;
  rule?: string;
  setting?: string;
  hook?: string;
  plugin?: string;
}

export interface ChainEntry {
  step: 1 | 2 | 3;
  cls: Verdict;
  text: string;
  profile?: string;
  skipped?: string;
}

export interface Decision {
  verdict: Verdict;
  source: Source;
  rule?: string;
  profile?: string;
  message?: string;
  chain?: ChainEntry[];
}

export interface DecideInput {
  call: Call;
  sets: RuleSet[];
  guards: GuardResult[];
  claude: ClaudeVerdict;
  withChain?: boolean;
}

export const BASH_METACHARACTERS: readonly string[] = [
  "&",
  ";",
  "|",
  "$",
  "(",
  ")",
  "`",
  "<",
  ">",
  "\n",
];

export function decide(input: DecideInput): Decision {
  const chain: ChainEntry[] | undefined = input.withChain === true ? [] : undefined;
  const decision = core(input, chain);
  return chain === undefined ? decision : { ...decision, chain };
}

// First return wins: Claude Code deny, unheld subagent Bash, deny walk, malformed input, ask
// walk, allow walk, then Claude Code's own verdict, where a Bash allow no rule holds is
// downgraded to an ask.
function core(input: DecideInput, chain: ChainEntry[] | undefined): Decision {
  const { claude } = input;
  if (claude.decision === "deny") return fromClaude(claude, "deny");
  const name = toolNameOf(input.call);
  const command = commandOf(input.call.input);
  const malformed = name === undefined || (name === "Bash" && command === undefined);
  if (name === "Bash" && input.call.agentId !== undefined) {
    const unheld = subagentBash(input, name, command, malformed, chain);
    if (unheld !== undefined) return unheld;
  }
  const denied = walk("deny", input, name, command, chain);
  if (denied !== undefined) return denied;
  if (malformed || !isVerdict(claude.decision)) {
    return { verdict: "ask", source: "malformed" };
  }
  const ruled =
    walk("ask", input, name, command, chain) ?? allowWalk(input, name, command, malformed, chain);
  if (ruled !== undefined) return ruled;
  if (name === "Bash" && claude.decision === "allow") {
    return { verdict: "ask", source: "bash-downgrade" };
  }
  return fromClaude(claude, claude.decision);
}

const PROTECTED_ASK = "Claude Code ask from a setting, hook or plugin";
const METACHARACTER = "command contains a Bash metacharacter";

function commandOf(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("command" in input)) return undefined;
  const { command } = input;
  return typeof command === "string" ? command : undefined;
}

function hasMeta(command: string): boolean {
  return BASH_METACHARACTERS.some((m) => command.includes(m));
}

function isBoundary(ch: string): boolean {
  return ch === "" || /\s/.test(ch) || BASH_METACHARACTERS.includes(ch);
}

// A deny or ask rule fires wherever its text stands as whole words in the command, so a chained
// or prefixed occurrence still counts. Plain string search: rule text is never a pattern.
function denyAskHit(text: string, command: string): boolean {
  if (text === "") return true;
  for (let i = command.indexOf(text); i !== -1; i = command.indexOf(text, i + 1)) {
    if (isBoundary(command.charAt(i - 1)) && isBoundary(command.charAt(i + text.length))) {
      return true;
    }
  }
  return false;
}

function matches(
  rule: Rule,
  name: string | undefined,
  command: string | undefined,
  cls: BlockingClass,
): boolean {
  if (rule.kind === "whole") return wholeMatches(rule, name, cls);
  if (name !== "Bash" || command === undefined) return false;
  return denyAskHit(rule.arg.trim(), command);
}

// Allow is strict: the command must equal or start with the rule text verbatim, and a
// metacharacter anywhere could chain a second command onto the allowed one.
function allowMatch(
  rule: Rule,
  name: string | undefined,
  command: string | undefined,
  malformed: boolean,
): "hit" | "meta" | "miss" {
  if (malformed) return "miss";
  if (rule.kind === "whole") return wholeMatches(rule, name, "allow") ? "hit" : "miss";
  if (name !== "Bash" || command === undefined) return "miss";
  const strict = rule.kind === "exact" ? command === rule.arg : command.startsWith(rule.arg);
  if (!strict) return "miss";
  return hasMeta(command) ? "meta" : "hit";
}

// An ask from a setting, hook or plugin is a boundary set outside this mod, so no
// allow rule lifts it. An empty string still names its origin.
function isProtectedAsk(claude: ClaudeVerdict): boolean {
  return (
    claude.decision === "ask" &&
    (claude.setting !== undefined || claude.hook !== undefined || claude.plugin !== undefined)
  );
}

function toolNameOf(call: Call): string | undefined {
  return typeof call.toolName === "string" && call.toolName !== "" ? call.toolName : undefined;
}

function isVerdict(value: unknown): value is Verdict {
  return value === "allow" || value === "ask" || value === "deny";
}

function fromClaude(claude: ClaudeVerdict, verdict: Verdict): Decision {
  return {
    verdict,
    source: "claude-code",
    ...(claude.reason === undefined ? {} : { message: claude.reason }),
    ...(claude.rule === undefined ? {} : { rule: claude.rule }),
  };
}

type BlockingClass = "deny" | "ask";

function rulesOf(set: RuleSet, cls: BlockingClass): Rule[] {
  switch (cls) {
    case "ask":
      return set.ask;
    case "deny":
      return set.deny;
  }
}

// Guard results come first in their class walk; a deny guard is the issue's step 2.
function walk(
  cls: BlockingClass,
  input: DecideInput,
  name: string | undefined,
  command: string | undefined,
  chain: ChainEntry[] | undefined,
): Decision | undefined {
  for (const guard of input.guards) {
    if (guard.kind === cls) {
      chain?.push({ step: cls === "deny" ? 2 : 3, cls, text: guard.message });
      return { verdict: cls, source: "guard", message: guard.message };
    }
  }
  for (const set of input.sets) {
    for (const rule of rulesOf(set, cls)) {
      if (matches(rule, name, command, cls)) {
        chain?.push({ step: 3, cls, text: rule.raw, profile: set.name });
        return { verdict: cls, source: "rule", rule: rule.raw, profile: set.name };
      }
    }
  }
  return undefined;
}

// A subagent runs Bash only where an allow rule holds the call: its asks reach no one who
// could answer them. A protected Claude Code ask does not matter here; it decides later.
function subagentBash(
  input: DecideInput,
  name: string,
  command: string | undefined,
  malformed: boolean,
  chain: ChainEntry[] | undefined,
): Decision | undefined {
  const skipped: ChainEntry[] = [];
  for (const set of input.sets) {
    for (const rule of set.allow) {
      const match = allowMatch(rule, name, command, malformed);
      if (match === "hit") return undefined;
      if (match === "meta") {
        skipped.push({
          step: 1,
          cls: "allow",
          text: rule.raw,
          profile: set.name,
          skipped: METACHARACTER,
        });
      }
    }
  }
  chain?.push(...skipped);
  return { verdict: "deny", source: "subagent-bash" };
}

// Under a protected ask every matching allow rule is recorded as skipped, so the chain shows
// what would have allowed the call; core then passes Claude Code's ask through. The
// metacharacter reason wins over the protected one: it is the rule's own reason not to hold.
function allowWalk(
  input: DecideInput,
  name: string | undefined,
  command: string | undefined,
  malformed: boolean,
  chain: ChainEntry[] | undefined,
): Decision | undefined {
  const protectedAsk = isProtectedAsk(input.claude);
  for (const set of input.sets) {
    for (const rule of set.allow) {
      const match = allowMatch(rule, name, command, malformed);
      if (match === "miss") continue;
      const entry: ChainEntry = { step: 3, cls: "allow", text: rule.raw, profile: set.name };
      if (match === "meta") {
        chain?.push({ ...entry, skipped: METACHARACTER });
        continue;
      }
      if (protectedAsk) {
        chain?.push({ ...entry, skipped: PROTECTED_ASK });
        continue;
      }
      chain?.push(entry);
      return { verdict: "allow", source: "rule", rule: rule.raw, profile: set.name };
    }
  }
  return undefined;
}

// An allow rule's server prefix holds only for a bare server ("mcp__srv"), so a server name
// containing "__" is never widened into allowing another server's tools.
function wholeMatches(rule: Rule, name: string | undefined, cls: Verdict): boolean {
  if (rule.kind !== "whole") return false;
  if (rule.tool === "*") return true;
  if (name === undefined) return false;
  if (name === rule.tool) return true;
  if (!rule.tool.startsWith("mcp__")) return false;
  if (cls === "allow" && rule.tool.slice("mcp__".length).includes("__")) return false;
  return name.startsWith(`${rule.tool}__`);
}
