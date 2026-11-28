import { describe, expect, it } from "vitest";
import { parseStartProfiles } from "../hooks/config";

const invalid = (entry: string) => ({
  severity: "warning",
  source: "env",
  path: "env.MODE_GATE_PROFILES",
  message: `invalid profile name \`${entry}\``,
});

describe("parseStartProfiles", () => {
  it.each([
    ["issues, git-write", ["issues", "git-write"]],
    ["issues,,issues, ", ["issues"]],
    [" ,, ", []],
  ])("%j gives %j", (value, names) => {
    expect(parseStartProfiles({ MODE_GATE_PROFILES: value })).toEqual({ names, warnings: [] });
  });

  it("gives no names when unset", () => {
    expect(parseStartProfiles({})).toEqual({ names: [], warnings: [] });
  });

  it.each(["constructor", "all", "baseline", "prototype", "Git", "__proto__"])(
    "%s gives one warning and no name",
    (entry) => {
      expect(parseStartProfiles({ MODE_GATE_PROFILES: entry })).toEqual({
        names: [],
        warnings: [invalid(entry)],
      });
    },
  );

  it("keeps the valid names next to an invalid one", () => {
    expect(parseStartProfiles({ MODE_GATE_PROFILES: "issues,ALL" })).toEqual({
      names: ["issues"],
      warnings: [invalid("ALL")],
    });
  });

  it("warns once for a repeated invalid name", () => {
    expect(parseStartProfiles({ MODE_GATE_PROFILES: "ALL,ALL" })).toEqual({
      names: [],
      warnings: [invalid("ALL")],
    });
  });
});
