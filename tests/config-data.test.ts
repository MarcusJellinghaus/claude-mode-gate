import { describe, expect, it } from "vitest";
import { baseline } from "../hooks/baseline";
import { builtinProfiles } from "../hooks/builtin-profiles";
import { parseRule } from "../hooks/config";
import { decide } from "../hooks/policy";
import type { Rule, RuleSet } from "../hooks/policy";

const mcp = (tool: string): string => `mcp__mcp-workspace__${tool}`;

const READ_TOOLS = [
  "read_file",
  "list_directory",
  "search_files",
  "read_reference_file",
  "list_reference_directory",
  "search_reference_files",
  "get_reference_projects",
  "git",
  "github_issue_list",
  "github_pr_view",
  "github_search",
  "check_branch_status",
  "check_file_size",
  "get_base_branch",
].map(mcp);

const WRITE_TOOLS = [
  "edit_file",
  "save_file",
  "append_file",
  "move_file",
  "delete_this_file",
  "delete_directory",
].map(mcp);

const OTHER_TOOLS = ["Skill", "Agent", "WebFetch", "WebSearch"];

const NPM_SCRIPTS = [
  "check",
  "typecheck",
  "lint",
  "format",
  "format:check",
  "test",
  "test:coverage",
  "test:mutation",
  "arch",
  "deadcode",
  "docs:lint",
  "check:manifests",
  "check:catch",
  "check:pins",
  "check:docs",
  "audit",
].map((name) => `Bash(npm run ${name})`);

const EXPECTED_ALLOW = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...OTHER_TOOLS,
  ...NPM_SCRIPTS,
  "Bash(npm run test -- *)",
];

const toRule = (raw: string): Rule => {
  const parsed = parseRule(raw);
  if (!parsed.ok) throw new Error(`"${raw}" does not parse: ${parsed.message}`);
  return parsed.rule;
};

const set: RuleSet = { name: "baseline", allow: baseline.allow.map(toRule), ask: [], deny: [] };

const allowed = (command: string): boolean =>
  decide({
    call: { toolName: "Bash", input: { command } },
    sets: [set],
    guards: [],
    claude: { decision: "allow" },
  }).verdict === "allow";

const builtinRules = Object.values(builtinProfiles).flatMap((p) => [
  ...p.allow,
  ...p.ask,
  ...p.deny,
]);

describe("default baseline", () => {
  it("has only the allow key", () => {
    expect(Object.keys(baseline)).toStrictEqual(["allow"]);
  });

  it("lists the 41 allow rules in order", () => {
    expect(baseline.allow).toHaveLength(41);
    expect(baseline.allow).toStrictEqual(EXPECTED_ALLOW);
  });

  it("does not allow github_issue_view", () => {
    expect(baseline.allow).not.toContain(mcp("github_issue_view"));
  });

  it.each(baseline.allow)("parses %j", (raw) => {
    expect(parseRule(raw).ok).toBe(true);
  });
});

describe("built-in profiles", () => {
  it("are exactly git-write and issues", () => {
    expect(Object.keys(builtinProfiles)).toStrictEqual(["git-write", "issues"]);
  });

  it.each(Object.entries(builtinProfiles))("%s has the profile keys and empty lists", (_, p) => {
    expect(Object.keys(p).sort()).toStrictEqual(
      ["allow", "ask", "delegable", "deny", "description"].sort(),
    );
    expect(p).not.toHaveProperty("name");
    expect(p.description).not.toBe("");
    expect([p.allow, p.ask, p.deny]).toStrictEqual([[], [], []]);
  });

  it("have only rules that parse", () => {
    for (const raw of builtinRules) expect(parseRule(raw).ok).toBe(true);
  });
});

describe("baseline matching", () => {
  it.each([
    "npm run test -- tests/x.test.ts",
    "npm run check:manifests",
    "npm run check:catch",
    "npm run check:pins",
    "npm run check:docs",
  ])("allows %j", (command) => {
    expect(allowed(command)).toBe(true);
  });

  it.each(["npm install", "npm run check:other", "npm run check:docs -x"])(
    "does not allow %j",
    (command) => {
      expect(allowed(command)).toBe(false);
    },
  );
});
