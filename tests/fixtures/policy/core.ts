// Steps 1 to 3: whole-tool rules, order, pass-through, malformed input, guards, protected asks.
import type { Call, ClaudeVerdict } from "../../../plugin/hooks/policy";
import type { ChainRow, Row } from "./builders";
import {
  ALLOW,
  ASK,
  CLAUDE_DENY,
  CLAUDE_DENY_DECISION,
  MALFORMED,
  NO_MATCH,
  PROTECTED_DECISION,
  PROTECTED_FIELDS,
  PROTECTED_REASON,
  PROTECTED_SKIP,
  askGuard,
  call,
  denyGuard,
  exact,
  guardDecision,
  input,
  protectedAsk,
  ruleDecision,
  set,
  whole,
} from "./builders";

// A non-match under a Claude Code ask returns that ask, which shows nothing matched.
const allowCase = (rule: string, tool: string, matches: boolean, toolInput: unknown = {}): Row => ({
  name: `allow ${rule} ${matches ? "matches" : "does not match"} ${tool}`,
  input: input(call(tool, toolInput), [set("baseline", { allow: [whole(rule)] })], ASK),
  expected: matches ? ruleDecision("allow", rule) : NO_MATCH,
});

const denyCase = (rule: string, tool: string, matches: boolean): Row => ({
  name: `deny ${rule} ${matches ? "matches" : "does not match"} ${tool}`,
  input: input(call(tool), [set("baseline", { deny: [whole(rule)] })], ASK),
  expected: matches ? ruleDecision("deny", rule) : NO_MATCH,
});

const CORE_ROWS: Row[] = [
  {
    name: "a baseline allow rule allows Read",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })]),
    expected: ruleDecision("allow", "Read"),
  },
  {
    name: "a Claude Code deny beats a matching profile allow",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })], {
      decision: "deny",
      reason: "blocked by settings",
      rule: "Read",
    }),
    expected: {
      verdict: "deny",
      source: "claude-code",
      message: "blocked by settings",
      rule: "Read",
    },
  },
  {
    name: "a Claude Code deny stays a Claude Code deny under a matching deny rule",
    input: input(call("Read"), [set("baseline", { deny: [whole("Read")] })], {
      decision: "deny",
      reason: "blocked by settings",
      rule: "Read",
    }),
    expected: {
      verdict: "deny",
      source: "claude-code",
      message: "blocked by settings",
      rule: "Read",
    },
  },
  {
    name: "a Claude Code deny without reason or rule under a matching allow has no message or rule key",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })], { decision: "deny" }),
    expected: { verdict: "deny", source: "claude-code" },
  },
  {
    name: "an allow rule overrides a plain Claude Code ask",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })], ASK),
    expected: ruleDecision("allow", "Read"),
  },
];

const WHOLE_TOOL_ROWS: Row[] = [
  allowCase("mcp__srv", "mcp__srv__a", true),
  allowCase("mcp__srv", "mcp__srv__b", true),
  allowCase("mcp__srv", "mcp__srv2__a", false),
  allowCase("mcp__srv", "mcp__other__a", false),
  allowCase("mcp__srv__a", "mcp__srv__a", true),
  allowCase("mcp__srv__a", "mcp__srv__ab", false),
  allowCase("Skill", "Skill", true),
  allowCase("Skill", "SkillX", false),
  allowCase("Skill", "Skill__x", false),
  denyCase("Edit", "Edit__x", false),
  allowCase("*", "Read", true),
  allowCase("*", "mcp__srv__a", true),
  allowCase("*", "Bash", true, { command: "ls" }),
  denyCase("mcp__my__srv", "mcp__my__srv__read", true),
  allowCase("mcp__my__srv", "mcp__my__srv__read", false),
  denyCase("mcp__srv__a", "mcp__srv__a__b", true),
  denyCase("mcp__srv", "mcp__srv__a", true),
  denyCase("mcp__srv", "mcp__other__a", false),
  {
    name: "deny * denies Read even when the baseline allows it",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")], deny: [whole("*")] })]),
    expected: ruleDecision("deny", "*"),
  },
  {
    name: "ask * asks for Read even when the baseline allows it",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")], ask: [whole("*")] })]),
    expected: ruleDecision("ask", "*"),
  },
];

