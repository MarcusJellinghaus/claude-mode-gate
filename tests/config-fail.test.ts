import { describe, expect, it } from "vitest";
import { loadConfig } from "../hooks/config";
import type { LoadDeps } from "../hooks/config";
import { fakeDeps, USER_CONFIG } from "./config-fixtures";

const VALID_USER = JSON.stringify({ baseline: { allow: ["Read"] } });
const INVALID_USER = JSON.stringify({ profiles: { p: { description: "d", allow: "x" } } });
const UNC_CONFIG = "\\\\srv\\share\\mg.json";

const withEnv = (env: LoadDeps["env"], files: Record<string, string | Error> = {}) =>
  fakeDeps(files, { env });

async function loadFail(deps: LoadDeps) {
  const result = await loadConfig(deps);
  if (result.ok) throw new Error("expected a failed load");
  return result;
}

async function loadOk(deps: LoadDeps) {
  const result = await loadConfig(deps);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

const failRows: [string, LoadDeps, Record<string, unknown>?][] = [
  ["no home folder", withEnv({})],
  ["an untrusted HOME", fakeDeps({}, { env: { HOME: "/home/u" }, untrustedEnv: ["HOME"] })],
  ["a relative MODE_GATE_CONFIG", withEnv({ MODE_GATE_CONFIG: "mg.json" })],
  ["an unreadable file", fakeDeps({ [USER_CONFIG]: new Error("EACCES") })],
  [
    "a UNC config whose read rejects",
    withEnv({ MODE_GATE_CONFIG: UNC_CONFIG }, { [UNC_CONFIG]: new Error("ENOENT") }),
  ],
  [
    "a malformed user file",
    fakeDeps({ [USER_CONFIG]: '{ "profiles": ' }),
    { source: "user", path: "" },
  ],
  [
    "a user file that fails validation",
    fakeDeps({ [USER_CONFIG]: INVALID_USER }),
    { source: "user", path: "profiles.p.allow" },
  ],
  [
    "a built-in with an argument on Edit",
    fakeDeps(
      { [USER_CONFIG]: VALID_USER },
      { builtins: { p: { description: "d", allow: ["Edit(x)"] } } },
    ),
    { source: "builtin" },
  ],
  [
    "a default baseline that does not parse",
    fakeDeps({ [USER_CONFIG]: VALID_USER }, { baseline: { allow: ["Bash(git*)"] } }),
    { source: "baseline" },
  ],
];

describe("loadConfig: fail closed", () => {
  it.each(failRows)("fails closed on %s", async (_name, deps, expected) => {
    const result = await loadFail(deps);
    expect(result.baseline).toStrictEqual({ name: "baseline", allow: [], ask: [], deny: [] });
    expect(result.startProfiles).toStrictEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    if (expected) expect(result.errors).toContainEqual(expect.objectContaining(expected));
  });

  it("has no configPath key for a relative MODE_GATE_CONFIG", async () => {
    const result = await loadFail(withEnv({ MODE_GATE_CONFIG: "mg.json" }));
    expect(Object.hasOwn(result, "configPath")).toBe(false);
  });

  it("carries errors, warnings, configPath and logDir", async () => {
    const user = JSON.stringify({
      profiles: { p: { description: "d", allow: "x" }, q: { description: "d", allow: ["Bassh"] } },
    });
    const result = await loadFail(fakeDeps({ [USER_CONFIG]: user }));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: "profiles.p.allow", severity: "error" }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ path: "profiles.q.allow[0]", severity: "warning" }),
    );
    expect(result.configPath).toBe(USER_CONFIG);
    expect(result.logDir).toBe("/repo/logs");
  });

  it("gives no start profiles on failure", async () => {
    const env = { MODE_GATE_CONFIG: USER_CONFIG, MODE_GATE_PROFILES: "git-write" };
    const result = await loadFail(withEnv(env, { [USER_CONFIG]: INVALID_USER }));
    expect(result.startProfiles).toStrictEqual([]);
  });

  it("survives a JSON round-trip", async () => {
    const result = await loadFail(fakeDeps({ [USER_CONFIG]: INVALID_USER }));
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});

describe("loadConfig: logDir", () => {
  const withLogDir = (logDir: string) => fakeDeps({ [USER_CONFIG]: JSON.stringify({ logDir }) });

  it("resolves a relative logDir against the working folder", async () => {
    expect((await loadOk(withLogDir("x"))).logDir).toBe("/repo/x");
  });

  it("keeps an absolute logDir", async () => {
    expect((await loadOk(withLogDir("/var/log/mg"))).logDir).toBe("/var/log/mg");
  });

  it("defaults to logs in a Windows working folder", async () => {
    const result = await loadOk(fakeDeps({}, { cwd: "C:\\repo" }));
    expect(result.logDir).toBe("C:\\repo\\logs");
  });

  it("ignores a valid logDir when the load fails", async () => {
    const user = JSON.stringify({ logDir: "x", profiles: { p: { description: "d", allow: "x" } } });
    const result = await loadConfig(fakeDeps({ [USER_CONFIG]: user }));
    expect(result.ok).toBe(false);
    expect(result.logDir).toBe("/repo/logs");
  });
});

describe("loadConfig: start profiles", () => {
  it("keeps known profiles and warns on unknown ones", async () => {
    const env = { MODE_GATE_CONFIG: USER_CONFIG, MODE_GATE_PROFILES: "git-write,nope" };
    const result = await loadOk(withEnv(env));
    expect(result.startProfiles).toStrictEqual(["git-write"]);
    expect(result.warnings).toStrictEqual([
      {
        severity: "warning",
        source: "env",
        path: "env.MODE_GATE_PROFILES",
        message: "unknown profile `nope`",
      },
    ]);
  });

  it("skips the unknown-profile check on failure but keeps invalid-name warnings", async () => {
    const env = { MODE_GATE_CONFIG: USER_CONFIG, MODE_GATE_PROFILES: "nope,Bad!" };
    const result = await loadFail(withEnv(env, { [USER_CONFIG]: INVALID_USER }));
    const messages = result.warnings.map((w) => w.message);
    expect(messages).toContain("invalid profile name `Bad!`");
    expect(messages).not.toContain("unknown profile `nope`");
  });

  it("ignores an untrusted MODE_GATE_PROFILES", async () => {
    const deps = fakeDeps(
      {},
      {
        env: { MODE_GATE_CONFIG: USER_CONFIG, MODE_GATE_PROFILES: "git-write" },
        untrustedEnv: ["MODE_GATE_PROFILES"],
      },
    );
    const result = await loadOk(deps);
    expect(result.startProfiles).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([
      expect.objectContaining({ source: "env", path: "env.MODE_GATE_PROFILES" }),
    ]);
  });
});

describe("loadConfig: prototype safety", () => {
  it("rejects __proto__ and constructor profiles without polluting", async () => {
    const text =
      '{ "profiles": { "__proto__": { "description": "d", "polluted": true }, "constructor": { "description": "d" } } }';
    const result = await loadFail(fakeDeps({ [USER_CONFIG]: text }));
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain("profiles.__proto__");
    expect(paths).toContain("profiles.constructor");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
