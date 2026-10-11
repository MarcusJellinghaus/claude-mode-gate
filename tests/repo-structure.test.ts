import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("repo structure", () => {
  it("keeps policy.ts free of the `$` runtime and of imports", () => {
    const source = read("hooks/policy.ts");
    expect(source).not.toMatch(/\$\.(state|store|ui|on)\b/);
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("names exactly one hooks module, and the file exists", () => {
    const hooks = JSON.parse(read("hooks/hooks.json")) as { modules?: string[] };
    expect(hooks.modules).toEqual(["./register.ts"]);
    expect(existsSync("hooks/register.ts")).toBe(true);
  });

  it("types the hooks module as Register", () => {
    expect(read("hooks/register.ts")).toMatch(/export const register: Register\b/);
  });

  it("names an author and describes the marketplace, so `claude plugin validate --strict` passes", () => {
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { author?: { name?: string } };
    const market = JSON.parse(read(".claude-plugin/marketplace.json")) as { description?: string };
    expect(plugin.author?.name).toBeTruthy();
    expect(market.description).toBeTruthy();
  });

  it("ships valid JSON manifests that agree on the plugin name", () => {
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { name: string };
    const market = JSON.parse(read(".claude-plugin/marketplace.json")) as {
      plugins: { name: string }[];
    };
    expect(market.plugins.map((p) => p.name)).toContain(plugin.name);
  });
});
