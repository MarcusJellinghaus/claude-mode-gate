// Fail-closed guard: every gating hook registered in hooks/register.ts must have a .catch handler.
// Gating events are those that can allow or deny a call (see docs/design.md, "Failure").
// The registration syntax ($.on("event", ...)) is an assumption until the mods API is verified.
import { readFileSync } from "node:fs";

const GATING_EVENTS = ["tool.call", "tool.check", "prompt.submit", "command.run"];
const source = readFileSync("hooks/register.ts", "utf8");

// Each registration must contain a .catch( before the next registration or the end of the file.
const pattern = /\$\.on\(\s*["']([\w.]+)["']/g;
const starts = [...source.matchAll(pattern)].map((m) => ({ event: m[1], index: m.index }));
const problems = [];

starts.forEach((start, i) => {
  if (!GATING_EVENTS.includes(start.event)) return;
  const end = starts[i + 1]?.index ?? source.length;
  if (!/\.catch\s*\(/.test(source.slice(start.index, end))) {
    problems.push(`hook for "${start.event}" has no .catch handler`);
  }
});

if (problems.length > 0) {
  console.error(problems.map((p) => `check:catch: ${p}`).join("\n"));
  process.exit(1);
}
console.log(`check:catch: ok (${starts.length} registrations scanned)`);
