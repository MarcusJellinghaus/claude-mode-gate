// Documentation-done gate: required files exist and, for a release, hold no placeholders.
import { existsSync, readFileSync } from "node:fs";

/** @type {string[]} */
const problems = [];
const required = ["README.md", "SECURITY.md", "CHANGELOG.md", "CLAUDE.md"];
for (const file of required) {
  if (!existsSync(file)) problems.push(`${file} is missing`);
}

const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";
if (!/^## Unreleased/m.test(changelog)) {
  problems.push('CHANGELOG.md needs an "## Unreleased" section');
}

// Placeholders are fine pre-release. Run with RELEASE=1 to require finished docs and a licence.
if (process.env["RELEASE"] === "1") {
  for (const file of required.filter((f) => existsSync(f))) {
    if (/_To be written\._|_Contact details to be added/.test(readFileSync(file, "utf8"))) {
      problems.push(`${file} still contains placeholder text`);
    }
  }
  if (!existsSync("LICENSE")) problems.push("LICENSE is missing");
}

if (problems.length > 0) {
  console.error(problems.map((p) => `check:docs: ${p}`).join("\n"));
  process.exit(1);
}
console.log("check:docs: ok");
