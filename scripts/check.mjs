// Full gate: runs each gate's npm script in order and stops at the first failure.
// It prints one line per gate and only the failing gate's output, so a run stays
// short enough to read without piping it through `tail`.
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

/** @typedef {{ status: number | null, output: string, seconds: number }} GateResult */

export const GATES = [
  "typecheck",
  "lint",
  "format:check",
  "arch",
  "deadcode",
  "docs:lint",
  "check:manifests",
  "check:catch",
  "check:pins",
  "check:docs",
  "test:coverage",
];

const MAX_LINES = 60;

/**
 * @param {string} output
 * @param {string} gate
 * @returns {string[]}
 */
function lastLines(output, gate) {
  const trimmed = stripVTControlCharacters(output).trimEnd();
  if (trimmed.trim() === "") return ["(no output)"];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= MAX_LINES) return lines;
  const cut = lines.length - MAX_LINES;
  return [
    `... ${String(cut)} earlier lines cut; run \`npm run ${gate}\` for all of them`,
    ...lines.slice(cut),
  ];
}

/**
 * @param {readonly string[]} gates
 * @param {(gate: string) => GateResult} run
 * @param {(line: string) => void} print
 * @returns {number} the exit code: 0, or the failing gate's
 */
export function runGates(gates, run, print) {
  for (const [index, gate] of gates.entries()) {
    const { status, output, seconds } = run(gate);
    const time = `${seconds.toFixed(1)}s`;
    if (status === 0) {
      print(`ok    ${gate} (${time})`);
      continue;
    }
    print(
      `FAIL  ${gate} (${status === null ? "no exit code" : `exit ${String(status)}`}, ${time})`,
    );
    for (const line of lastLines(output, gate)) print(line);
    const notRun = gates.slice(index + 1);
    print(`check: ${gate} failed${notRun.length > 0 ? `; not run: ${notRun.join(", ")}` : ""}`);
    return status ?? 1;
  }
  print(`check: ok (${String(gates.length)} gates)`);
  return 0;
}

/**
 * @param {string} gate
 * @returns {GateResult}
 */
function runGate(gate) {
  const start = performance.now();
  // A command string, not an argument list: Windows needs the shell to find npm.cmd,
  // and the gate names are the fixed list above.
  const result = spawnSync(`npm run --silent ${gate}`, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
  return { status: result.status, output, seconds: (performance.now() - start) / 1000 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(
    runGates(GATES, runGate, (line) => {
      console.log(line);
    }),
  );
}
