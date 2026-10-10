// Pin check: every third-party action in .github/workflows must use a full commit SHA.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOWS_DIR = ".github/workflows";
const USES = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/gm;
const PINNED = /@[0-9a-f]{40}$/;

/**
 * @param {string} workflowText
 * @returns {string[]}
 */
export function findUnpinned(workflowText) {
  return [...workflowText.matchAll(USES)]
    .map((match) => match[1] ?? "")
    .filter((ref) => !ref.startsWith("./") && !ref.startsWith("docker://") && !PINNED.test(ref));
}

function main() {
  const files = readdirSync(WORKFLOWS_DIR).filter((name) => /\.ya?ml$/.test(name));
  const offenders = files.flatMap((name) =>
    findUnpinned(readFileSync(join(WORKFLOWS_DIR, name), "utf8")).map((ref) => `${name}: ${ref}`),
  );
  if (offenders.length > 0) {
    console.error(
      `pins: actions not pinned to a full commit SHA:\n${offenders.map((line) => `  ${line}`).join("\n")}`,
    );
    return 1;
  }
  console.log("pins: ok");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
