// Step 5: a subagent's Bash call that no allow rule holds is denied.
import type { Call, ClaudeVerdict, Decision, GuardResult } from "../../../hooks/policy";
import type { ChainRow, Lists, Row } from "./builders";
import {
  ALLOW,
  ASK,
  CLAUDE_DENY,
  CLAUDE_DENY_DECISION,
  DOWNGRADE,
  METACHARACTER_SKIP,
  NO_MATCH,
  PROTECTED_DECISION,
  bash,
  call,
  denyGuard,
  exact,
  input,
  prefix,
  protectedAsk,
  ruleDecision,
  set,
  whole,
} from "./builders";

const SUBAGENT_BASH: Decision = { verdict: "deny", source: "subagent-bash" };

const fromAgent = (c: Call, agentId = "a1"): Call => ({ ...c, agentId });

const agentRow = (
  name: string,
  c: Call,
  lists: Lists,
  expected: Decision,
  claude: ClaudeVerdict = ALLOW,
  guards: GuardResult[] = [],
): Row => ({
  name,
  input: input(c, [set("baseline", lists)], claude, guards),
  expected,
});

const CHECK = exact("npm run check");
const GIT_PUSH = prefix("git push ");

const MALFORMED_INPUTS: [string, unknown][] = [
  ["{}", {}],
  ["{ command: 42 }", { command: 42 }],
  ["null", null],
  ['"ls"', "ls"],
];

export const SUBAGENT_TABLE: Row[] = [
  agentRow(
    "a subagent Bash call no allow rule holds is denied",
    fromAgent(bash("git status")),
    {},
    SUBAGENT_BASH,
  ),
  agentRow(
    "the same Bash call from the main agent is downgraded",
    bash("git status"),
    {},
    DOWNGRADE,
  ),
  agentRow(
    "an empty agentId counts as a subagent call",
    fromAgent(bash("git status"), ""),
    {},
    SUBAGENT_BASH,
  ),
  agentRow(
    "an unheld subagent Bash call is denied before a deny guard result",
    fromAgent(bash("git status")),
    {},
    SUBAGENT_BASH,
    ALLOW,
    [denyGuard("protected path")],
  ),
  agentRow(
    "a subagent Bash call held by an exact allow is allowed",
    fromAgent(bash("npm run check")),
    { allow: [CHECK] },
    ruleDecision("allow", CHECK.raw),
  ),
  agentRow(
    "a subagent Bash call held by allow Bash is allowed",
    fromAgent(bash("npm run check")),
    { allow: [whole("Bash")] },
    ruleDecision("allow", "Bash"),
  ),
  agentRow(
    "an ask rule does not hold a subagent Bash call",
    fromAgent(bash("git push")),
    { ask: [GIT_PUSH] },
    SUBAGENT_BASH,
  ),
  agentRow(
    "a deny rule does not hold a subagent Bash call",
    fromAgent(bash("git push")),
    { deny: [GIT_PUSH] },
    SUBAGENT_BASH,
  ),
  agentRow(
    "a held subagent Bash call is still denied by a deny rule",
    fromAgent(bash("git push")),
    { allow: [whole("Bash")], deny: [GIT_PUSH] },
    ruleDecision("deny", GIT_PUSH.raw),
  ),
  agentRow(
    "a subagent Read call passes Claude Code's allow through",
    fromAgent(call("Read", { file_path: "x" })),
    {},
    { verdict: "allow", source: "claude-code" },
  ),
  agentRow(
    "a subagent Read call passes Claude Code's ask through",
    fromAgent(call("Read", { file_path: "x" })),
    {},
    NO_MATCH,
    ASK,
  ),
  agentRow(
    "a Claude Code deny for a subagent Bash call stays the Claude Code deny",
    fromAgent(bash("git status")),
    {},
    CLAUDE_DENY_DECISION,
    CLAUDE_DENY,
  ),
  agentRow(
    "a held subagent Bash call under a protected Claude Code ask asks",
    fromAgent(bash("npm run check")),
    { allow: [CHECK] },
    PROTECTED_DECISION,
    protectedAsk("setting", "blockReadsOutsideWorkingDirectories"),
  ),
  agentRow(
    "an unheld subagent Bash call with an unknown decision is denied",
    fromAgent(bash("git status")),
    {},
    SUBAGENT_BASH,
    { decision: "maybe" },
  ),
  ...MALFORMED_INPUTS.flatMap(([label, toolInput]) => [
    agentRow(
      `a subagent Bash call with input ${label} is denied`,
      fromAgent(call("Bash", toolInput)),
      {},
      SUBAGENT_BASH,
    ),
    agentRow(
      `a subagent Bash call with input ${label} under allow Bash is denied`,
      fromAgent(call("Bash", toolInput)),
      { allow: [whole("Bash")] },
      SUBAGENT_BASH,
    ),
  ]),
];

export const SUBAGENT_CHAIN_ROWS: ChainRow[] = [
  {
    name: "an unheld subagent Bash call lists the allow rule skipped for a metacharacter",
    input: input(fromAgent(bash("gh issue edit 1 && x")), [
      set("baseline", { allow: [prefix("gh issue edit ")] }),
    ]),
    chain: [
      {
        step: 1,
        cls: "allow",
        text: "Bash(gh issue edit *)",
        profile: "baseline",
        skipped: METACHARACTER_SKIP,
      },
    ],
  },
  {
    name: "a held subagent Bash call adds no step-1 entry",
    input: input(fromAgent(bash("git push")), [
      set("baseline", { allow: [whole("Bash")], deny: [GIT_PUSH] }),
    ]),
    chain: [{ step: 3, cls: "deny", text: "Bash(git push *)", profile: "baseline" }],
  },
];
