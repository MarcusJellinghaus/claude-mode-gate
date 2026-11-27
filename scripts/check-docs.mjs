// Documentation-done gate: required files exist and, for a release, hold no placeholders.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = ["README.md", "SECURITY.md", "CHANGELOG.md", ".claude/CLAUDE.md"];
const PLACEHOLDER = /_To be written\._|_Contact details to be added/;

/**
 * Placeholders are fine pre-release; a release requires finished docs and a licence.
 * @param {{ exists: (file: string) => boolean, read: (file: string) => string, release: boolean }} files
 * @returns {string[]}
 */
export function findDocProblems({ exists, read, release }) {
  const problems = REQUIRED.filter((file) => !exists(file)).map((file) => `${file} is missing`);

  const changelog = exists("CHANGELOG.md") ? read("CHANGELOG.md") : "";
  if (!/^## Unreleased/m.test(changelog)) {
    problems.push('CHANGELOG.md needs an "## Unreleased" section');
  }

  if (release) {
    for (const file of REQUIRED.filter(exists)) {
      if (PLACEHOLDER.test(read(file))) problems.push(`${file} still contains placeholder text`);
    }
    if (!exists("LICENSE")) problems.push("LICENSE is missing");
  }
  return problems;
}

/** @returns {number} */
function main() {
  const problems = findDocProblems({
    exists: existsSync,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the fixed list of required docs
    read: (file) => readFileSync(file, "utf8"),
    release: process.env["RELEASE"] === "1",
  });
  if (problems.length > 0) {
    console.error(problems.map((p) => `check:docs: ${p}`).join("\n"));
    return 1;
  }
  console.log("check:docs: ok");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
