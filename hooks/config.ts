import { baseline as defaultBaseline } from "./baseline";
import { builtinProfiles } from "./builtin-profiles";
import { decide } from "./policy";
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
type ListName = "allow" | "ask" | "deny";
type RuleLists = Pick<RuleSet, ListName>;

interface CheckedFile {
  issues: Issue[];
  logDir?: string;
  baseline?: RuleSet;
  profiles: Record<string, Profile>;
}

export const TOP_LEVEL_KEYS = ["$schema", "logDir", "baseline", "profiles"] as const;
export const BASELINE_KEYS = ["allow", "ask", "deny"] as const;
export const PROFILE_KEYS = ["description", "delegable", "allow", "ask", "deny"] as const;

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

// Copied by hand from the keys of BuiltinToolInputs in .claude-plugin/types/claude-code-tools/index.d.ts,
// written by Claude Code 2.1.326. config.ts may not import engine types, so the list is a copy.
const KNOWN_TOOLS: readonly string[] = [
  "Agent",
  "AppifactRepl",
  "Artifact",
  "ArtifactCheck",
  "ArtifactComments",
  "ArtifactData",
  "AskUserQuestion",
  "Bash",
  "ClaudeDesign",
  "CronCreate",
  "CronDelete",
  "CronList",
  "DesignSync",
  "Edit",
  "enable__mcp__claude-in-chrome",
  "enable__mcp__remote-devices__Claude_Browser",
  "enable__mcp__remote-devices__computer",
  "EndConversation",
  "EnterPlanMode",
  "EnterWorktree",
  "ExitPlanMode",
  "ExitWorktree",
  "FetchInboxMessage",
  "GetGoal",
  "GetTask",
  "Glob",
  "Grep",
  "ListAgents",
  "ListConnectors",
  "ListMcpResourcesTool",
  "ListPlugins",
  "ListSkills",
  "LSP",
  "memory_list",
  "memory_read",
  "memory_write",
  "Monitor",
  "NotebookEdit",
  "OfferChromeSetup",
  "PauseGoal",
  "Poll",
  "PowerShell",
  "Projects",
  "propose_skills",
  "PublishPlugin",
  "PushNotification",
  "Read",
  "ReadMcpResourceDirTool",
  "ReadMcpResourceTool",
  "ReadNotifications",
  "ReadWidgetContext",
  "RemoteTrigger",
  "ReportFindings",
  "request_computer",
  "ScheduleWakeup",
  "SearchMcpRegistry",
  "SearchPlugins",
  "SearchSkills",
  "SendFeedback",
  "SendFile",
  "SendMessage",
  "SendToProject",
  "SendToProjectContext",
  "SendUserFile",
  "SendUserMessage",
  "SetGoal",
  "ShareOnboardingGuide",
  "ShowOnboardingRolePicker",
  "Skill",
  "SuggestConnectors",
  "SuggestPluginInstall",
  "SuggestSkills",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskStop",
  "TaskUpdate",
  "TodoWrite",
  "ToolSearch",
  "WaitForMcpServers",
  "WebFetch",
  "WebSearch",
  "Workflow",
  "WrapUp",
  "Write",
  "Yield",
];

const MAX_SUGGESTION_DISTANCE = 2;
const OVER_BROAD_ERROR =
  "Over-broad allow: the rule allows every command or every tool. Name what to allow.";
const OVER_BROAD_WARNING =
  "Over-broad allow: the rule allows every tool of the MCP server. Name the tools to allow.";

// parseRule has checked the segments, so a server with no `__tool` part has no second "__".
function isBareMcpServer(tool: string): boolean {
  return tool.startsWith(MCP_PREFIX) && !tool.slice(MCP_PREFIX.length).includes("__");
}

function overBroadSeverity(rule: Rule): Severity | undefined {
  if (rule.kind === "whole" && (rule.tool === "*" || rule.tool === "Bash")) return "error";
  if (rule.kind === "prefix" && rule.arg === "") return "error";
  if (rule.kind === "whole" && isBareMcpServer(rule.tool)) return "warning";
  return undefined;
}

