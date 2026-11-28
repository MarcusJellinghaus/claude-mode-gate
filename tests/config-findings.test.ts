import { describe, expect, it } from "vitest";
import { covers, parseRule, validateConfig } from "../hooks/config";
import type { Rule } from "../hooks/policy";

type List = "allow" | "ask" | "deny";
interface Finding {
  severity: "error" | "warning";
  path: string;
  message: unknown;
}

const inProfile = (list: List, rules: string[]): unknown => ({
  profiles: { p: { description: "d", [list]: rules } },
});
const inBaseline = (list: List, rules: string[]): unknown => ({ baseline: { [list]: rules } });
const findings = (input: unknown): Finding[] =>
  validateConfig(input, "user").map(({ severity, path, message }) => ({ severity, path, message }));

const overBroad = (severity: Finding["severity"], path: string): Finding => ({
  severity,
  path,
  message: expect.stringContaining("Over-broad allow") as unknown,
});
const unknownTool = (path: string, message: string): Finding => ({
  severity: "warning",
  path,
  message,
});

const ROWS: [string, unknown, Finding[]][] = [
  ["allow Bash", inProfile("allow", ["Bash"]), [overBroad("error", "profiles.p.allow[0]")]],
  ["allow Bash(*)", inProfile("allow", ["Bash(*)"]), [overBroad("error", "profiles.p.allow[0]")]],
  ["allow *", inProfile("allow", ["*"]), [overBroad("error", "profiles.p.allow[0]")]],
  [
    "allow a bare server",
    inProfile("allow", ["mcp__s"]),
    [overBroad("warning", "profiles.p.allow[0]")],
  ],
  [
    "allow a bare hyphenated server",
    inProfile("allow", ["Read", "mcp__mcp-workspace"]),
    [overBroad("warning", "profiles.p.allow[1]")],
  ],
  ["deny *", inProfile("deny", ["*"]), []],
  ["deny Bash", inProfile("deny", ["Bash"]), []],
  ["ask Bash(*)", inProfile("ask", ["Bash(*)"]), []],
  ["ask a bare server", inProfile("ask", ["mcp__s"]), []],
  ["allow an MCP tool", inProfile("allow", ["mcp__mcp-workspace__git"]), []],
  ["allow a Bash prefix", inProfile("allow", ["Bash(git *)"]), []],
  ["allow an exact Bash command", inProfile("allow", ["Bash(git status)"]), []],
  [
    "a misspelt tool",
    inProfile("allow", ["Bassh"]),
    [unknownTool("profiles.p.allow[0]", "unknown tool `Bassh`; did you mean `Bash`?")],
  ],
  [
    "a tool two edits away",
    inProfile("ask", ["Bxxh"]),
    [unknownTool("profiles.p.ask[0]", "unknown tool `Bxxh`; did you mean `Bash`?")],
  ],
  [
    "a tool one deletion away",
    inProfile("ask", ["Rad"]),
    [unknownTool("profiles.p.ask[0]", "unknown tool `Rad`; did you mean `Read`?")],
  ],
  [
    "a tool one insertion away",
    inProfile("ask", ["Wriite"]),
    [unknownTool("profiles.p.ask[0]", "unknown tool `Wriite`; did you mean `Write`?")],
  ],
  [
    "a tool three edits away",
    inProfile("ask", ["Bxxxh"]),
    [unknownTool("profiles.p.ask[0]", "unknown tool `Bxxxh`")],
  ],
  [
    "Task",
    inProfile("deny", ["Task"]),
    [unknownTool("profiles.p.deny[0]", "unknown tool `Task`; use `Agent`")],
  ],
  [
    "an unrelated name",
    inProfile("ask", ["Xyzzyplugh"]),
    [unknownTool("profiles.p.ask[0]", "unknown tool `Xyzzyplugh`")],
  ],
  ["an unknown MCP tool", inProfile("deny", ["mcp__unknown__tool"]), []],
  ["an unknown bare server in deny", inProfile("deny", ["mcp__unknown"]), []],
  [
    "an unknown bare server in allow",
    inProfile("allow", ["mcp__unknown"]),
    [overBroad("warning", "profiles.p.allow[0]")],
  ],
  [
    "baseline allow Bash(*)",
    inBaseline("allow", ["Bash(*)"]),
    [overBroad("error", "baseline.allow[0]")],
  ],
  [
    "baseline allow a bare server",
    inBaseline("allow", ["mcp__s"]),
    [overBroad("warning", "baseline.allow[0]")],
  ],
  [
    "baseline deny a misspelt tool",
    inBaseline("deny", ["Wirte"]),
    [unknownTool("baseline.deny[0]", "unknown tool `Wirte`; did you mean `Write`?")],
  ],
];

