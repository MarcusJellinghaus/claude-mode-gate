// Step 4: strict Bash allow, boundary-checked deny and ask, the downgrade, malformed Bash.
import type { ChainEntry, ClaudeVerdict, Decision, GuardResult, Rule } from "../../../hooks/policy";
import type { ChainRow, Lists, Row } from "./builders";
import {
  ALLOW,
  ASK,
  CLAUDE_DENY,
  CLAUDE_DENY_DECISION,
  DOWNGRADE,
  MALFORMED,
  METACHARACTER_SKIP,
  NO_MATCH,
  PROTECTED_DECISION,
  PROTECTED_FIELDS,
  askGuard,
  bash,
  call,
  denyGuard,
  exact,
  guardDecision,
  input,
  prefix,
  protectedAsk,
  ruleDecision,
  set,
  whole,
} from "./builders";

// JSON.stringify shows tab, CR and newline as escapes; NBSP needs its own.
const show = (command: string): string => JSON.stringify(command).replaceAll(" ", "\\u00A0");

const bashRow = (
  verb: string,
  lists: Lists,
  command: string,
  expected: Decision,
  claude: ClaudeVerdict = ALLOW,
): Row => ({
  name: `${verb} ${show(command)}`,
  input: input(bash(command), [set("baseline", lists)], claude),
  expected,
});

const allowBash = (rule: Rule, command: string, allowed: boolean): Row =>
  bashRow(
    `allow ${rule.raw} ${allowed ? "allows" : "downgrades"}`,
    { allow: [rule] },
    command,
    allowed ? ruleDecision("allow", rule.raw) : DOWNGRADE,
  );

const denyBash = (rule: Rule, command: string, fires: boolean): Row =>
  bashRow(
    `deny ${rule.raw} ${fires ? "fires on" : "does not fire on"}`,
    { deny: [rule] },
    command,
    fires ? ruleDecision("deny", rule.raw) : DOWNGRADE,
  );

const askBash = (rule: Rule, command: string): Row =>
  bashRow(`ask ${rule.raw} asks for`, { ask: [rule] }, command, ruleDecision("ask", rule.raw));

const CHECK = exact("npm run check");
const ECHO = prefix("echo ");
const GH_EDIT = prefix("gh issue edit ");
const GIT_COMMIT = prefix("git commit ");
const GIT_STATUS = prefix("git status ");
const GIT_PUSH = prefix("git push ");
const RM_ROOT = exact("rm -rf /");

const ALLOW_ROWS: Row[] = [
  allowBash(CHECK, "npm run check", true),
  allowBash(CHECK, "npm run check && rm -rf .", false),
  ...[
    "echo a&b",
    "echo a;b",
    "echo a|b",
    "echo a$b",
    "echo a(b",
    "echo a)b",
    "echo a`b",
    "echo a<b",
    "echo a>b",
    "echo a\nb",
    "echo a && b",
    "echo $(id)",
  ].map((command) => allowBash(ECHO, command, false)),
  allowBash(ECHO, "echo a\\b", true),
  allowBash(ECHO, "echo a\rb", true),
  allowBash(GH_EDIT, "gh issue edit 1 && rm -rf .", false),
  allowBash(GIT_COMMIT, " git commit -m x", false),
  allowBash(GIT_COMMIT, "git  commit -m x", false),
  allowBash(GIT_COMMIT, "git\tcommit -m x", false),
  allowBash(GIT_COMMIT, "git commit -m x", true),
  allowBash(GH_EDIT, "gh issue edit 1", true),
  allowBash(GH_EDIT, "gh issue editor 1", false),
  allowBash(GH_EDIT, "gh issue edit", false),
  allowBash(prefix("git status ", "Bash(git status:*)"), "git status -s", true),
  allowBash(prefix("git status ", "Bash(git status:*)"), "git statusx", false),
  allowBash(GIT_STATUS, "x; git status", false),
  allowBash(CHECK, "x; npm run check", false),
  allowBash(GIT_STATUS, "echo git status -s", false),
  allowBash(CHECK, "x npm run check", false),
  allowBash(GIT_STATUS, "git status -s", false),
  allowBash(whole("Bash"), "a && b", true),
  allowBash(whole("*"), "a && b", true),
  allowBash(prefix(""), "a && b", false),
  allowBash(whole("mcp__srv"), "ls", false),
  ...["npm install", "npm ci"].map((command) =>
    bashRow(
      "an unmatched Bash call under a Claude Code allow downgrades",
      { allow: [CHECK] },
      command,
      DOWNGRADE,
      { decision: "allow", reason: "allowed by settings", rule: `Bash(${command})` },
    ),
  ),
  bashRow(
    "an unmatched Bash call under a Claude Code ask asks",
    { allow: [CHECK] },
    "npm install",
    NO_MATCH,
    ASK,
  ),
  bashRow(
    "an allow rule overrides a plain Claude Code ask for",
    { allow: [CHECK] },
    "npm run check",
    ruleDecision("allow", CHECK.raw),
    ASK,
  ),
  ...PROTECTED_FIELDS.map(([field, value]) =>
    bashRow(
      `an allow rule does not override a Claude Code ask carrying ${field} for`,
      { allow: [CHECK] },
      "npm run check",
      PROTECTED_DECISION,
      protectedAsk(field, value),
    ),
  ),
  bashRow(
    "a deny rule beats a protected Claude Code ask for",
    { allow: [CHECK], deny: [prefix("npm run ")] },
    "npm run check",
    ruleDecision("deny", "Bash(npm run *)"),
    protectedAsk("setting", "blockReadsOutsideWorkingDirectories"),
  ),
];

