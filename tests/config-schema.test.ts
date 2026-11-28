import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASELINE_KEYS, PROFILE_KEYS, TOP_LEVEL_KEYS } from "../hooks/config";

interface Schema {
  properties: Record<string, unknown>;
  $defs: {
    baseline: { properties: Record<string, unknown> };
    profile: { properties: Record<string, unknown> };
  };
}

const schema = JSON.parse(readFileSync("mode-gate.schema.json", "utf8")) as Schema;

const sorted = (keys: readonly string[]): string[] => [...keys].sort();

describe("mode-gate.schema.json", () => {
  it("names the same top-level keys as the validator", () => {
    expect(sorted(Object.keys(schema.properties))).toEqual(sorted(TOP_LEVEL_KEYS));
  });

  it("names the same baseline keys as the validator", () => {
    expect(sorted(Object.keys(schema.$defs.baseline.properties))).toEqual(sorted(BASELINE_KEYS));
  });

  it("names the same profile keys as the validator", () => {
    expect(sorted(Object.keys(schema.$defs.profile.properties))).toEqual(sorted(PROFILE_KEYS));
  });
});
