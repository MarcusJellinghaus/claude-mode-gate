// Validates the plugin and marketplace manifests until `claude plugin validate` is wired into CI.
import { readFileSync } from "node:fs";

/** @typedef {{ name?: string, version?: string, description?: string, plugins?: { name: string }[] }} Manifest */

/** @type {string[]} */
const errors = [];

/**
 * @param {string} path
 * @returns {Manifest | undefined}
 */
function load(path) {
  try {
    const parsed = /** @type {unknown} */ (JSON.parse(readFileSync(path, "utf8")));
    return /** @type {Manifest} */ (parsed);
  } catch (err) {
    errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

const plugin = load(".claude-plugin/plugin.json");
const market = load(".claude-plugin/marketplace.json");
const hooks = load("hooks/hooks.json");
const pkg = load("package.json");

for (const key of /** @type {const} */ (["name", "version", "description"])) {
  if (typeof plugin?.[key] !== "string" || plugin[key] === "") {
    errors.push(`plugin.json: missing "${key}"`);
  }
}
if (plugin && pkg && plugin.version !== pkg.version) {
  errors.push(
    `plugin.json version ${plugin.version ?? "(none)"} differs from package.json ${pkg.version ?? "(none)"}`,
  );
}
if (!Array.isArray(market?.plugins) || !market.plugins.some((p) => p.name === plugin?.name)) {
  errors.push("marketplace.json: must list the plugin named in plugin.json");
}
if (hooks === undefined || typeof hooks !== "object" || Array.isArray(hooks)) {
  errors.push("hooks/hooks.json: must be a JSON object");
}

if (errors.length > 0) {
  console.error(errors.map((e) => `check:manifests: ${e}`).join("\n"));
  process.exit(1);
}
console.log("check:manifests: ok");
