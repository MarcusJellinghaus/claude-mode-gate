import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATES, runGates } from "../scripts/check.mjs";

type Outcome = { status: number | null; output?: string; seconds?: number };

// Runs the gates against canned outcomes (default: pass, no output) and records
// which gates ran and what was printed.
function check(outcomes: Record<string, Outcome>, gates: readonly string[] = ["a", "b", "c"]) {
  const ran: string[] = [];
  const printed: string[] = [];
  const exitCode = runGates(
    gates,
    (gate) => {
      ran.push(gate);
      // eslint-disable-next-line security/detect-object-injection -- gate name comes from the test's own gate list
      const { status, output = "", seconds = 1.25 } = outcomes[gate] ?? { status: 0 };
      return { status, output, seconds };
    },
    (line) => printed.push(line),
  );
  return { exitCode, ran, printed };
}

const numbered = (count: number) =>
  Array.from({ length: count }, (_, i) => `line ${String(i + 1)}`).join("\n");

describe("runGates", () => {
  it("prints one line per gate and a summary when all pass", () => {
    const { exitCode, printed } = check({ a: { status: 0, output: "noise" } });
    expect(exitCode).toBe(0);
    expect(printed).toEqual([
      "ok    a (1.3s)",
      "ok    b (1.3s)",
      "ok    c (1.3s)",
      "check: ok (3 gates, 3.8s)",
    ]);
  });

  it("sums the gates' raw times on the summary line", () => {
    const { printed } = check({ a: { status: 0, seconds: 0.5 } }, ["a", "b"]);
    expect(printed.at(-1)).toBe("check: ok (2 gates, 1.8s)");
  });

  it("stops at the first failing gate and names the gates not run", () => {
    const { ran, printed } = check({ a: { status: 0 }, b: { status: 1, output: "boom" } });
    expect(ran).toEqual(["a", "b"]);
    expect(printed.at(-1)).toBe("check: b failed; not run: c");
  });

  it("returns the failing gate's exit code", () => {
    expect(check({ b: { status: 2 } }).exitCode).toBe(2);
  });

  it("fails a gate that was killed without an exit code", () => {
    const { exitCode, printed } = check({ a: { status: null } });
    expect(exitCode).toBe(1);
    expect(printed[0]).toBe("FAIL  a (no exit code, 1.3s)");
  });

  it("shows the failing gate's output, but not the passing gates'", () => {
    const { printed } = check({
      a: { status: 0, output: "quiet" },
      b: { status: 1, output: "error here\n" },
    });
    expect(printed).toEqual([
      "ok    a (1.3s)",
      "FAIL  b (exit 1, 1.3s)",
      "error here",
      "check: b failed; not run: c",
    ]);
  });

  it("keeps only the last 60 lines of a long output and says how to see the rest", () => {
    const { printed } = check({ a: { status: 1, output: numbered(100) } });
    expect(printed[1]).toBe("... 40 earlier lines cut; run `npm run a` for all of them");
    expect(printed[2]).toBe("line 41");
    expect(printed.at(-2)).toBe("line 100");
  });

  it("says so when a failing gate printed nothing", () => {
    const { printed } = check({ a: { status: 1, output: " \n" } });
    expect(printed[1]).toBe("(no output)");
  });

  it("strips terminal colour codes from the output", () => {
    const { printed } = check({ a: { status: 1, output: "[\u001b[33mwarn\u001b[39m] file.ts" } });
    expect(printed[1]).toBe("[warn] file.ts");
  });

  it("names no gates when the last gate fails", () => {
    const { printed } = check({ c: { status: 1 } });
    expect(printed.at(-1)).toBe("check: c failed");
  });
});

describe("GATES", () => {
  it("are all npm scripts, and `npm run check` runs them through check.mjs", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(scripts["check"]).toBe("node scripts/check.mjs");
    expect(scripts["lint"]).toBe("eslint . --max-warnings 0");
    for (const gate of GATES) expect(Object.keys(scripts)).toContain(gate);
  });
});
