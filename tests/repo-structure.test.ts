import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("repo structure", () => {
  it("keeps policy.ts free of the `$` runtime and of imports", () => {
    const source = read("hooks/policy.ts");
    expect(source).not.toMatch(/\$\.(state|store|ui|on)\b/);
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("ships valid JSON manifests that agree on the plugin name", () => {
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { name: string };
    const market = JSON.parse(read(".claude-plugin/marketplace.json")) as {
      plugins: { name: string }[];
    };
    expect(market.plugins.map((p) => p.name)).toContain(plugin.name);
  });
});