// Plain Levenshtein distance, one row at a time. Tool names are ASCII, so code points suffice.
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const [i, charA] of Array.from(a).entries()) {
    const current = [i + 1];
    for (const [j, charB] of Array.from(b).entries()) {
      const substitution = (previous.at(j) ?? 0) + (charA === charB ? 0 : 1);
      const deletion = (previous.at(j + 1) ?? 0) + 1;
      const insertion = (current.at(j) ?? 0) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous.at(b.length) ?? 0;
}

function unknownToolMessage(tool: string): string | undefined {
  if (tool === "*" || tool.startsWith(MCP_PREFIX) || KNOWN_TOOLS.includes(tool)) return undefined;
  if (tool === "Task") return "unknown tool `Task`; use `Agent`";
  const ranked = KNOWN_TOOLS.map((name) => ({ name, distance: editDistance(tool, name) }));
  const best = ranked.reduce((a, b) => (b.distance < a.distance ? b : a));
  if (best.distance <= MAX_SUGGESTION_DISTANCE)
    return `unknown tool \`${tool}\`; did you mean \`${best.name}\`?`;
  return `unknown tool \`${tool}\``;
}

function checkEntry(
  entry: unknown,
  path: string,
  list: ListName,
  issue: IssueSink,
): Rule | undefined {
  if (typeof entry !== "string") {
    issue("error", path, "expected a string");
    return undefined;
  }
  const parsed = parseRule(entry);
  if (!parsed.ok) {
    issue("error", path, parsed.message);
    return undefined;
  }
  const unknownTool = unknownToolMessage(parsed.rule.tool);
  if (unknownTool !== undefined) issue("warning", path, unknownTool);
  const severity = list === "allow" ? overBroadSeverity(parsed.rule) : undefined;
  if (severity !== undefined)
    issue(severity, path, severity === "error" ? OVER_BROAD_ERROR : OVER_BROAD_WARNING);
  return severity === "error" ? undefined : parsed.rule;
}

function checkList(
  raw: unknown,
  prefix: string,
  list: ListName,
  issue: IssueSink,
): Rule[] | undefined {
  const path = `${prefix}.${list}`;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issue("error", path, "expected an array of strings");
    return undefined;
  }
  const rules = raw.flatMap((entry: unknown, i) => {
    const rule = checkEntry(entry, `${path}[${String(i)}]`, list, issue);
    return rule ? [rule] : [];
  });
  return rules.length === raw.length ? rules : undefined;
}

// The one "same pattern" key: `Bash(git push:*)` and `Bash(git push *)` share it.
function patternKey(rule: Rule): string {
  return `${rule.tool}|${rule.kind}|${rule.kind === "whole" ? "" : rule.arg}`;
}

// Whether deny or ask rule P blocks every call allow rule Q would allow. Bash arguments go
// through decide itself, so the validator and the gate cannot disagree.
export function covers(p: Rule, q: Rule): boolean {
  if (p.kind === "whole") {
    return (
      p.tool === "*" ||
      p.tool === q.tool ||
      (p.tool.startsWith(MCP_PREFIX) && q.tool.startsWith(`${p.tool}__`))
    );
  }
  if (q.kind === "whole") return false;
  const decision = decide({
    call: { toolName: "Bash", input: { command: q.arg } },
    sets: [{ name: "covers", allow: [], ask: [], deny: [p] }],
    guards: [],
    claude: { decision: "allow" },
  });
  return decision.verdict === "deny";
}

const listEntries = (lists: RuleLists): [ListName, Rule[]][] => [
  ["allow", lists.allow],
  ["ask", lists.ask],
  ["deny", lists.deny],
];

function findCover(q: Rule, lists: RuleLists): string | undefined {
  const blocking = [
    ["ask", lists.ask],
    ["deny", lists.deny],
  ] as const;
  for (const [list, rules] of blocking) {
    const j = rules.findIndex((p) => covers(p, q));
    if (j !== -1) return `${list}[${String(j)}]`;
  }
  return undefined;
}

