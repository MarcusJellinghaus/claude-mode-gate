import type { Profile, Rule, RuleSet } from "./policy";

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

type Severity = "error" | "warning";
type Source = "baseline" | "builtin" | "user" | "project" | "env";
interface Issue {
  severity: Severity;
  source: Source;
  path: string;
  message: string;
}
type IssueSink = (severity: Severity, path: string, message: string) => void;
type RuleLists = Pick<RuleSet, "allow" | "ask" | "deny">;

interface CheckedFile {
  issues: Issue[];
  logDir?: string;
  baseline?: RuleSet;
  profiles: Record<string, Profile>;
}

const TOP_LEVEL_KEYS = ["$schema", "logDir", "baseline", "profiles"] as const;
const BASELINE_KEYS = ["allow", "ask", "deny"] as const;
const PROFILE_KEYS = ["description", "delegable", "allow", "ask", "deny"] as const;

const PROFILE_NAME = /^[a-z][a-z0-9-]*$/;
// `all` is the /gate-off keyword, `baseline` its own top-level key, the rest guard the prototype chain.
const RESERVED_NAMES: readonly string[] = ["all", "baseline", "constructor", "prototype"];
// Paths that are neither absolute nor relative to the working folder: `C:logs`, `\logs`, `~/logs`.
const AMBIGUOUS_PATHS = [/^[A-Za-z]:(?![\\/])/, /^\\(?!\\)/, /^~/];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidProfileName(name: string): boolean {
  return PROFILE_NAME.test(name) && !RESERVED_NAMES.includes(name);
}

function checkKeys(
  raw: Record<string, unknown>,
  prefix: string,
  keys: readonly string[],
  issue: IssueSink,
): boolean {
  const unknown = Object.keys(raw).filter((key) => !keys.includes(key));
  for (const key of unknown)
    issue("error", prefix === "" ? key : `${prefix}.${key}`, "unknown key");
  return unknown.length === 0;
}

function checkList(raw: unknown, path: string, issue: IssueSink): Rule[] | undefined {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issue("error", path, "expected an array of strings");
    return undefined;
  }
  const rules: Rule[] = [];
  raw.forEach((entry: unknown, i) => {
    if (typeof entry !== "string") {
      issue("error", `${path}[${String(i)}]`, "expected a string");
      return;
    }
    const parsed = parseRule(entry);
    if (parsed.ok) rules.push(parsed.rule);
    else issue("error", `${path}[${String(i)}]`, parsed.message);
  });
  return rules.length === raw.length ? rules : undefined;
}

function checkRuleLists(
  raw: unknown,
  prefix: string,
  keys: readonly string[],
  issue: IssueSink,
): RuleLists | undefined {
  if (!isPlainObject(raw)) {
    issue("error", prefix, "expected an object");
    return undefined;
  }
  const keysOk = checkKeys(raw, prefix, keys, issue);
  const { allow: rawAllow, ask: rawAsk, deny: rawDeny } = raw;
  const allow = checkList(rawAllow, `${prefix}.allow`, issue);
  const ask = checkList(rawAsk, `${prefix}.ask`, issue);
  const deny = checkList(rawDeny, `${prefix}.deny`, issue);
  if (!keysOk || !allow || !ask || !deny) return undefined;
  return { allow, ask, deny };
}

function checkLogDir(raw: unknown, issue: IssueSink): string | undefined {
  if (typeof raw !== "string" || raw === "") {
    issue("error", "logDir", "expected a non-empty string");
    return undefined;
  }
  if (AMBIGUOUS_PATHS.some((pattern) => pattern.test(raw))) {
    issue("error", "logDir", "expected an absolute path or a path relative to the working folder");
    return undefined;
  }
  return raw;
}

function checkProfile(raw: unknown, name: string, issue: IssueSink): Profile | undefined {
  const prefix = `profiles.${name}`;
  if (!isValidProfileName(name)) {
    issue(
      "error",
      prefix,
      `Profile name "${name}" must be lowercase letters, digits and hyphens, start with a letter, and not be reserved.`,
    );
    return undefined;
  }
  const lists = checkRuleLists(raw, prefix, PROFILE_KEYS, issue);
  if (!isPlainObject(raw)) return undefined;
  const { description, delegable = true } = raw;
  const descriptionOk = typeof description === "string" && description !== "";
  if (!descriptionOk) issue("error", `${prefix}.description`, "expected a non-empty string");
  const delegableOk = typeof delegable === "boolean";
  if (!delegableOk) issue("error", `${prefix}.delegable`, "expected a boolean");
  if (!lists || !descriptionOk || !delegableOk) return undefined;
  return { name, description, delegable, ...lists };
}

function checkProfiles(raw: unknown, issue: IssueSink): Record<string, Profile> {
  if (!isPlainObject(raw)) {
    issue("error", "profiles", "expected an object");
    return {};
  }
  // Names are checked before the insert, and fromEntries defines own keys, so no input reaches the prototype.
  const entries = Object.entries(raw).flatMap(([name, value]) => {
    const profile = checkProfile(value, name, issue);
    return profile ? [[name, profile] as const] : [];
  });
  return Object.fromEntries(entries);
}

function checkFile(input: unknown, source: Source): CheckedFile {
  const issues: Issue[] = [];
  const issue: IssueSink = (severity, path, message) => {
    issues.push({ severity, source, path, message });
  };
  if (!isPlainObject(input)) {
    issue("error", "", "expected a JSON object");
    return { issues, profiles: {} };
  }
  checkKeys(input, "", TOP_LEVEL_KEYS, issue);
  const { logDir, baseline, profiles } = input;
  const result: CheckedFile = { issues, profiles: {} };
  if (logDir !== undefined) {
    const checked = checkLogDir(logDir, issue);
    if (checked !== undefined) result.logDir = checked;
  }
  if (baseline !== undefined) {
    const lists = checkRuleLists(baseline, "baseline", BASELINE_KEYS, issue);
    if (lists) result.baseline = { name: "baseline", ...lists };
  }
  if (profiles !== undefined) result.profiles = checkProfiles(profiles, issue);
  return result;
}

export function validateConfig(input: unknown, source: Source): Issue[] {
  return checkFile(input, source).issues;
}