const DENY_ROWS: Row[] = [
  ...[
    "git push",
    "git push\torigin",
    "git push origin main",
    "x; git push",
    "x && git push origin",
    "x; git push\torigin",
    "x;git push",
    "git push;",
    "git push&&y",
    "git push\nls",
    "xgit push; git push",
  ].map((command) => denyBash(GIT_PUSH, command, true)),
  ...["git pushd", "x; git pushd", "x; git pusher"].map((command) =>
    denyBash(GIT_PUSH, command, false),
  ),
  ...["x; git push", "x && git push origin", "x; git push\torigin"].map((command) =>
    askBash(GIT_PUSH, command),
  ),
  askBash(whole("Bash"), "x; git push"),
  askBash(whole("*"), "x; git push"),
  ...["rm -rf /", "rm -rf / b", "a; rm -rf /", "a && rm -rf / b"].map((command) =>
    denyBash(RM_ROOT, command, true),
  ),
  ...["rm -rf /tmp", "a; rm -rf /tmp", "a; xrm -rf /"].map((command) =>
    denyBash(RM_ROOT, command, false),
  ),
  askBash(RM_ROOT, "a; rm -rf /"),
  denyBash(prefix("git push ", "Bash(git push:*)"), "git push", true),
  denyBash(prefix("git push ", "Bash(git push:*)"), "x; git push origin", true),
  denyBash(prefix("git push ", "Bash(git push:*)"), "git pushd", false),
  denyBash(prefix("npm run check ", "Bash(npm run check:*)"), "npm run check", true),
  denyBash(prefix("npm run check ", "Bash(npm run check:*)"), "x; npm run check -x", true),
  denyBash(prefix("npm run check ", "Bash(npm run check:*)"), "x; npm run check:docs", false),
  denyBash(exact("npm run check:docs"), "a; npm run check:docs", true),
  denyBash(exact("npm run check:docs"), "npm run check", false),
  ...["x\rgit push", "x git push", "git push origin", "x\tgit push"].map((command) =>
    denyBash(GIT_PUSH, command, true),
  ),
  denyBash(prefix("grep a.b "), "grep a.b f", true),
  denyBash(prefix("grep a.b "), "grep aXb f", false),
  denyBash(prefix("echo (x) "), "echo (x) y", true),
  denyBash(prefix("echo a+b "), "echo a+b x", true),
  denyBash(prefix("echo a+b "), "echo aab x", false),
  denyBash(prefix("echo [a] "), "echo [a] x", true),
  denyBash(prefix("echo [a] "), "echo a x", false),
  denyBash(prefix("echo ^a$ "), "echo ^a$ x", true),
  ...["x; git push", "git status", "ls"].flatMap((command) => [
    denyBash(prefix(""), command, true),
    askBash(prefix(""), command),
  ]),
];

// Known bypasses of the deny side: each must degrade to an ask, never allow.
const BYPASS_ROWS: Row[] = [
  ...[
    'bash -c "git push"',
    "sh -c 'git push'",
    "/usr/bin/git push",
    "\\git push",
    "git  push",
    "git -C . push",
  ].map((command) => denyBash(GIT_PUSH, command, false)),
  denyBash(RM_ROOT, "rm -rf /*", false),
];

const MAYBE: ClaudeVerdict = { decision: "maybe" };

