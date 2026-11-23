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
});
