import { describe, expect, it } from "vitest";
import { ARG_ON_NON_BASH, ARG_WHITESPACE, STAR_POSITION, parseRule } from "../hooks/config";
import type { Rule } from "../hooks/policy";

const whole = (tool: string): Rule => ({ tool, kind: "whole", raw: tool });
const bash = (kind: "exact" | "prefix", arg: string, raw: string): Rule => ({
  tool: "Bash",
  kind,
  arg,
  raw,
});

const VALID: [string, Rule][] = [
  ["Edit", whole("Edit")],
  ["*", whole("*")],
  ["Bash", whole("Bash")],
  ["mcp__s", whole("mcp__s")],
  ["mcp__s__t", whole("mcp__s__t")],
  ["mcp__a_b__c_d", whole("mcp__a_b__c_d")],
  ["mcp__mcp-workspace__read_file", whole("mcp__mcp-workspace__read_file")],
  // The tool segment is everything after the server, so it may hold "__" and edge underscores.
  ["mcp__s__t__u", whole("mcp__s__t__u")],
  ["mcp__s___t", whole("mcp__s___t")],
  ["mcp__s__t_", whole("mcp__s__t_")],
  ["mcp__s__t-u", whole("mcp__s__t-u")],
  ["Bash(npm run check)", bash("exact", "npm run check", "Bash(npm run check)")],
  ["Bash(npm run check:docs)", bash("exact", "npm run check:docs", "Bash(npm run check:docs)")],
  ["Bash(git commit *)", bash("prefix", "git commit ", "Bash(git commit *)")],
  ["Bash(git commit:*)", bash("prefix", "git commit ", "Bash(git commit:*)")],
  ["Bash(git push:origin *)", bash("prefix", "git push:origin ", "Bash(git push:origin *)")],
  ["Bash(echo (x) *)", bash("prefix", "echo (x) ", "Bash(echo (x) *)")],
  ["Bash(npm run test -- *)", bash("prefix", "npm run test -- ", "Bash(npm run test -- *)")],
  ["Bash(*)", bash("prefix", "", "Bash(*)")],
];

// Tool-name and syntax errors: a plain message that quotes the rule.
const PLAIN_ERRORS = [
  "mcp__",
  "mcp__s__",
  "mcp__s__t u",
  "mcp___s",
  "mcp__s_",
  " Bash",
  "Bash ",
  "",
  "Ba sh",
  "(x)",
  "Bash(git push",
];

const CLASS_ERRORS: [string, string][] = [
  ["Skill(x)", ARG_ON_NON_BASH],
  ["WebFetch(domain:*)", ARG_ON_NON_BASH],
  ["Edit(src/**)", ARG_ON_NON_BASH],
  ["Read(./.env)", ARG_ON_NON_BASH],
  ["Write(*)", ARG_ON_NON_BASH],
  ["mcp__s__t(x)", ARG_ON_NON_BASH],
  ["Bash(git * push)", STAR_POSITION],
  ["Bash(* push)", STAR_POSITION],
  ["Bash(git **)", STAR_POSITION],
  ["Bash(git push * --force)", STAR_POSITION],
  ["Bash(git*)", STAR_POSITION],
  ["Bash(npm run check*)", STAR_POSITION],
  ["Bash(git *:*)", STAR_POSITION],
  ["Bash( git push *)", ARG_WHITESPACE],
  ["Bash()", ARG_WHITESPACE],
  ["Bash(  )", ARG_WHITESPACE],
  ["Bash( *)", ARG_WHITESPACE],
  ["Bash(:*)", ARG_WHITESPACE],
  ["Bash(git push :*)", ARG_WHITESPACE],
  ["Bash( git push:*)", ARG_WHITESPACE],
  ["Bash(git status )", ARG_WHITESPACE],
  ["Bash( git status)", ARG_WHITESPACE],
  // Edge whitespace is JavaScript \s, so a leading non-breaking space is an error too.
  ["Bash( git push *)", ARG_WHITESPACE],
];

const CLASSES = [ARG_ON_NON_BASH, STAR_POSITION, ARG_WHITESPACE];

const messageOf = (raw: string): string => {
  const parsed = parseRule(raw);
  if (parsed.ok) throw new Error(`expected "${raw}" to fail`);
  return parsed.message;
};

describe("parseRule", () => {
  it.each(VALID)("parses %j", (raw, rule) => {
    expect(parseRule(raw)).toStrictEqual({ ok: true, rule });
  });

  it.each(PLAIN_ERRORS)("rejects %j with a message that quotes the rule", (raw) => {
    const message = messageOf(raw);
    expect(message).toContain(`"${raw}"`);
    expect(CLASSES).not.toContain(message);
  });

  it.each(CLASS_ERRORS)("rejects %j with its message class", (raw, message) => {
    expect(messageOf(raw)).toBe(message);
  });

  it("uses three distinct message classes", () => {
    expect(new Set(CLASSES).size).toBe(3);
  });

  it("names no draft number in any message", () => {
    const messages = [...PLAIN_ERRORS, ...CLASS_ERRORS.map(([raw]) => raw)].map(messageOf);
    for (const message of messages) expect(message).not.toMatch(/draft/i);
  });
});
