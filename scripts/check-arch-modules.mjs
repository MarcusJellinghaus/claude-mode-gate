// Arch guard: dependency-cruiser must cruise every .ts file under hooks, types and tests.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

const ROOTS = ["hooks", "types", "tests"];
const CONFIG = "./.dependency-cruiser.cjs";

const normalise = (path) => path.replaceAll("\\", "/");

export function findUncruised(cruisedPaths, sourceFiles) {
  const cruised = new Set(cruisedPaths.map(normalise));
  return sourceFiles.filter((file) => !cruised.has(normalise(file)));
}

function listSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.name.endsWith(".ts") ? [normalise(path)] : [];
  });
}

async function main() {
  const ruleSet = await extractDepcruiseConfig(CONFIG);
  const tsConfig = extractTSConfig(ruleSet.options.tsConfig.fileName);
  const { output } = await cruise(
    ROOTS,
    { ruleSet, validate: true, ...ruleSet.options },
    {},
    { tsConfig },
  );
  const cruised = output.modules.map((module) => module.source);
  const missing = findUncruised(cruised, ROOTS.flatMap(listSources));
  if (missing.length > 0) {
    console.error(
      `arch-modules: dependency-cruiser did not cruise:\n${missing.map((file) => `  ${file}`).join("\n")}`,
    );
    return 1;
  }
  console.log(`arch-modules: ok (${cruised.length} modules)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