const ORDER_ROWS: Row[] = [
  {
    name: "an ask rule beats an allow rule on the same tool",
    input: input(call("Edit"), [set("baseline", { allow: [whole("Edit")], ask: [whole("Edit")] })]),
    expected: ruleDecision("ask", "Edit"),
  },
  {
    name: "a deny rule beats an allow rule on the same tool",
    input: input(call("Edit"), [
      set("baseline", { allow: [whole("Edit")], deny: [whole("Edit")] }),
    ]),
    expected: ruleDecision("deny", "Edit"),
  },
  {
    name: "a profile deny beats a baseline allow and names the profile",
    input: input(call("Edit"), [
      set("baseline", { allow: [whole("Edit")] }),
      set("git-write", { deny: [whole("Edit")] }),
    ]),
    expected: ruleDecision("deny", "Edit", "git-write"),
  },
  {
    name: "two matching denies in two sets report the first set",
    input: input(call("Edit"), [
      set("baseline", { deny: [whole("Edit")] }),
      set("git-write", { deny: [whole("*")] }),
    ]),
    expected: ruleDecision("deny", "Edit"),
  },
  {
    name: "two matching denies in one list report the first in the list",
    input: input(call("Edit"), [set("baseline", { deny: [whole("*"), whole("Edit")] })]),
    expected: ruleDecision("deny", "*"),
  },
  {
    name: "an inherited set with an empty allow list reports its own name",
    input: input(call("Edit"), [set("git-write", { deny: [whole("Edit")] })]),
    expected: ruleDecision("deny", "Edit", "git-write"),
  },
];

const PASS_THROUGH_ROWS: Row[] = [
  ...(["allow", "ask", "deny"] as const).map((decision): Row => ({
    name: `an unknown tool with no rule passes a Claude Code ${decision} through`,
    input: input(call("Unknown"), [set("baseline")], { decision, reason: "why", rule: "Unknown" }),
    expected: { verdict: decision, source: "claude-code", message: "why", rule: "Unknown" },
  })),
  ...(["allow", "ask", "deny"] as const).map((decision): Row => ({
    name: `a Claude Code ${decision} without reason or rule has no message or rule key`,
    input: input(call("Unknown"), [set("baseline")], { decision }),
    expected: { verdict: decision, source: "claude-code" },
  })),
  {
    name: "an exact Bash rule does not affect a non-Bash tool",
    input: input(call("Read"), [set("baseline", { allow: [exact("npm run check")] })], ASK),
    expected: NO_MATCH,
  },
];

const UNKNOWN_DECISIONS: [string, ClaudeVerdict][] = [
  ["missing", {}],
  ['"maybe"', { decision: "maybe" }],
  ["42", { decision: 42 }],
];

const UNKNOWN_DECISION_ROWS: Row[] = UNKNOWN_DECISIONS.flatMap(([label, claude]): Row[] => [
  {
    name: `a ${label} Claude Code decision asks as malformed`,
    input: input(call("Read"), [set("baseline")], claude),
    expected: MALFORMED,
  },
  {
    name: `a ${label} Claude Code decision asks as malformed under a matching allow`,
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })], claude),
    expected: MALFORMED,
  },
  {
    name: `a ${label} Claude Code decision asks as malformed under a matching ask`,
    input: input(call("Read"), [set("baseline", { ask: [whole("Read")] })], claude),
    expected: MALFORMED,
  },
  {
    name: `a ${label} Claude Code decision still denies under deny *`,
    input: input(call("Read"), [set("baseline", { deny: [whole("*")] })], claude),
    expected: ruleDecision("deny", "*"),
  },
]);

const UNUSABLE_CALLS: [string, Call][] = [
  ["missing", { input: {} }],
  ["undefined", { toolName: undefined, input: {} }],
  ['""', call("")],
  ["42", call(42)],
  ["{}", call({})],
];

const UNUSABLE_NAME_ROWS: Row[] = [
  ...UNUSABLE_CALLS.flatMap(([label, c]): Row[] => [
    {
      name: `a ${label} tool name asks as malformed`,
      input: input(c, [set("baseline")]),
      expected: MALFORMED,
    },
    {
      name: `a ${label} tool name asks as malformed under allow *`,
      input: input(c, [set("baseline", { allow: [whole("*")] })]),
      expected: MALFORMED,
    },
  ]),
  {
    name: "deny * denies a call with no tool name",
    input: input({ input: {} }, [set("baseline", { deny: [whole("*")] })]),
    expected: ruleDecision("deny", "*"),
  },
  {
    name: "deny Bash does not deny a call with no tool name",
    input: input({ input: {} }, [set("baseline", { deny: [whole("Bash")] })]),
    expected: MALFORMED,
  },
  {
    name: "deny mcp__srv does not deny a call with no tool name",
    input: input({ input: {} }, [set("baseline", { deny: [whole("mcp__srv")] })]),
    expected: MALFORMED,
  },
];