// A pattern in two lists is an error; an allow it concerns gets no covered warning on top.
function checkSetFindings(lists: RuleLists, prefix: string, issue: IssueSink): void {
  const first = new Map<string, { list: ListName; at: string }>();
  const inTwoLists = new Set<string>();
  for (const [list, rules] of listEntries(lists)) {
    for (const [i, rule] of rules.entries()) {
      const key = patternKey(rule);
      const at = `${list}[${String(i)}]`;
      const seen = first.get(key);
      if (seen === undefined) {
        first.set(key, { list, at });
        continue;
      }
      const sameList = seen.list === list;
      if (!sameList) inTwoLists.add(key);
      issue(sameList ? "warning" : "error", `${prefix}.${at}`, `duplicate of ${seen.at}`);
    }
  }
  for (const [i, rule] of lists.allow.entries()) {
    if (inTwoLists.has(patternKey(rule))) continue;
    const cover = findCover(rule, lists);
    if (cover !== undefined)
      issue("warning", `${prefix}.allow[${String(i)}]`, `covered by ${cover}`);
  }
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
  const allow = checkList(rawAllow, prefix, "allow", issue);
  const ask = checkList(rawAsk, prefix, "ask", issue);
  const deny = checkList(rawDeny, prefix, "deny", issue);
  if (!allow || !ask || !deny) return undefined;
  const lists = { allow, ask, deny };
  checkSetFindings(lists, prefix, issue);
  return keysOk ? lists : undefined;
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

interface ModeGateEnv {
  MODE_GATE_PROFILES?: string | undefined;
  MODE_GATE_CONFIG?: string | undefined;
  XDG_CONFIG_HOME?: string | undefined;
  HOME?: string | undefined;
  USERPROFILE?: string | undefined;
}
type EnvName = keyof ModeGateEnv;
const ENV_NAMES: readonly EnvName[] = [
  "MODE_GATE_PROFILES",
  "MODE_GATE_CONFIG",
  "XDG_CONFIG_HOME",
  "HOME",
  "USERPROFILE",
];

// POSIX root, drive letter with a separator, UNC share.
const ABSOLUTE_PATHS = [/^\//, /^[A-Za-z]:[\\/]/, /^\\\\/];

export function isAbsolutePath(p: string): boolean {
  return ABSOLUTE_PATHS.some((pattern) => pattern.test(p));
}

// Pure string join in the base's style; ".." is kept, so callers see the path as written.
export function joinPath(base: string, child: string): string {
  if (base.endsWith("\\") || base.endsWith("/")) return base + child;
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base}${sep}${child}`;
}

// Reads only the five names, so nothing else in the process environment reaches the config.
export function trustedEnv(
  env: ModeGateEnv,
  untrusted: readonly EnvName[],
): { env: ModeGateEnv; warnings: Issue[] } {
  const trusted: ModeGateEnv = {};
  const warnings: Issue[] = [];
  for (const name of ENV_NAMES) {
    if (untrusted.includes(name)) {
      warnings.push({
        severity: "warning",
        source: "env",
        path: `env.${name}`,
        message: `${name} is set by the repo's settings and is ignored.`,
      });
      continue;
    }
    // eslint-disable-next-line security/detect-object-injection -- name is one of the fixed ENV_NAMES
    const value = env[name];
    // eslint-disable-next-line security/detect-object-injection -- name is one of the fixed ENV_NAMES
    if (value !== undefined && value !== "") trusted[name] = value;
  }
  return { env: trusted, warnings };
}

const isAbsoluteDir = (dir: string | undefined): dir is string =>
  dir !== undefined && isAbsolutePath(dir);
const configIn = (dir: string): string => joinPath(joinPath(dir, "mode-gate"), "config.json");

export function resolveConfigPath(env: ModeGateEnv): { path: string } | { issue: Issue } {
  const {
    MODE_GATE_CONFIG: explicit,
    XDG_CONFIG_HOME: xdg,
    HOME: home,
    USERPROFILE: profile,
  } = env;
  if (explicit !== undefined && explicit !== "") {
    if (isAbsolutePath(explicit)) return { path: explicit };
    return {
      issue: {
        severity: "error",
        source: "env",
        path: "env.MODE_GATE_CONFIG",
        message: "MODE_GATE_CONFIG must be an absolute path.",
      },
    };
  }
  if (isAbsoluteDir(xdg)) return { path: configIn(xdg) };
  const homeDir = [home, profile].find(isAbsoluteDir);
  if (homeDir !== undefined) return { path: configIn(joinPath(homeDir, ".config")) };
  return {
    issue: {
      severity: "error",
      source: "user",
      path: "",
      message: "no home folder: set HOME or USERPROFILE",
    },
  };
}

// Takes the env filtered by trustedEnv, so a repo-set MODE_GATE_PROFILES arrives as unset.
export function parseStartProfiles(env: ModeGateEnv): { names: string[]; warnings: Issue[] } {
  const value = env.MODE_GATE_PROFILES;
  if (value === undefined) return { names: [], warnings: [] };
  const entries = new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ""),
  );
  const names: string[] = [];
  const warnings: Issue[] = [];
  for (const entry of entries) {
    if (isValidProfileName(entry)) {
      names.push(entry);
      continue;
    }
    warnings.push({
      severity: "warning",
      source: "env",
      path: "env.MODE_GATE_PROFILES",
      message: `invalid profile name \`${entry}\``,
    });
  }
  return { names, warnings };
}

