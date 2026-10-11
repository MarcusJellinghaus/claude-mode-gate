// Lays the engine's `claude-code` types under .claude-plugin/types/ so `tsc` can resolve them.
// Claude Code writes them whenever it loads the mod, before it checks the login, so a `claude -p`
// run that fails to authenticate is enough (docs/design.md, "Assumptions", rows 16 and 23).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TYPES_FILE = ".claude-plugin/types/claude-code/index.d.ts";

/**
 * @param {{ exists: (path: string) => boolean, run: () => number, force?: boolean }} deps
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function layTypes({ exists, run, force = false }) {
  if (!force && exists(TYPES_FILE)) return { ok: true };
  run();
  if (exists(TYPES_FILE)) return { ok: true };
  return {
    ok: false,
    message: `${TYPES_FILE} is missing. Install Claude Code 2.1.292 or newer and run \`npm run types:lay\`.`,
  };
}

/** @returns {number} */
function runClaude() {
  // The exit code is ignored: the run fails at the login check, after the types are laid.
  // A placeholder key makes it fail at once instead of calling the model.
  const result = spawnSync("claude", ["-p", "ok", "--plugin-dir", ".", "--strict-mcp-config"], {
    stdio: "ignore",
    env: { ...process.env, ANTHROPIC_API_KEY: "sk-ant-placeholder-so-no-model-call" },
  });
  return result.status ?? 1;
}

/** @returns {number} */
function main() {
  const result = layTypes({
    exists: existsSync,
    run: runClaude,
    force: process.argv.includes("--force"),
  });
  if (result.ok) {
    console.log("lay-types: ok");
    return 0;
  }
  console.error(`lay-types: ${result.message}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
