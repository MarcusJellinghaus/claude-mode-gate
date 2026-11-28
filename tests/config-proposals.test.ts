import { describe, expect, it } from "vitest";
import { loadConfig } from "../hooks/config";
import type { LoadDeps } from "../hooks/config";
import { fakeDeps, USER_CONFIG } from "./config-fixtures";

const PROJECT = "/repo/.mode-gate.json";
const USER = JSON.stringify({ profiles: { u: { description: "u", allow: ["Read"] } } });

const withProject = (project: string | Error, overrides: Partial<LoadDeps> = {}) =>
  fakeDeps({ [USER_CONFIG]: USER, [PROJECT]: project }, overrides);

async function loadOk(deps: LoadDeps) {
  const result = await loadConfig(deps);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

describe("loadConfig: project proposals", () => {
  it("gives no issue and no proposals for a missing project file", async () => {
    const result = await loadOk(fakeDeps({ [USER_CONFIG]: USER }));
    expect(result.config.proposals).toStrictEqual({});
    expect(result.warnings).toStrictEqual([]);
  });

  it.each([
    ["an unreadable", new Error("EACCES")],
    ["a malformed", '{ "profiles": '],
  ])("warns on %s project file and stays ok", async (_name, project) => {
    const result = await loadOk(withProject(project));
    expect(result.config.proposals).toStrictEqual({});
    expect(result.warnings).toStrictEqual([
      expect.objectContaining({ severity: "warning", source: "project", path: "" }),
    ]);
  });

  it("gives only warnings for an invalid project file", async () => {
    const project = JSON.stringify({ extra: 1, profiles: { p: { description: "d", allow: "x" } } });
    const result = await loadOk(withProject(project));
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.every((w) => w.severity === "warning" && w.source === "project")).toBe(
      true,
    );
    expect(Object.keys(result.config.profiles).sort()).toStrictEqual(["git-write", "u"]);
    expect(result.config.proposals).toStrictEqual({});
  });

  it("warns on a project file that is not an object", async () => {
    const result = await loadOk(withProject("[]"));
    expect(result.config.proposals).toStrictEqual({});
    expect(result.warnings).toStrictEqual([
      { severity: "warning", source: "project", path: "", message: "expected a JSON object" },
    ]);
  });

  it("puts a valid proposal in proposals, not in profiles", async () => {
    const project = JSON.stringify({ profiles: { p: { description: "d", allow: ["Read"] } } });
    const result = await loadOk(withProject(project));
    expect(result.config.proposals["p"]).toStrictEqual({
      name: "p",
      description: "d",
      delegable: true,
      allow: [{ tool: "Read", kind: "whole", raw: "Read" }],
      ask: [],
      deny: [],
    });
    expect(Object.hasOwn(result.config.profiles, "p")).toBe(false);
    expect(result.warnings).toStrictEqual([]);
  });

  it("ignores a logDir in the project file", async () => {
    const result = await loadOk(withProject(JSON.stringify({ logDir: "/elsewhere" })));
    expect(result.logDir).toBe("/repo/logs");
    expect(result.warnings).toStrictEqual([
      {
        severity: "warning",
        source: "project",
        path: "logDir",
        message: "ignored in a project file",
      },
    ]);
  });

  it("ignores a baseline in the project file", async () => {
    const project = JSON.stringify({ baseline: { allow: ["Write"] } });
    const result = await loadOk(withProject(project));
    expect(result.config.baseline.allow).toStrictEqual([
      { tool: "Edit", kind: "whole", raw: "Edit" },
    ]);
    expect(result.warnings).toStrictEqual([
      {
        severity: "warning",
        source: "project",
        path: "baseline",
        message: "ignored in a project file",
      },
    ]);
  });

  it("leaves out proposals with errors and reports them as project warnings", async () => {
    const project = JSON.stringify({
      profiles: {
        constructor: { description: "d" },
        q: { description: "d", allow: ["Bash(git*)"] },
      },
    });
    const result = await loadOk(withProject(project));
    expect(result.config.proposals).toStrictEqual({});
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        source: "project",
        path: "profiles.constructor",
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        source: "project",
        path: "profiles.q.allow[0]",
      }),
    );
  });

  it("leaves out a proposal with the same pattern in two lists", async () => {
    const project = JSON.stringify({
      profiles: { q: { description: "d", allow: ["Read"], deny: ["Read"] } },
    });
    const result = await loadOk(withProject(project));
    expect(Object.hasOwn(result.config.proposals, "q")).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        source: "project",
        path: "profiles.q.deny[0]",
        message: "duplicate of allow[0]",
      }),
    );
  });

  it("does not start a profile that exists only as a proposal", async () => {
    const project = JSON.stringify({ profiles: { p: { description: "d" } } });
    const env = { MODE_GATE_CONFIG: USER_CONFIG, MODE_GATE_PROFILES: "p" };
    const result = await loadOk(withProject(project, { env }));
    expect(result.startProfiles).toStrictEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ source: "env", message: "unknown profile `p`" }),
    );
  });
});
