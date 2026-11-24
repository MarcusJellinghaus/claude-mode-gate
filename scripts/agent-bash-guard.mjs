// PreToolUse hook for the agents in .claude/agents: a Bash call passes only if it is exactly
// `npm run <script>` for a script named on the command line. The hook only ever denies; a call
// it lets through still goes through the normal permission rules, so it narrows and never widens.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {unknown} input the hook's stdin JSON
 * @param {string[]} allowedScripts
 * @returns {string | undefined} why the call is denied, or undefined to let it through
 */
export function denyReason(input, allowedScripts) {
  const allowed = allowedScripts.map((script) => `npm run ${script}`);
  const reason = `This agent may only run: ${allowed.join(", ") || "no Bash commands"}.`;
  if (typeof input !== "object" || input === null || !("tool_input" in input)) return reason;
  const toolInput = input.tool_input;
  if (typeof toolInput !== "object" || toolInput === null || !("command" in toolInput))
    return reason;
  const command = toolInput.command;
  if (typeof command !== "string") return reason;
  return allowed.includes(command.trim()) ? undefined : reason;
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseOrUndefined(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function main() {
  const reason = denyReason(parseOrUndefined(readFileSync(0, "utf8")), process.argv.slice(2));
  if (reason !== undefined) {
    const hookSpecificOutput = {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    };
    console.log(JSON.stringify({ hookSpecificOutput }));
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
