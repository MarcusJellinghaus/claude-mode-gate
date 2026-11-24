import { describe, expect, it } from "vitest";
import { findManifestProblems } from "../scripts/check-manifests.mjs";

const valid = () => ({
  plugin: { name: "gate", version: "1.0.0", description: "A gate." } as Record<string, unknown>,
  market: { plugins: [{ name: "gate" }] } as Record<string, unknown>,
  hooks: { modules: ["./register.ts"] } as unknown,
  pkg: { version: "1.0.0" } as Record<string, unknown>,
});
const always = () => true;

describe("findManifestProblems", () => {
  it("passes valid manifests", () => {
    expect(findManifestProblems(valid(), always)).toEqual([]);
  });

  it.each(["name", "version", "description"])("reports a missing %s in plugin.json", (key) => {
    const manifests = valid();
    manifests.plugin[key] = undefined;
    expect(findManifestProblems(manifests, always)).toContain(`plugin.json: missing "${key}"`);
  });

  it("reports an empty description", () => {
    const manifests = valid();
    manifests.plugin["description"] = "";
    expect(findManifestProblems(manifests, always)).toEqual(['plugin.json: missing "description"']);
  });

  it("reports a plugin version that differs from package.json", () => {
    const manifests = valid();
    manifests.pkg["version"] = "2.0.0";
    expect(findManifestProblems(manifests, always)).toEqual([
      "plugin.json version 1.0.0 differs from package.json 2.0.0",
    ]);
  });

  it("reports a marketplace that does not list the plugin", () => {
    const manifests = valid();
    manifests.market["plugins"] = [{ name: "other" }];
    expect(findManifestProblems(manifests, always)).toEqual([
      "marketplace.json: must list the plugin named in plugin.json",
    ]);
  });

  it("reports a marketplace without a plugins list", () => {
    const manifests = valid();
    delete manifests.market["plugins"];
    expect(findManifestProblems(manifests, always)).toEqual([
      "marketplace.json: must list the plugin named in plugin.json",
    ]);
  });

  it.each([
    ["an array", []],
    ["missing", undefined],
  ])("reports hooks.json that is %s", (_name, hooks) => {
    expect(findManifestProblems({ ...valid(), hooks }, always)).toEqual([
      "hooks/hooks.json: must be a JSON object",
    ]);
  });

  it.each([
    ["two modules", ["./a.ts", "./b.ts"]],
    ["no modules", []],
    ["a module that is not a string", [42]],
    ["modules that is not a list", "./register.ts"],
  ])("reports hooks.json with %s", (_name, modules) => {
    expect(findManifestProblems({ ...valid(), hooks: { modules } }, always)).toEqual([
      'hooks/hooks.json: "modules" must name exactly one hooks module',
    ]);
  });

  it("reports a hooks module that does not exist", () => {
    expect(findManifestProblems(valid(), () => false)).toEqual([
      "hooks/hooks.json: module ./register.ts does not exist",
    ]);
  });

  it("reports a plugin.json that failed to load, without throwing", () => {
    const problems = findManifestProblems({ ...valid(), plugin: undefined }, always);
    expect(problems).toContain('plugin.json: missing "name"');
    expect(problems).toContain("marketplace.json: must list the plugin named in plugin.json");
  });
});
