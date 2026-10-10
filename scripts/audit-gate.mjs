// Audit gate: `npm audit` at high severity, minus the advisories in audit-allowlist.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ id: string, reason: string, issue: number }} AllowlistEntry
 * @typedef {{ vulnerabilities: Record<string, { via: (string | { severity: string, url: string })[] }> }} AuditReport
 */

const BLOCKING = new Set(["high", "critical"]);

/**
 * @param {AuditReport} report
 * @returns {Set<string>}
 */
function blockingIds(report) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const { via } of Object.values(report.vulnerabilities)) {
    for (const entry of via) {
      if (typeof entry === "string" || !BLOCKING.has(entry.severity)) continue;
      ids.add(entry.url.split("/").pop() ?? entry.url);
    }
  }
  return ids;
}

/**
 * @param {AuditReport} report
 * @param {AllowlistEntry[]} allowlist
 * @returns {{ blocking: string[], stale: string[] }}
 */
export function findBlocking(report, allowlist) {
  const found = blockingIds(report);
  const allowedIds = new Set(allowlist.map((entry) => entry.id));
  return {
    blocking: [...found].filter((id) => !allowedIds.has(id)),
    stale: [...allowedIds].filter((id) => !found.has(id)),
  };
}

/**
 * @param {string} text
 * @returns {unknown}
 */
const parseJson = (text) => JSON.parse(text);

/** @returns {string} */
function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], { encoding: "utf8", shell: true });
  } catch (error) {
    // npm audit exits non-zero when it finds vulnerabilities but still prints the report.
    const stdout = /** @type {{ stdout?: unknown }} */ (error).stdout;
    if (typeof stdout === "string" && stdout.startsWith("{")) return stdout;
    throw error;
  }
}

/** @returns {number} */
function main() {
  const report = /** @type {Partial<AuditReport>} */ (parseJson(runAudit()));
  if (report.vulnerabilities === undefined) {
    console.error(`audit: no vulnerability report: ${JSON.stringify(report)}`);
    return 1;
  }
  const allowlist = /** @type {AllowlistEntry[]} */ (
    parseJson(readFileSync("audit-allowlist.json", "utf8"))
  );
  const { blocking, stale } = findBlocking({ vulnerabilities: report.vulnerabilities }, allowlist);

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