const MIXED_ROWS: Row[] = [
  bashRow(
    "two matching Bash deny rules in one list report the first for",
    { deny: [prefix("git "), exact("git push")] },
    "git push",
    ruleDecision("deny", "Bash(git *)"),
  ),
  bashRow(
    "a Claude Code deny stays a Claude Code deny under a matching allow for",
    { allow: [CHECK] },
    "npm run check",
    CLAUDE_DENY_DECISION,
    CLAUDE_DENY,
  ),
  bashRow(
    "an unknown decision still denies under an exact deny for",
    { deny: [RM_ROOT] },
    "rm -rf /",
    ruleDecision("deny", RM_ROOT.raw),
    MAYBE,
  ),
  bashRow(
    "an unknown decision still denies under a prefix deny for",
    { deny: [GIT_PUSH] },
    "git push",
    ruleDecision("deny", GIT_PUSH.raw),
    MAYBE,
  ),
  bashRow(
    "an unknown decision asks as malformed under a matching allow for",
    { allow: [CHECK] },
    "npm run check",
    MALFORMED,
    MAYBE,
  ),
  ...[RM_ROOT, GIT_PUSH].map((rule): Row => ({
    name: `deny ${rule.raw} does not touch Read`,
    input: input(call("Read", { file_path: "x" }), [set("baseline", { deny: [rule] })], ASK),
    expected: NO_MATCH,
  })),
  {
    name: "a Bash call skipped for a metacharacter is allowed by a whole-tool rule in a later set",
    input: input(bash("gh issue edit 1 && rm -rf ."), [
      set("baseline", { allow: [GH_EDIT] }),
      set("git-write", { allow: [whole("Bash")] }),
    ]),
    expected: ruleDecision("allow", "Bash", "git-write"),
  },
];

const MALFORMED_INPUTS: [string, unknown][] = [
  ["{}", {}],
  ["{ command: 42 }", { command: 42 }],
  ["null", null],
  ['"ls"', "ls"],
];

const MALFORMED_BASH_ROWS: Row[] = MALFORMED_INPUTS.flatMap(([label, toolInput]): Row[] => {
  const row = (
    rules: string,
    lists: Lists,
    expected: Decision,
    guards: GuardResult[] = [],
    claude: ClaudeVerdict = ALLOW,
  ): Row => ({
    name: `a Bash call with input ${label} under ${rules}`,
    input: input(call("Bash", toolInput), [set("baseline", lists)], claude, guards),
    expected,
  });
  return [
    row("allow Bash asks as malformed", { allow: [whole("Bash")] }, MALFORMED),
    row("allow * asks as malformed", { allow: [whole("*")] }, MALFORMED),
    row("deny * is denied", { deny: [whole("*")] }, ruleDecision("deny", "*")),
    row("deny Bash is denied", { deny: [whole("Bash")] }, ruleDecision("deny", "Bash")),
    row("a deny guard result is denied", {}, guardDecision("deny", "protected path"), [
      denyGuard("protected path"),
    ]),
    row("ask Bash asks as malformed", { ask: [whole("Bash")] }, MALFORMED),
    row("an ask guard result asks as malformed", {}, MALFORMED, [askGuard("check this path")]),
    row("deny Bash(*) asks as malformed", { deny: [prefix("")] }, MALFORMED),
    row(
      "a Claude Code deny is the Claude Code deny",
      { allow: [whole("Bash")] },
      CLAUDE_DENY_DECISION,
      [],
      CLAUDE_DENY,
    ),
  ];
});

export const BASH_TABLE: Row[] = [
  ...ALLOW_ROWS,
  ...DENY_ROWS,
  ...BYPASS_ROWS,
  ...MIXED_ROWS,
  ...MALFORMED_BASH_ROWS,
];

const metaSkip = (text: string): ChainEntry => ({
  step: 3,
  cls: "allow",
  text,
  profile: "baseline",
  skipped: METACHARACTER_SKIP,
});

export const BASH_CHAIN_ROWS: ChainRow[] = [
  {
    name: "an allow prefix skipped for a metacharacter",
    input: input(bash("gh issue edit 1 && rm -rf ."), [set("baseline", { allow: [GH_EDIT] })]),
    chain: [metaSkip("Bash(gh issue edit *)")],
  },
  {
    name: "a skipped allow prefix, then a whole-tool allow in a later set",
    input: input(bash("gh issue edit 1 && rm -rf ."), [
      set("baseline", { allow: [GH_EDIT] }),
      set("git-write", { allow: [whole("Bash")] }),
    ]),
    chain: [
      metaSkip("Bash(gh issue edit *)"),
      { step: 3, cls: "allow", text: "Bash", profile: "git-write" },
    ],
  },
  {
    name: "a metacharacter skip under a protected Claude Code ask shows the metacharacter",
    input: input(
      bash("gh issue edit 1 && x"),
      [set("baseline", { allow: [GH_EDIT] })],
      protectedAsk("hook", "pre-tool-hook"),
    ),
    chain: [metaSkip("Bash(gh issue edit *)")],
  },
  {
    name: "an unknown decision with a metacharacter",
    input: input(bash("gh issue edit 1 && x"), [set("baseline", { allow: [GH_EDIT] })], MAYBE),
    chain: [],
  },
  {
    name: "a Bash call without a command under allow Bash",
    input: input(call("Bash", {}), [set("baseline", { allow: [whole("Bash")] })]),
    chain: [],
  },
];
