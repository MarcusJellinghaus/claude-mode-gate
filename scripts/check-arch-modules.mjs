// Arch guard: dependency-cruiser must cruise every .ts file under hooks, types and tests.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

const ROOTS = ["hooks", "types", "tests"];
const CONFIG = "./.dependency-cruiser.cjs";

/** @param {string} path */
const normalise = (path) => path.replaceAll("\\", "/");

/**
 * @param {string[]} cruisedPaths
 * @param {string[]} sourceFiles
 * @returns {string[]}
 */
export function findUncruised(cruisedPaths, sourceFiles) {
  const cruised = new Set(cruisedPaths.map(normalise));
  return sourceFiles.filter((file) => !cruised.has(normalise(file)));
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.name.endsWith(".ts") ? [normalise(path)] : [];
  });
}

/** @returns {Promise<number>} */
async function main() {
  const ruleSet = await extractDepcruiseConfig(CONFIG);
  const tsConfig = extractTSConfig(ruleSet.options?.tsConfig?.fileName ?? "tsconfig.json");
  const { output } = await cruise(
    ROOTS,
    { ruleSet, validate: true, ...ruleSet.options },
    {},
    { tsConfig },
  );
  if (typeof output === "string") throw new Error("dependency-cruiser returned text, not a result");
  const cruised = output.modules.map((module) => module.source);
  const missing = findUncruised(cruised, ROOTS.flatMap(listSources));
  if (missing.length > 0) {
    console.error(
      `arch-modules: dependency-cruiser did not cruise:\n${missing.map((file) => `  ${file}`).join("\n")}`,
    );
    return 1;
  }
  console.log(`arch-modules: ok (${String(cruised.length)} modules)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
