import { describe, expect, it } from "vitest";
import { loadConfig } from "../hooks/config";
import type { LoadDeps } from "../hooks/config";
import { fakeDeps, USER_CONFIG } from "./config-fixtures";

const PROJECT = "/repo/.mode-gate.json";

const userFile = (content: unknown, overrides: Partial<LoadDeps> = {}) =>
  fakeDeps({ [USER_CONFIG]: JSON.stringify(content) }, overrides);

const gitWrite = (allow: string[]) => ({
  builtins: { "git-write": { description: "g", delegable: true, allow, ask: [], deny: [] } },
});

async function warningsOf(deps: LoadDeps) {
  const result = await loadConfig(deps);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.warnings;
}

describe("loadConfig: cross-layer duplicates", () => {
  it("warns on a user profile that repeats a built-in rule", async () => {
    const deps = userFile(
      { profiles: { p: { description: "p", allow: ["Bash(git add *)"] } } },
      gitWrite(["Bash(git add *)"]),
    );
    expect(await warningsOf(deps)).toStrictEqual([
      {
        severity: "warning",
        source: "user",
        path: "profiles.p.allow[0]",
        message: "same pattern as profiles.git-write.allow[0]",
      },
    ]);
  });

  it("treats the two prefix spellings as the same pattern", async () => {
    const deps = userFile(
      { profiles: { p: { description: "p", allow: ["Bash(git add:*)"] } } },
      gitWrite(["Bash(git add *)"]),
    );
    expect(await warningsOf(deps)).toStrictEqual([
      expect.objectContaining({ path: "profiles.p.allow[0]" }),
    ]);
  });

  it("gives no warning for a user profile that replaces the built-in it repeats", async () => {
    const deps = userFile(
      { profiles: { "git-write": { description: "mine", allow: ["Bash(git add *)"] } } },
      gitWrite(["Bash(git add *)"]),
    );
    expect(await warningsOf(deps)).toStrictEqual([]);
  });

  it("gives no warning for a proposal that repeats a user rule", async () => {
    const deps = fakeDeps({
      [USER_CONFIG]: JSON.stringify({ profiles: { u: { description: "u", allow: ["Read"] } } }),
      [PROJECT]: JSON.stringify({ profiles: { p: { description: "p", allow: ["Read"] } } }),
    });
    expect(await warningsOf(deps)).toStrictEqual([]);
  });

  it("warns on a built-in that repeats a default baseline rule", async () => {
    const deps = fakeDeps({}, gitWrite(["Edit"]));
    expect(await warningsOf(deps)).toStrictEqual([
      {
        severity: "warning",
        source: "builtin",
        path: "profiles.git-write.allow[0]",
        message: "same pattern as baseline.allow[0]",
      },
    ]);
  });

  it("compares with the user baseline, not the default it replaces", async () => {
    const deps = userFile({
      baseline: { allow: ["Read"] },
      profiles: {
        p: { description: "p", allow: ["Edit"] },
        q: { description: "q", allow: ["Read"] },
      },
    });
    expect(await warningsOf(deps)).toStrictEqual([
      {
        severity: "warning",
        source: "user",
        path: "profiles.q.allow[0]",
        message: "same pattern as baseline.allow[0]",
      },
    ]);
  });

  it("gives no warning for a restriction profile that denies a baseline allow", async () => {
    const deps = userFile(
      { profiles: { r: { description: "r", deny: ["mcp__mcp-workspace__save_file"] } } },
      { baseline: { allow: ["mcp__mcp-workspace__save_file"] } },
    );
    expect(await warningsOf(deps)).toStrictEqual([]);
  });

  it("gives no warning for a deny in one profile and an allow in another", async () => {
    const deps = userFile({
      profiles: {
        a: { description: "a", deny: ["Bash(git push)"] },
        b: { description: "b", allow: ["Bash(git push)"] },
      },
    });
    expect(await warningsOf(deps)).toStrictEqual([]);
  });

  it.each(["ask", "deny"])("warns on a %s rule repeated across two profiles", async (list) => {
    const deps = userFile({
      profiles: {
        a: { description: "a", [list]: ["Bash(git push)"] },
        b: { description: "b", [list]: ["Bash(git push)"] },
      },
    });
    expect(await warningsOf(deps)).toStrictEqual([
      {
        severity: "warning",
        source: "user",
        path: `profiles.b.${list}[0]`,
        message: `same pattern as profiles.a.${list}[0]`,
      },
    ]);
  });
});
