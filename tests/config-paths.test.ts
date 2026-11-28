import { describe, expect, it } from "vitest";
import { isAbsolutePath, joinPath, resolveConfigPath, trustedEnv } from "../hooks/config";

const NO_HOME = {
  issue: {
    severity: "error",
    source: "user",
    path: "",
    message: "no home folder: set HOME or USERPROFILE",
  },
};

describe("isAbsolutePath", () => {
  it.each(["/home/u", "C:\\x", "c:/x", "\\\\srv\\share"])("%s is absolute", (p) => {
    expect(isAbsolutePath(p)).toBe(true);
  });

  it.each(["logs", "./logs", "..\\x", "C:logs", "\\logs", "~/x", ""])("%s is not absolute", (p) => {
    expect(isAbsolutePath(p)).toBe(false);
  });
});

describe("joinPath", () => {
  it.each([
    ["C:\\", "logs", "C:\\logs"],
    ["C:\\repo", "logs", "C:\\repo\\logs"],
    ["/repo/", "logs", "/repo/logs"],
    ["/repo", "logs", "/repo/logs"],
    ["/repo", "../x", "/repo/../x"],
  ])("%s + %s gives %s", (base, child, expected) => {
    expect(joinPath(base, child)).toBe(expected);
  });
});

describe("resolveConfigPath", () => {
  const rows: [string, Record<string, string>, unknown][] = [
    [
      "an absolute MODE_GATE_CONFIG",
      { MODE_GATE_CONFIG: "/home/u/mg.json", XDG_CONFIG_HOME: "/xdg", HOME: "/home/u" },
      { path: "/home/u/mg.json" },
    ],
    [
      "an empty MODE_GATE_CONFIG falls through to XDG_CONFIG_HOME",
      { MODE_GATE_CONFIG: "", XDG_CONFIG_HOME: "/xdg", HOME: "/home/u" },
      { path: "/xdg/mode-gate/config.json" },
    ],
    [
      "a Windows XDG_CONFIG_HOME",
      { XDG_CONFIG_HOME: "C:\\cfg" },
      { path: "C:\\cfg\\mode-gate\\config.json" },
    ],
    [
      "an empty XDG_CONFIG_HOME falls through to HOME",
      { XDG_CONFIG_HOME: "", HOME: "/home/u" },
      { path: "/home/u/.config/mode-gate/config.json" },
    ],
    [
      "a relative XDG_CONFIG_HOME falls through to HOME",
      { XDG_CONFIG_HOME: "cfg", HOME: "/home/u" },
      { path: "/home/u/.config/mode-gate/config.json" },
    ],
    [
      "an empty HOME falls through to USERPROFILE",
      { HOME: "", USERPROFILE: "C:\\Users\\u" },
      { path: "C:\\Users\\u\\.config\\mode-gate\\config.json" },
    ],
    [
      "a relative HOME falls through to USERPROFILE",
      { HOME: "home", USERPROFILE: "C:\\Users\\u" },
      { path: "C:\\Users\\u\\.config\\mode-gate\\config.json" },
    ],
    ["a relative HOME and USERPROFILE", { HOME: "home", USERPROFILE: "Users\\u" }, NO_HOME],
    [
      "all values empty",
      { MODE_GATE_CONFIG: "", XDG_CONFIG_HOME: "", HOME: "", USERPROFILE: "" },
      NO_HOME,
    ],
    ["nothing set", {}, NO_HOME],
  ];

  it.each(rows)("%s", (_, env, expected) => {
    expect(resolveConfigPath(env)).toEqual(expected);
  });

  it.each(["mg.json", "C:mg.json", "~/mg.json"])(
    "a relative MODE_GATE_CONFIG %s is an error",
    (value) => {
      expect(resolveConfigPath({ MODE_GATE_CONFIG: value, HOME: "/home/u" })).toEqual({
        issue: {
          severity: "error",
          source: "env",
          path: "env.MODE_GATE_CONFIG",
          message: expect.stringMatching(/MODE_GATE_CONFIG.*absolute/) as unknown,
        },
      });
    },
  );
});

describe("trustedEnv", () => {
  const full = {
    MODE_GATE_PROFILES: "git-write",
    MODE_GATE_CONFIG: "/home/u/mg.json",
    XDG_CONFIG_HOME: "/xdg",
    HOME: "/home/u",
    USERPROFILE: "C:\\Users\\u",
  };

  it.each(["MODE_GATE_CONFIG", "HOME", "MODE_GATE_PROFILES"] as const)(
    "drops an untrusted %s with one warning",
    (name) => {
      const rest = Object.fromEntries(Object.entries(full).filter(([key]) => key !== name));
      expect(trustedEnv(full, [name])).toEqual({
        env: rest,
        warnings: [
          {
            severity: "warning",
            source: "env",
            path: `env.${name}`,
            message: expect.stringContaining(name) as unknown,
          },
        ],
      });
    },
  );

  it("keeps only the five names", () => {
    const env = { ...full, PATH: "/usr/bin", FOO: "bar" };
    expect(trustedEnv(env, [])).toEqual({ env: full, warnings: [] });
  });

  it("skips empty values", () => {
    expect(trustedEnv({ HOME: "", USERPROFILE: "C:\\Users\\u" }, [])).toEqual({
      env: { USERPROFILE: "C:\\Users\\u" },
      warnings: [],
    });
  });
});