const ALLOW_READ = set("baseline", { allow: [whole("Read")] });

const GUARD_ROWS: Row[] = [
  {
    name: "a deny guard result beats a profile allow",
    input: input(call("Read"), [ALLOW_READ], ALLOW, [denyGuard("protected path")]),
    expected: guardDecision("deny", "protected path"),
  },
  {
    name: "an arbitrary deny guard message is passed through unchanged",
    input: input(call("Read"), [ALLOW_READ], ALLOW, [denyGuard("invalid subagent assignment")]),
    expected: guardDecision("deny", "invalid subagent assignment"),
  },
  {
    name: "an ask guard result asks despite a profile allow",
    input: input(call("Read"), [ALLOW_READ], ALLOW, [askGuard("check this path")]),
    expected: guardDecision("ask", "check this path"),
  },
  {
    name: "a profile deny * beats an ask guard result",
    input: input(call("Read"), [set("baseline", { deny: [whole("*")] })], ALLOW, [
      askGuard("check this path"),
    ]),
    expected: ruleDecision("deny", "*"),
  },
  {
    name: "a deny mcp__srv rule beats an ask guard result on mcp__srv__a",
    input: input(call("mcp__srv__a"), [set("baseline", { deny: [whole("mcp__srv")] })], ALLOW, [
      askGuard("check this path"),
    ]),
    expected: ruleDecision("deny", "mcp__srv"),
  },
  {
    name: "a deny guard result is reported before a matching deny rule",
    input: input(call("Read"), [set("baseline", { deny: [whole("Read")] })], ALLOW, [
      denyGuard("protected path"),
    ]),
    expected: guardDecision("deny", "protected path"),
  },
  {
    name: "an ask guard result is reported before a matching ask rule",
    input: input(call("Read"), [set("baseline", { ask: [whole("Read")] })], ALLOW, [
      askGuard("check this path"),
    ]),
    expected: guardDecision("ask", "check this path"),
  },
  {
    name: "a deny rule beats an ask guard result",
    input: input(call("Read"), [set("baseline", { deny: [whole("Read")] })], ALLOW, [
      askGuard("check this path"),
    ]),
    expected: ruleDecision("deny", "Read"),
  },
  {
    name: "two deny guard results report the first",
    input: input(call("Read"), [ALLOW_READ], ALLOW, [
      denyGuard("protected path"),
      denyGuard("invalid subagent assignment"),
    ]),
    expected: guardDecision("deny", "protected path"),
  },
  {
    name: "a Claude Code deny stays a Claude Code deny with an ask guard result",
    input: input(call("Read"), [ALLOW_READ], CLAUDE_DENY, [askGuard("check this path")]),
    expected: CLAUDE_DENY_DECISION,
  },
  {
    name: "a Claude Code deny stays a Claude Code deny with a deny guard result",
    input: input(call("Read"), [ALLOW_READ], CLAUDE_DENY, [denyGuard("protected path")]),
    expected: CLAUDE_DENY_DECISION,
  },
  {
    name: "a deny guard result denies a call with no tool name",
    input: input({ input: {} }, [set("baseline")], ALLOW, [denyGuard("protected path")]),
    expected: guardDecision("deny", "protected path"),
  },
  {
    name: "an ask guard result on a call with no tool name asks as malformed",
    input: input({ input: {} }, [set("baseline")], ALLOW, [askGuard("check this path")]),
    expected: MALFORMED,
  },
  {
    name: "a deny guard result denies under an unknown Claude Code decision",
    input: input(call("Read"), [ALLOW_READ], { decision: "maybe" }, [denyGuard("protected path")]),
    expected: guardDecision("deny", "protected path"),
  },
];

const ALLOW_SRV_A = set("baseline", { allow: [whole("mcp__srv__a")] });
const SETTING_ASK = protectedAsk("setting", "blockReadsOutsideWorkingDirectories");

