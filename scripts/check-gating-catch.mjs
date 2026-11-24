// Fail-closed guard: every gating hook registered in hooks/register.ts must have a .catch handler.
// Gating events are those that can allow or deny a call (see docs/design.md, "Failure").
// The registration syntax ($.on("event", ...)) is an assumption until the mods API is verified.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GATING_EVENTS = ["tool.call", "tool.check", "prompt.submit", "command.run"];
const REGISTRATION = /\$\.on\(\s*["']([\w.]+)["']/g;

/**
 * Each registration must contain a .catch( before the next registration or the end of the file.
 * @param {string} source
 * @returns {{ scanned: number, uncaught: string[] }}
 */
export function findUncaught(source) {
  const starts = [...source.matchAll(REGISTRATION)].map((m) => ({
    event: m[1] ?? "",
    index: m.index,
  }));
  const uncaught = starts
    .filter((start, i) => {
      if (!GATING_EVENTS.includes(start.event)) return false;
      const end = starts[i + 1]?.index ?? source.length;
      return !/\.catch\s*\(/.test(source.slice(start.index, end));
    })
    .map((start) => start.event);
  return { scanned: starts.length, uncaught };
}

/** @returns {number} */
function main() {
  const { scanned, uncaught } = findUncaught(readFileSync("hooks/register.ts", "utf8"));
  if (uncaught.length > 0) {
    console.error(
      uncaught.map((event) => `check:catch: hook for "${event}" has no .catch handler`).join("\n"),
    );
    return 1;
  }
  console.log(`check:catch: ok (${String(scanned)} registrations scanned)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
