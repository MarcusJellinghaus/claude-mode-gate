// Audit gate: `npm audit` at high severity, minus the advisories in audit-allowlist.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

function blockingIds(report) {
  const ids = new Set();
  for (const { via } of Object.values(report.vulnerabilities)) {
    for (const entry of via) {
      if (typeof entry === "string" || !BLOCKING.has(entry.severity)) continue;
      ids.add(entry.url.split("/").pop());
    }
  }
  return ids;
}

export function findBlocking(report, allowlist) {
  const found = blockingIds(report);
  const allowedIds = new Set(allowlist.map((entry) => entry.id));
  return {
    blocking: [...found].filter((id) => !allowedIds.has(id)),
    stale: [...allowedIds].filter((id) => !found.has(id)),
  };
}

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], { encoding: "utf8", shell: true });
  } catch (error) {
    // npm audit exits non-zero when it finds vulnerabilities but still prints the report.
    if (typeof error.stdout === "string" && error.stdout.startsWith("{")) return error.stdout;
    throw error;
  }
}

function main() {
  const report = JSON.parse(runAudit());
  if (report.vulnerabilities === undefined) {
    console.error(`audit: no vulnerability report: ${JSON.stringify(report)}`);
    return 1;
  }
  const allowlist = JSON.parse(readFileSync("audit-allowlist.json", "utf8"));
  const { blocking, stale } = findBlocking(report, allowlist);

  if (blocking.length > 0) {
    console.error(
      `audit: high or critical advisories not in audit-allowlist.json:\n${blocking.map((id) => `  ${id}`).join("\n")}`,
    );
  }
  if (stale.length > 0) {
    console.error(
      `audit: allowlist entries that no longer match a finding, remove them (see issue #2):\n${stale.map((id) => `  ${id}`).join("\n")}`,
    );
  }
  if (blocking.length > 0 || stale.length > 0) return 1;
  console.log("audit: ok");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
