import type {
  Call,
  ChainEntry,
  ClaudeVerdict,
  DecideInput,
  Decision,
  GuardResult,
  Rule,
  RuleSet,
} from "../../../plugin/hooks/policy";

export interface Row {
  name: string;
  input: DecideInput;
  expected: Decision;
}

export interface ChainRow {
  name: string;
  input: DecideInput;
  chain: ChainEntry[];
}

export type Lists = Partial<Pick<RuleSet, "allow" | "ask" | "deny">>;

export const whole = (tool: string): Rule => ({ tool, kind: "whole", raw: tool });
export const exact = (arg: string, raw = `Bash(${arg})`): Rule => ({
  tool: "Bash",
  kind: "exact",
  arg,
  raw,
});
export const prefix = (arg: string, raw = `Bash(${arg}*)`): Rule => ({
  tool: "Bash",
  kind: "prefix",
  arg,
  raw,
});
export const CHECK = exact("npm run check");
export const GIT_PUSH = prefix("git push ");

// Bash inputs that carry no string command.
export const MALFORMED_INPUTS: [string, unknown][] = [
  ["{}", {}],
  ["{ command: 42 }", { command: 42 }],
  ["null", null],
  ['"ls"', "ls"],
];

export const set = (name: string, lists: Lists = {}): RuleSet => ({
  name,
  allow: lists.allow ?? [],
  ask: lists.ask ?? [],
  deny: lists.deny ?? [],
});
export const ALLOW: ClaudeVerdict = { decision: "allow" };
export const ASK: ClaudeVerdict = { decision: "ask" };

export const call = (toolName: unknown, toolInput: unknown = {}): Call => ({
  toolName,
  input: toolInput,
});
export const bash = (command: string): Call => call("Bash", { command });
export const input = (
  c: Call,
  sets: RuleSet[],
  claude: ClaudeVerdict = ALLOW,
  guards: GuardResult[] = [],
): DecideInput => ({ call: c, sets, guards, claude });
export const NO_MATCH: Decision = { verdict: "ask", source: "claude-code" };
export const MALFORMED: Decision = { verdict: "ask", source: "malformed" };
export const DOWNGRADE: Decision = { verdict: "ask", source: "bash-downgrade" };

export const ruleDecision = (
  verdict: Decision["verdict"],
  rule: string,
  profile = "baseline",
): Decision => ({
  verdict,
  source: "rule",
  rule,
  profile,
});

export const denyGuard = (message: string): GuardResult => ({ kind: "deny", message });
export const askGuard = (message: string): GuardResult => ({ kind: "ask", message });
export const guardDecision = (verdict: Decision["verdict"], message: string): Decision => ({
  verdict,
  source: "guard",
  message,
});
export const CLAUDE_DENY: ClaudeVerdict = { decision: "deny", reason: "blocked by settings" };
export const CLAUDE_DENY_DECISION: Decision = {
  verdict: "deny",
  source: "claude-code",
  message: "blocked by settings",
};

export const PROTECTED_REASON = "outside the working directory";
export const protectedAsk = (
  field: "setting" | "hook" | "plugin",
  value: string,
): ClaudeVerdict => ({
  decision: "ask",
  reason: PROTECTED_REASON,
  [field]: value,
});
export const PROTECTED_DECISION: Decision = {
  verdict: "ask",
  source: "claude-code",
  message: PROTECTED_REASON,
};
export const PROTECTED_FIELDS = [
  ["setting", "blockReadsOutsideWorkingDirectories"],
  ["hook", "pre-tool-hook"],
  ["plugin", "some-plugin"],
] as const;
export const PROTECTED_SKIP = "Claude Code ask from a setting, hook or plugin";
export const METACHARACTER_SKIP = "command contains a Bash metacharacter";
