import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface TsConfig {
  compilerOptions: Record<string, unknown>;
  include: string[];
}

const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as TsConfig;

describe("tsconfig.json", () => {
  it.each([
    "strict",
    "noUncheckedIndexedAccess",
    "exactOptionalPropertyTypes",
    "noImplicitOverride",
    "noFallthroughCasesInSwitch",
    "noPropertyAccessFromIndexSignature",
    "allowJs",
    "checkJs",
  ])("enables %s", (flag) => {
    expect(tsconfig.compilerOptions[flag]).toBe(true);
  });

  it("type-checks the scripts", () => {
    expect(tsconfig.include).toContain("scripts");
  });
});
