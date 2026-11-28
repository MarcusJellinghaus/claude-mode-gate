// Validates the plugin and marketplace manifests until `claude plugin validate` is wired into CI.
import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ name?: unknown, version?: unknown, description?: unknown, plugins?: unknown }} Manifest
 * @typedef {{ plugin?: Manifest | undefined, market?: Manifest | undefined, hooks?: unknown, pkg?: Manifest | undefined }} Manifests
 */

/**
 * @param {Manifest | undefined} plugin
 * @returns {string[]}
 */
function pluginProblems(plugin) {
  return ["name", "version", "description"]
    .filter((key) => {
      // eslint-disable-next-line security/detect-object-injection -- key comes from the fixed list above
      const value = plugin?.[/** @type {keyof Manifest} */ (key)];
      return typeof value !== "string" || value === "";
    })
    .map((key) => `plugin.json: missing "${key}"`);
}

/**
 * @param {Manifests} manifests
 * @returns {string[]}
 */
function versionProblems({ plugin, pkg }) {
  if (plugin === undefined || pkg === undefined || plugin.version === pkg.version) return [];
  return [
    `plugin.json version ${shown(plugin.version)} differs from package.json ${shown(pkg.version)}`,
  ];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
const shown = (value) => (typeof value === "string" ? value : "(none)");

/**
 * @param {unknown} entry
 * @returns {unknown}
 */
const nameOf = (entry) =>
  typeof entry === "object" && entry !== null && "name" in entry ? entry.name : undefined;

/**
 * @param {Manifests} manifests
 * @returns {string[]}
 */
function marketProblems({ plugin, market }) {
  const plugins = market?.plugins;
  const listed =
    Array.isArray(plugins) &&
    /** @type {unknown[]} */ (plugins).some((entry) => nameOf(entry) === plugin?.name);
  return listed ? [] : ["marketplace.json: must list the plugin named in plugin.json"];
}

/**
 * Claude Code refuses a second entry: "modules" names one hooks module per plugin.
 * @param {unknown} hooks
 * @param {(entry: string) => boolean} moduleExists
 * @returns {string[]}
 */
function hooksProblems(hooks, moduleExists) {
  if (hooks === undefined || hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    return ["hooks/hooks.json: must be a JSON object"];
  }
  const { modules } = /** @type {{ modules?: unknown }} */ (hooks);
  const entry =
    Array.isArray(modules) && modules.length === 1
      ? /** @type {unknown} */ (modules[0])
      : undefined;
  if (typeof entry !== "string") {
    return ['hooks/hooks.json: "modules" must name exactly one hooks module'];
  }
  return moduleExists(entry) ? [] : [`hooks/hooks.json: module ${entry} does not exist`];
}

/**
 * A manifest that failed to load is `undefined` and is reported, never thrown on.
 * @param {Manifests} manifests
 * @param {(entry: string) => boolean} moduleExists
 * @returns {string[]}
 */
export function findManifestProblems(manifests, moduleExists) {
  return [
    ...pluginProblems(manifests.plugin),
    ...versionProblems(manifests),
    ...marketProblems(manifests),
    ...hooksProblems(manifests.hooks, moduleExists),
  ];
}

/**
 * @param {Manifest | undefined} market
 * @returns {string | undefined} the only plugin's source folder
 */
export function pluginSource(market) {
  const plugins = market?.plugins;
  if (!Array.isArray(plugins) || plugins.length !== 1) return undefined;
  const entry = /** @type {unknown} */ (plugins[0]);
  const source =
    typeof entry === "object" && entry !== null && "source" in entry ? entry.source : undefined;
  return typeof source === "string" && source !== "" ? source : undefined;
}

/**
 * @param {Manifest | undefined} market
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function findSourceProblems(market, exists) {
  const source = pluginSource(market);
  if (source === undefined) {
    return ["marketplace.json: must list exactly one plugin with a source folder"];
  }
  // posix.join keeps "/" separators on Windows too.
  return exists(posix.join(source, ".claude-plugin/plugin.json"))
    ? []
    : [`marketplace.json: source ${source} holds no .claude-plugin/plugin.json`];
}

/**
 * @param {string[]} errors
 * @returns {number}
 */
function report(errors) {
  if (errors.length > 0) {
    console.error(errors.map((e) => `check:manifests: ${e}`).join("\n"));
    return 1;
  }
  console.log("check:manifests: ok");
  return 0;
}

/** @returns {number} */
function main() {
  /** @type {string[]} */
  const loadErrors = [];
  /**
   * @param {string} path
   * @returns {Manifest | undefined}
   */
  const load = (path) => {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- called only with the manifest paths below, under the marketplace's own source folder
      const parsed = /** @type {unknown} */ (JSON.parse(readFileSync(path, "utf8")));
      return /** @type {Manifest} */ (parsed);
    } catch (err) {
      loadErrors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  const market = load(".claude-plugin/marketplace.json");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- source folder from the repo's own marketplace.json, existence check only
  const sourceErrors = findSourceProblems(market, (path) => existsSync(path));
  const dir = pluginSource(market);
  if (sourceErrors.length > 0 || dir === undefined) return report([...loadErrors, ...sourceErrors]);
  const manifests = {
    plugin: load(posix.join(dir, ".claude-plugin/plugin.json")),
    market,
    hooks: load(posix.join(dir, "hooks/hooks.json")),
    pkg: load("package.json"),
  };
  return report([
    ...loadErrors,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- module entry from the repo's own hooks.json, existence check only
    ...findManifestProblems(manifests, (entry) => existsSync(resolve(dir, "hooks", entry))),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