interface RawRuleLists {
  allow?: string[];
  ask?: string[];
  deny?: string[];
}
interface RawProfile extends RawRuleLists {
  description: string;
  delegable?: boolean;
}

export interface LoadDeps {
  // undefined means the file is missing; a rejection means it could not be read.
  readFile: (path: string) => Promise<string | undefined>;
  env: ModeGateEnv;
  untrustedEnv: readonly EnvName[];
  cwd: string;
  baseline?: RawRuleLists;
  builtins?: Record<string, RawProfile>;
}

// Plain JSON throughout: the result is stored in `$.state`.
type LoadResult =
  | {
      ok: true;
      config: {
        baseline: RuleSet;
        profiles: Record<string, Profile>;
        proposals: Record<string, Profile>;
      };
      configPath?: string;
      logDir: string;
      startProfiles: string[];
      warnings: Issue[];
    }
  | {
      ok: false;
      errors: Issue[];
      baseline: RuleSet;
      configPath?: string;
      logDir: string;
      startProfiles: [];
      warnings: Issue[];
    };

interface ResultParts {
  issues: Issue[];
  baseline: RuleSet | undefined;
  profiles: Record<string, Profile>;
  proposals: Record<string, Profile>;
  configPath: string | undefined;
  userLogDir: string | undefined;
  cwd: string;
  startNames: string[];
}

const BOM = String.fromCodePoint(0xfeff);

async function readJson(
  readFile: LoadDeps["readFile"],
  path: string,
  source: Source,
): Promise<{ value?: unknown; issues: Issue[] }> {
  const fail = (message: string) => ({
    issues: [{ severity: "error" as const, source, path: "", message }],
  });
  let text: string | undefined;
  try {
    text = await readFile(path);
  } catch {
    return fail(`cannot read ${path}`);
  }
  if (text === undefined) return { issues: [] };
  try {
    const value: unknown = JSON.parse(text.startsWith(BOM) ? text.slice(BOM.length) : text);
    return { value, issues: [] };
  } catch {
    return fail(`${path} is not valid JSON`);
  }
}

const unknownProfile = (name: string): Issue => ({
  severity: "warning",
  source: "env",
  path: "env.MODE_GATE_PROFILES",
  message: `unknown profile \`${name}\``,
});

const resolveLogDir = (cwd: string, logDir: string): string =>
  isAbsolutePath(logDir) ? logDir : joinPath(cwd, logDir);

// The one place that shapes a result, so every failure gets the same fail-closed form.
function buildResult(parts: ResultParts): LoadResult {
  const { issues, baseline, profiles, proposals, configPath, userLogDir, cwd, startNames } = parts;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const path = configPath === undefined ? {} : { configPath };
  if (errors.length === 0 && baseline) {
    const startProfiles = startNames.filter((name) => Object.hasOwn(profiles, name));
    const unknown = startNames.filter((name) => !Object.hasOwn(profiles, name));
    return {
      ok: true,
      config: { baseline, profiles, proposals },
      ...path,
      logDir: resolveLogDir(cwd, userLogDir ?? "logs"),
      startProfiles,
      warnings: [...warnings, ...unknown.map(unknownProfile)],
    };
  }
  return {
    ok: false,
    errors,
    baseline: { name: "baseline", allow: [], ask: [], deny: [] },
    ...path,
    logDir: joinPath(cwd, "logs"),
    startProfiles: [],
    warnings,
  };
}

const PROJECT_FILE = ".mode-gate.json";
// Settings a cloned repo must not change: where the log goes and what the baseline allows.
const PROJECT_IGNORED_KEYS: readonly string[] = ["logDir", "baseline"];

const toWarning = (i: Issue): Issue => ({ ...i, severity: "warning" });

const ignoredKey = (key: string): Issue => ({
  severity: "warning",
  source: "project",
  path: key,
  message: "ignored in a project file",
});

function stripIgnoredKeys(value: unknown): { input: unknown; ignored: Issue[] } {
  if (!isPlainObject(value)) return { input: value, ignored: [] };
  const ignored = PROJECT_IGNORED_KEYS.filter((key) => Object.hasOwn(value, key)).map(ignoredKey);
  const kept = Object.entries(value).filter(([key]) => !PROJECT_IGNORED_KEYS.includes(key));
  return { input: Object.fromEntries(kept), ignored };
}

