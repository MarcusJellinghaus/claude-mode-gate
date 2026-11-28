import type { Rule } from "./policy";

export const ARG_ON_NON_BASH =
  "Only Bash rules may take an argument. Use the path guards (protected paths) for path-based protection.";
export const STAR_POSITION =
  'Only a trailing " *" or ":*" is supported, a subset of Claude Code\'s rule syntax.';
export const ARG_WHITESPACE =
  'The argument must not be empty or have whitespace at its edges. Only a trailing " *" or ":*" is supported.';

type ParsedRule = { ok: true; rule: Rule } | { ok: false; message: string };

const EDGE_SPACE = /^\s|\s$/;
const LEADING_SPACE = /^\s/;
const NAME_CHARS = /^[A-Za-z0-9_-]+$/;
const MCP_PREFIX = "mcp__";

const fail = (message: string): ParsedRule => ({ ok: false, message });

// A server or tool segment: runs of [A-Za-z0-9-] joined by single underscores.
function isMcpSegment(segment: string): boolean {
  return (
    NAME_CHARS.test(segment) &&
    !segment.startsWith("_") &&
    !segment.endsWith("_") &&
    !segment.includes("__")
  );
}

function isToolName(name: string): boolean {
  if (name === "*") return true;
  if (!name.startsWith(MCP_PREFIX)) return NAME_CHARS.test(name);
  const segments = name.slice(MCP_PREFIX.length).split("__");
  return segments.length <= 2 && segments.every(isMcpSegment);
}

function bashRule(kind: "exact" | "prefix", arg: string, raw: string): ParsedRule {
  if (arg.includes("*")) return fail(STAR_POSITION);
  return { ok: true, rule: { tool: "Bash", kind, arg, raw } };
}

function parseBashArg(arg: string, raw: string): ParsedRule {
  if (arg.endsWith(":*")) {
    const body = arg.slice(0, -2);
    if (body === "" || EDGE_SPACE.test(body)) return fail(ARG_WHITESPACE);
    return bashRule("prefix", `${body} `, raw);
  }
  if (arg.endsWith("*")) {
    const body = arg.slice(0, -1);
    if (LEADING_SPACE.test(body)) return fail(ARG_WHITESPACE);
    if (body !== "" && !body.endsWith(" ")) return fail(STAR_POSITION);
    return bashRule("prefix", body, raw);
  }
  if (arg === "" || EDGE_SPACE.test(arg)) return fail(ARG_WHITESPACE);
  return bashRule("exact", arg, raw);
}

export function parseRule(raw: string): ParsedRule {
  if (EDGE_SPACE.test(raw)) return fail(`Rule "${raw}" has whitespace at its start or end.`);
  const open = raw.indexOf("(");
  const tool = open === -1 ? raw : raw.slice(0, open);
  if (open !== -1 && !raw.endsWith(")")) return fail(`Rule "${raw}" has no closing ")".`);
  if (!isToolName(tool)) return fail(`Rule "${raw}" does not name a valid tool.`);
  if (open === -1) return { ok: true, rule: { tool, kind: "whole", raw } };
  if (tool !== "Bash") return fail(ARG_ON_NON_BASH);
  return parseBashArg(raw.slice(open + 1, -1), raw);
}
