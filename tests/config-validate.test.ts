import { describe, expect, it } from "vitest";
import { ARG_ON_NON_BASH, validateConfig } from "../hooks/config";

const profile = (body: Record<string, unknown>): unknown => ({ profiles: { p: body } });
const errorPaths = (input: unknown): string[] =>
  validateConfig(input, "user")
    .filter((i) => i.severity === "error")
    .map((i) => i.path);

const VALID: [string, unknown][] = [
  ["an empty object", {}],
  ["a relative logDir", { logDir: "x" }],
  ["a $schema", { $schema: "./mode-gate.schema.json" }],
  ["a profile with only a description", profile({ description: "d" })],
  [
    "the How to start profile",
    { profiles: { "git-write": { description: "Git writes", allow: ["Bash(git add *)"] } } },
  ],
  [
    "a profile with every key",
    profile({ description: "d", delegable: false, allow: ["Read"], ask: ["Edit"], deny: ["Bash"] }),
  ],
  ["a baseline with every list", { baseline: { allow: ["Read"], ask: [], deny: ["Bash(rm *)"] } }],
  ["an empty profiles object", { profiles: {} }],
];

const INVALID: [string, unknown, string[]][] = [
  ["allow given a string", profile({ description: "d", allow: "x" }), ["profiles.p.allow"]],
  ["an object rule entry", profile({ description: "d", deny: [{}] }), ["profiles.p.deny[0]"]],
  [
    "a rule that does not parse",
    profile({ description: "d", deny: ["Edit(src/**)"] }),
    ["profiles.p.deny[0]"],
  ],
  ["an unknown top-level key", { foo: 1 }, ["foo"]],
  ["an unknown profile key", profile({ description: "d", name: "p" }), ["profiles.p.name"]],
  ["description in the baseline", { baseline: { description: "d" } }, ["baseline.description"]],
  ["delegable in the baseline", { baseline: { delegable: true } }, ["baseline.delegable"]],
  ["a baseline that is not an object", { baseline: [] }, ["baseline"]],
  ["a profile that is not an object", { profiles: { p: "x" } }, ["profiles.p"]],
  ["profiles that is not an object", { profiles: [] }, ["profiles"]],
  ["a missing description", profile({}), ["profiles.p.description"]],
  ["an empty description", profile({ description: "" }), ["profiles.p.description"]],
  [
    "delegable given a string",
    profile({ description: "d", delegable: "yes" }),
    ["profiles.p.delegable"],
  ],
  ["an empty logDir", { logDir: "" }, ["logDir"]],
  ["a numeric logDir", { logDir: 3 }, ["logDir"]],
  ["a drive-relative logDir", { logDir: "C:logs" }, ["logDir"]],
  ["a root-relative logDir", { logDir: "\\logs" }, ["logDir"]],
  ["a home-relative logDir", { logDir: "~/logs" }, ["logDir"]],
  ["a top-level array", [], [""]],
  ["null", null, [""]],
  ["a string", "x", [""]],
];

const REJECTED_NAMES = [
  "Git",
  "1x",
  "all",
  "baseline",
  "__proto__",
  "constructor",
  "prototype",
  "toString",
];

describe("validateConfig", () => {
  it.each(VALID)("accepts %s", (_, input) => {
    expect(validateConfig(input, "user")).toStrictEqual([]);
  });

  it.each(INVALID)("rejects %s", (_, input, paths) => {
    expect(errorPaths(input)).toStrictEqual(paths);
  });

  it.each(["C:\\logs", "/var/log/x", "\\\\srv\\share", "logs"])("accepts logDir %j", (logDir) => {
    expect(validateConfig({ logDir }, "user")).toStrictEqual([]);
  });

  it.each(REJECTED_NAMES)("rejects the profile name %j", (name) => {
    const input: unknown = JSON.parse(`{"profiles":{${JSON.stringify(name)}:{"description":"d"}}}`);
    expect(errorPaths(input)).toStrictEqual([`profiles.${name}`]);
  });

  it("names the parse failure in the message", () => {
    const [issue] = validateConfig(profile({ description: "d", deny: ["Edit(src/**)"] }), "user");
    expect(issue?.message).toBe(ARG_ON_NON_BASH);
  });

  it("names the expected type for a list that is not an array", () => {
    const [issue] = validateConfig(profile({ description: "d", allow: "x" }), "user");
    expect(issue?.message).toBe("expected an array of strings");
  });

  it.each(["user", "project"] as const)("tags issues with the source %s", (source) => {
    expect(validateConfig({ foo: 1 }, source)).toStrictEqual([
      { severity: "error", source, path: "foo", message: expect.any(String) as unknown },
    ]);
  });

  it("does not pollute the prototype through a __proto__ profile", () => {
    const input: unknown = JSON.parse('{"profiles":{"__proto__":{"polluted":1}}}');
    expect(errorPaths(input)).toStrictEqual(["profiles.__proto__"]);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
});