// A project file only proposes profiles, so none of its issues can fail the load.
async function loadProposals(
  readFile: LoadDeps["readFile"],
  cwd: string,
): Promise<{ proposals: Record<string, Profile>; warnings: Issue[] }> {
  const read = await readJson(readFile, joinPath(cwd, PROJECT_FILE), "project");
  if (read.value === undefined) return { proposals: {}, warnings: read.issues.map(toWarning) };
  const { input, ignored } = stripIgnoredKeys(read.value);
  const checked = checkFile(input, "project");
  return {
    proposals: checked.profiles,
    warnings: [...ignored, ...read.issues, ...checked.issues].map(toWarning),
  };
}

interface Layer {
  set: RuleSet;
  source: Source;
  prefix: string;
}

// Same-layer repeats are left to checkSetFindings, and only equal list types are compared.
function crossLayerFindings(layers: readonly Layer[]): Issue[] {
  const first = new Map<string, { layer: number; path: string }>();
  const warnings: Issue[] = [];
  for (const [n, { set, source, prefix }] of layers.entries()) {
    for (const [list, rules] of listEntries(set)) {
      for (const [i, rule] of rules.entries()) {
        const key = `${list}|${patternKey(rule)}`;
        const path = `${prefix}.${list}[${String(i)}]`;
        const seen = first.get(key);
        if (seen === undefined) first.set(key, { layer: n, path });
        else if (seen.layer !== n)
          warnings.push({
            severity: "warning",
            source,
            path,
            message: `same pattern as ${seen.path}`,
          });
      }
    }
  }
  return warnings;
}

// The baseline in effect, the built-ins no user profile replaces, then the user profiles.
function buildLayers(
  baseline: { set: RuleSet; source: Source } | undefined,
  builtins: Record<string, Profile>,
  userProfiles: Record<string, Profile>,
): Layer[] {
  const profileLayer =
    (source: Source) =>
    (set: Profile): Layer => ({ set, source, prefix: `profiles.${set.name}` });
  const kept = Object.values(builtins).filter((p) => !Object.hasOwn(userProfiles, p.name));
  return [
    ...(baseline ? [{ ...baseline, prefix: "baseline" }] : []),
    ...kept.map(profileLayer("builtin")),
    ...Object.values(userProfiles).map(profileLayer("user")),
  ];
}

export async function loadConfig(deps: LoadDeps): Promise<LoadResult> {
  const { readFile, cwd, baseline = defaultBaseline, builtins = builtinProfiles } = deps;
  const { env, warnings } = trustedEnv(deps.env, deps.untrustedEnv);
  const defaults = checkFile({ baseline }, "baseline");
  const shipped = checkFile({ profiles: builtins }, "builtin");
  const issues = [...warnings, ...defaults.issues, ...shipped.issues];
  const resolved = resolveConfigPath(env);
  const configPath = "path" in resolved ? resolved.path : undefined;
  if ("issue" in resolved) issues.push(resolved.issue);
  let selected = defaults.baseline;
  let baselineSource: Source = "baseline";
  let userProfiles: Record<string, Profile> = {};
  let userLogDir: string | undefined;
  if (configPath !== undefined) {
    const read = await readJson(readFile, configPath, "user");
    issues.push(...read.issues);
    if (read.value !== undefined) {
      const user = checkFile(read.value, "user");
      issues.push(...user.issues);
      // A user baseline replaces the default whole, also when it is invalid: then the load fails.
      if (isPlainObject(read.value) && Object.hasOwn(read.value, "baseline")) {
        selected = user.baseline;
        baselineSource = "user";
      }
      userProfiles = user.profiles;
      userLogDir = user.logDir;
    }
  }
  const effective = selected && { set: selected, source: baselineSource };
  issues.push(...crossLayerFindings(buildLayers(effective, shipped.profiles, userProfiles)));
  const project = await loadProposals(readFile, cwd);
  issues.push(...project.warnings);
  const start = parseStartProfiles(env);
  issues.push(...start.warnings);
  return buildResult({
    issues,
    baseline: selected,
    profiles: { ...shipped.profiles, ...userProfiles },
    proposals: project.proposals,
    configPath,
    userLogDir,
    cwd,
    startNames: start.names,
  });
}