const KNOWN = [
  "Agent",
  "Bash",
  "Edit",
  "Read",
  "Write",
  "Yield",
  "LSP",
  "memory_read",
  "request_computer",
  "enable__mcp__claude-in-chrome",
  "enable__mcp__remote-devices__computer",
];

describe("per-rule findings", () => {
  it.each(ROWS)("%s", (_, input, expected) => {
    expect(findings(input)).toStrictEqual(expected);
  });

  it.each(KNOWN)("knows the tool %s", (tool) => {
    expect(findings(inProfile("deny", [tool]))).toStrictEqual([]);
  });

  it("tags a user baseline finding with the user source", () => {
    const [issue] = validateConfig(inBaseline("allow", ["Bash(*)"]), "user");
    expect(issue).toMatchObject({ severity: "error", source: "user", path: "baseline.allow[0]" });
  });

  it("gives a config with only warnings no error", () => {
    const input = inProfile("allow", ["mcp__s", "Bassh", "Read"]);
    const severities = validateConfig(input, "user").map((i) => i.severity);
    expect(severities).toStrictEqual(["warning", "warning"]);
  });
});

const rule = (raw: string): Rule => {
  const parsed = parseRule(raw);
  if (!parsed.ok) throw new Error(`test rule "${raw}" does not parse`);
  return parsed.rule;
};

const COVERS: [string, string, boolean][] = [
  ["Bash(git push *)", "Bash(git push origin)", true],
  ["Bash(git push *)", "Bash(git push)", true],
  ["Bash(git push)", "Bash(git push origin)", true],
  ["Bash(git push)", "Bash(git pu)", false],
  ["*", "Edit", true],
  ["*", "Bash(x)", true],
  ["*", "mcp__s__t", true],
  ["Bash", "Bash(git status)", true],
  ["Edit", "Write", false],
  ["mcp__s", "mcp__s__t", true],
  ["mcp__s", "mcp__other__t", false],
  ["Foo", "Foo__bar", false],
  ["Bash(git push *)", "Edit", false],
];

type Lists = Partial<Record<List, string[]>>;
const profileWith = (lists: Lists): unknown => ({
  profiles: { p: { description: "d", ...lists } },
});
const finding = (severity: Finding["severity"], path: string, message: string): Finding => ({
  severity,
  path,
  message,
});

const SET_ROWS: [string, unknown, Finding[]][] = [
  [
    "a pattern twice in allow",
    profileWith({ allow: ["Read", "Read"] }),
    [finding("warning", "profiles.p.allow[1]", "duplicate of allow[0]")],
  ],
  [
    "a pattern twice in deny",
    profileWith({ deny: ["Edit", "Edit"] }),
    [finding("warning", "profiles.p.deny[1]", "duplicate of deny[0]")],
  ],
  [
    "the same pattern in allow and deny",
    profileWith({ allow: ["Bash(git push:*)"], deny: ["Bash(git push *)"] }),
    [finding("error", "profiles.p.deny[0]", "duplicate of allow[0]")],
  ],
  [
    "the same pattern in ask and deny",
    profileWith({ ask: ["Edit"], deny: ["Edit"] }),
    [finding("error", "profiles.p.deny[0]", "duplicate of ask[0]")],
  ],
  [
    "an allow covered by a deny",
    profileWith({ allow: ["Bash(git push)"], deny: ["Bash(git push *)"] }),
    [finding("warning", "profiles.p.allow[0]", "covered by deny[0]")],
  ],
  [
    "an allow covered by an ask",
    profileWith({ allow: ["Bash(git status)"], ask: ["Bash"] }),
    [finding("warning", "profiles.p.allow[0]", "covered by ask[0]")],
  ],
  [
    "an allow no ask or deny covers",
    profileWith({ allow: ["Bash(git status)"], deny: ["Bash(git push *)"] }),
    [],
  ],
  [
    "baseline: the same pattern in allow and deny",
    { baseline: { allow: ["Bash(git push:*)"], deny: ["Bash(git push *)"] } },
    [finding("error", "baseline.deny[0]", "duplicate of allow[0]")],
  ],
  [
    "baseline: an allow covered by a deny",
    { baseline: { allow: ["Bash(git push)"], deny: ["Bash(git push *)"] } },
    [finding("warning", "baseline.allow[0]", "covered by deny[0]")],
  ],
  [
    "a deny in one profile against an allow in another",
    {
      profiles: {
        a: { description: "d", allow: ["Bash(git push)"] },
        b: { description: "d", deny: ["Bash(git push *)"] },
      },
    },
    [],
  ],
];

describe("per-set findings", () => {
  it.each(COVERS)("deny %s covers %s: %s", (p, q, expected) => {
    expect(covers(rule(p), rule(q))).toBe(expected);
  });

  it.each(SET_ROWS)("%s", (_, input, expected) => {
    expect(findings(input)).toStrictEqual(expected);
  });
});