const PROTECTED_ASK_ROWS: Row[] = [
  ...PROTECTED_FIELDS.map(([field, value]): Row => ({
    name: `an allow rule does not override a Claude Code ask carrying ${field}`,
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], protectedAsk(field, value)),
    expected: PROTECTED_DECISION,
  })),
  {
    name: "a protected Claude Code ask carries Claude Code's rule",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], { ...SETTING_ASK, rule: "Read(/etc/**)" }),
    expected: { ...PROTECTED_DECISION, rule: "Read(/etc/**)" },
  },
  {
    name: "an empty setting still protects a Claude Code ask",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], protectedAsk("setting", "")),
    expected: PROTECTED_DECISION,
  },
  {
    name: "an allow rule overrides a Claude Code ask without setting, hook or plugin",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], { decision: "ask", reason: PROTECTED_REASON }),
    expected: ruleDecision("allow", "mcp__srv__a"),
  },
  {
    name: "a deny rule beats a protected Claude Code ask",
    input: input(
      call("mcp__srv__a"),
      [set("baseline", { allow: [whole("mcp__srv__a")], deny: [whole("mcp__srv__a")] })],
      SETTING_ASK,
    ),
    expected: ruleDecision("deny", "mcp__srv__a"),
  },
  {
    name: "a deny guard result beats a protected Claude Code ask",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], SETTING_ASK, [denyGuard("protected path")]),
    expected: guardDecision("deny", "protected path"),
  },
  {
    name: "an ask rule asks under a protected Claude Code ask",
    input: input(
      call("mcp__srv__a"),
      [set("baseline", { allow: [whole("mcp__srv__a")], ask: [whole("mcp__srv__a")] })],
      SETTING_ASK,
    ),
    expected: ruleDecision("ask", "mcp__srv__a"),
  },
  {
    name: "a setting on a Claude Code allow does not block an allow rule",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], {
      decision: "allow",
      setting: "blockReadsOutsideWorkingDirectories",
    }),
    expected: ruleDecision("allow", "mcp__srv__a"),
  },
];

export const CORE_TABLE: Row[] = [
  ...CORE_ROWS,
  ...WHOLE_TOOL_ROWS,
  ...ORDER_ROWS,
  ...PASS_THROUGH_ROWS,
  ...UNKNOWN_DECISION_ROWS,
  ...UNUSABLE_NAME_ROWS,
  ...GUARD_ROWS,
  ...PROTECTED_ASK_ROWS,
];

export const CORE_CHAIN_ROWS: ChainRow[] = [
  {
    name: "an allow that fires",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })]),
    chain: [{ step: 3, cls: "allow", text: "Read", profile: "baseline" }],
  },
  {
    name: "two matching denies record only the first",
    input: input(call("Edit"), [
      set("baseline", { deny: [whole("Edit")] }),
      set("git-write", { deny: [whole("*")] }),
    ]),
    chain: [{ step: 3, cls: "deny", text: "Edit", profile: "baseline" }],
  },
  {
    name: "nothing matches",
    input: input(call("Unknown"), [set("baseline", { allow: [whole("Read")] })], ASK),
    chain: [],
  },
  {
    name: "a Claude Code deny",
    input: input(call("Read"), [set("baseline", { deny: [whole("Read")] })], { decision: "deny" }),
    chain: [],
  },
  {
    name: "an unknown decision under a matching allow",
    input: input(call("Read"), [set("baseline", { allow: [whole("Read")] })], {
      decision: "maybe",
    }),
    chain: [],
  },
  {
    name: "a missing tool name under a matching allow",
    input: input({ input: {} }, [set("baseline", { allow: [whole("*")] })]),
    chain: [],
  },
  {
    name: "a deny guard result before a matching deny rule",
    input: input(call("Read"), [set("baseline", { deny: [whole("Read")] })], ALLOW, [
      denyGuard("protected path"),
    ]),
    chain: [{ step: 2, cls: "deny", text: "protected path" }],
  },
  {
    name: "an ask guard result",
    input: input(call("Read"), [ALLOW_READ], ALLOW, [askGuard("check this path")]),
    chain: [{ step: 3, cls: "ask", text: "check this path" }],
  },
  {
    name: "an ask guard result on a call with no tool name",
    input: input({ input: {} }, [set("baseline")], ALLOW, [askGuard("check this path")]),
    chain: [],
  },
  {
    name: "an allow rule skipped under a protected Claude Code ask",
    input: input(call("mcp__srv__a"), [ALLOW_SRV_A], SETTING_ASK),
    chain: [
      {
        step: 3,
        cls: "allow",
        text: "mcp__srv__a",
        profile: "baseline",
        skipped: PROTECTED_SKIP,
      },
    ],
  },
  {
    name: "two allow rules in two sets skipped under a protected Claude Code ask",
    input: input(
      call("mcp__srv__a"),
      [ALLOW_SRV_A, set("git-write", { allow: [whole("mcp__srv")] })],
      SETTING_ASK,
    ),
    chain: [
      {
        step: 3,
        cls: "allow",
        text: "mcp__srv__a",
        profile: "baseline",
        skipped: PROTECTED_SKIP,
      },
      { step: 3, cls: "allow", text: "mcp__srv", profile: "git-write", skipped: PROTECTED_SKIP },
    ],
  },
];
