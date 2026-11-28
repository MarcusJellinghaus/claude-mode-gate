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

// First return wins: Claude Code deny, deny walk, malformed input, ask walk, allow walk,
// then Claude Code's own verdict.
function core(input: DecideInput, chain: ChainEntry[] | undefined): Decision {
  const { claude } = input;
  if (claude.decision === "deny") return fromClaude(claude, "deny");
  const name = toolNameOf(input.call);
  const denied = walk("deny", input, name, chain);
  if (denied !== undefined) return denied;
  if (name === undefined || !isVerdict(claude.decision)) {
    return { verdict: "ask", source: "malformed" };
  }
  return (
    walk("ask", input, name, chain) ??
    allowWalk(input, name, chain) ??
    fromClaude(claude, claude.decision)
  );
}

const PROTECTED_ASK = "Claude Code ask from a setting, hook or plugin";

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
      if (wholeMatches(rule, name, cls)) {
        chain?.push({ step: 3, cls, text: rule.raw, profile: set.name });
        return { verdict: cls, source: "rule", rule: rule.raw, profile: set.name };
      }
    }
  }
  return undefined;
}

// Under a protected ask every matching allow rule is recorded as skipped, so the chain shows
// what would have allowed the call; core then passes Claude Code's ask through.
function allowWalk(
  input: DecideInput,
  name: string | undefined,
  chain: ChainEntry[] | undefined,
): Decision | undefined {
  const protectedAsk = isProtectedAsk(input.claude);
  for (const set of input.sets) {
    for (const rule of set.allow) {
      if (!wholeMatches(rule, name, "allow")) continue;
      const entry: ChainEntry = { step: 3, cls: "allow", text: rule.raw, profile: set.name };
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
