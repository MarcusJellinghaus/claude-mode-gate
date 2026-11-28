import { describe, expect, it } from "vitest";
import { loadConfig } from "../hooks/config";
import { decide } from "../hooks/policy";
import type { RuleSet } from "../hooks/policy";
import { fakeDeps, USER_CONFIG } from "./config-fixtures";

const load = (user?: unknown) =>
  loadConfig(fakeDeps(user === undefined ? {} : { [USER_CONFIG]: JSON.stringify(user) }));

async function loadOk(user?: unknown) {
  const result = await load(user);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

const editRule = { tool: "Edit", kind: "whole", raw: "Edit" };

describe("loadConfig: how to start", () => {
  it("fills a user profile's defaults", async () => {
    const { config } = await loadOk({
      profiles: { "git-write": { description: "Git writes", allow: ["Bash(git add *)"] } },
    });
    expect(config.profiles["git-write"]).toStrictEqual({
      name: "git-write",
      description: "Git writes",
      delegable: true,
      allow: [{ tool: "Bash", kind: "prefix", arg: "git add ", raw: "Bash(git add *)" }],
      ask: [],
      deny: [],
    });
  });

  it("fails on a list that is not an array", async () => {
    const result = await load({ profiles: { p: { description: "d", allow: "x" } } });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ severity: "error", source: "user", path: "profiles.p.allow" }),
    );
  });
});

describe("loadConfig: success path", () => {
  it("finds a user profile and a built-in under their names", async () => {
    const { config } = await loadOk({ profiles: { mine: { description: "m" } } });
    expect(Object.keys(config.profiles).sort()).toStrictEqual(["git-write", "mine"]);
    for (const [key, profile] of Object.entries(config.profiles)) expect(profile.name).toBe(key);
  });

  it("gives the config path, the log folder and the baseline", async () => {
    const result = await loadOk({});
    expect(result.configPath).toBe(USER_CONFIG);
    expect(result.logDir).toBe("/repo/logs");
    expect(result.startProfiles).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
    expect(result.config.baseline).toStrictEqual({
      name: "baseline",
      allow: [editRule],
      ask: [],
      deny: [],
    });
    expect(result.config.proposals).toStrictEqual({});
  });

  it("stays ok with warnings alone", async () => {
    const result = await loadOk({ profiles: { p: { description: "d", allow: ["Bassh"] } } });
    expect(result.warnings).toStrictEqual([
      expect.objectContaining({ severity: "warning", path: "profiles.p.allow[0]" }),
    ]);
  });

  it("parses a file with a byte order mark", async () => {
    const bom = String.fromCodePoint(0xfeff);
    const deps = fakeDeps({ [USER_CONFIG]: `${bom}${JSON.stringify({ baseline: {} })}` });
    const result = await loadConfig(deps);
    expect(result.ok).toBe(true);
    expect(result.ok && result.config.baseline.allow).toStrictEqual([]);
  });

  it("survives a JSON round-trip", async () => {
    const result = await loadOk({ profiles: { mine: { description: "m", deny: ["Write"] } } });
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});

describe("loadConfig: baseline selection", () => {
  it("uses the default when the user file is missing", async () => {
    const result = await loadOk();
    expect(result.configPath).toBe(USER_CONFIG);
    expect(result.config.baseline.allow).toStrictEqual([editRule]);
  });

  it("uses the default when the user file has no baseline", async () => {
    const { config } = await loadOk({ profiles: {} });
    expect(config.baseline.allow).toStrictEqual([editRule]);
  });

  it("replaces the default whole with the user baseline", async () => {
    const { config } = await loadOk({ baseline: { allow: ["Read"] } });
    expect(config.baseline).toStrictEqual({
      name: "baseline",
      allow: [{ tool: "Read", kind: "whole", raw: "Read" }],
      ask: [],
      deny: [],
    });
  });

  it("passes the user baseline's deny to decide", async () => {
    const { config } = await loadOk({ baseline: { deny: ["Bash(git push *)"] } });
    const sets: RuleSet[] = [config.baseline];
    const decision = decide({
      call: { toolName: "Bash", input: { command: "git push origin" } },
      sets,
      guards: [],
      claude: { decision: "allow" },
    });
    expect(decision.verdict).toBe("deny");
  });
});

describe("loadConfig: merge", () => {
  it("replaces a built-in whole with a user profile of the same name", async () => {
    const deps = fakeDeps(
      { [USER_CONFIG]: JSON.stringify({ profiles: { "git-write": { description: "u" } } }) },
      {
        builtins: {
          "git-write": { description: "g", allow: ["Bash(git add *)"], deny: ["Write"] },
        },
      },
    );
    const result = await loadConfig(deps);
    expect(result.ok && result.config.profiles["git-write"]).toStrictEqual({
      name: "git-write",
      description: "u",
      delegable: true,
      allow: [],
      ask: [],
      deny: [],
    });
  });
});

describe("loadConfig: default deps", () => {
  it("uses the shipped baseline and built-ins", async () => {
    const deps = fakeDeps({});
    delete deps.baseline;
    delete deps.builtins;
    const result = await loadConfig(deps);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.config.baseline.allow).toHaveLength(41);
    expect(Object.keys(result.config.profiles).sort()).toStrictEqual(["git-write", "issues"]);
  });
});
