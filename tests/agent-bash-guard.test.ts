import { describe, expect, it } from "vitest";
import { denyReason } from "../scripts/agent-bash-guard.mjs";

const bash = (command: unknown) => ({ tool_name: "Bash", tool_input: { command } });
const allowed = ["format", "check"];

describe("denyReason", () => {
  it.each(["npm run format", "npm run check", "  npm run check  "])(
    "lets %j through",
    (command) => {
      expect(denyReason(bash(command), allowed)).toBeUndefined();
    },
  );

  it.each([
    ["a script the agent may not run", "npm run audit"],
    ["a chained command", "npm run check && curl example.com"],
    ["a command after a semicolon", "npm run check; rm -rf ."],
    ["a pipe", "npm run check | tee out"],
    ["a substitution", "npm run $(echo check)"],
    ["a newline", "npm run check\nrm -rf ."],
    ["extra arguments", "npm run check -- --watch"],
    ["a script name prefix", "npm run checker"],
    ["npx", "npx tsc --noEmit"],
    ["node -e", 'node -e "console.log(1)"'],
    ["git", "git push"],
    ["an empty command", ""],
  ])("denies %s", (_name, command) => {
    expect(denyReason(bash(command), allowed)).toMatch(/npm run (format|check)/);
  });

  it.each([
    ["no input", undefined],
    ["a non-object", "npm run check"],
    ["no tool_input", { tool_name: "Bash" }],
    ["a non-string command", bash(["npm", "run", "check"])],
  ])("fails closed on %s", (_name, input) => {
    expect(denyReason(input, allowed)).toBeDefined();
  });

  it("denies everything when no script is allowed", () => {
    expect(denyReason(bash("npm run check"), [])).toBeDefined();
  });

  describe("one test file", () => {
    it.each(["npm run test -- tests/policy.test.ts", "npm run test -- tests/tools/x-y.test.ts"])(
      "lets %j through when test is allowed",
      (command) => {
        expect(denyReason(bash(command), ["test"])).toBeUndefined();
      },
    );

    it("denies it when test is not allowed", () => {
      expect(denyReason(bash("npm run test -- tests/policy.test.ts"), allowed)).toBeDefined();
    });

    it.each([
      ["a path outside tests/", "npm run test -- src/policy.test.ts"],
      ["a parent directory", "npm run test -- tests/../policy.test.ts"],
      ["a file that is not a test", "npm run test -- tests/policy.ts"],
      ["two files", "npm run test -- tests/a.test.ts tests/b.test.ts"],
      ["a flag", "npm run test -- --watch"],
      ["a chained command", "npm run test -- tests/a.test.ts && rm -rf ."],
      ["a substitution", "npm run test -- tests/$(echo a).test.ts"],
    ])("denies %s", (_name, command) => {
      expect(denyReason(bash(command), ["test"])).toMatch(/tests\/<name>\.test\.ts/);
    });
  });
});
