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
    "verbatimModuleSyntax",
    "erasableSyntaxOnly",
  ])("enables %s", (flag) => {
    // eslint-disable-next-line security/detect-object-injection -- flag comes from the test table
    expect(tsconfig.compilerOptions[flag]).toBe(true);
  });

  it("resolves the engine's claude-code types from the folder the engine lays them in", () => {
    expect(tsconfig.compilerOptions["typeRoots"]).toContain("./plugin/.claude-plugin/types");
    expect(tsconfig.compilerOptions["types"]).toEqual(
      expect.arrayContaining(["claude-code", "claude-code-tools", "claude-code-mcp", "node"]),
    );
  });

  it("type-checks the scripts", () => {
    expect(tsconfig.include).toContain("scripts");
  });

  it("names the plugin's source folders one by one, so the laid engine types stay out", () => {
    expect(tsconfig.include).toEqual(
      expect.arrayContaining(["plugin/hooks", "plugin/types", "plugin/tests", "tests"]),
    );
    expect(tsconfig.include).not.toContain("plugin");
  });
});
