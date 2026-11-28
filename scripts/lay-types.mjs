// Lays the engine's `claude-code` types under plugin/.claude-plugin/types/ so `tsc` can resolve them.
// Claude Code writes them when it loads the mod from a folder it watches, before it checks the
// login, so a `claude -p` run that fails to authenticate is enough (docs/design.md,
// "Assumptions", rows 16 and 23).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TYPES_FILE = "plugin/.claude-plugin/types/claude-code/index.d.ts";

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

/**
 * A placeholder key makes the run fail at the login check instead of calling the model.
 * From 2.1.323 Claude Code lays the types only in a plugin folder it watches, and
 * `claude -p` watches a `--plugin-dir` only when CLAUDE_CODE_PLUGIN_DIR_WATCH is 1.
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function claudeEnv(env) {
  return {
    ...env,
    ANTHROPIC_API_KEY: "sk-ant-placeholder-so-no-model-call",
    CLAUDE_CODE_PLUGIN_DIR_WATCH: "1",
  };
}

/** @returns {number} */
function runClaude() {
  // The exit code is ignored: the run fails at the login check, after the types are laid.
  const result = spawnSync(
    "claude",
    ["-p", "ok", "--plugin-dir", "plugin", "--strict-mcp-config"],
    {
      stdio: "ignore",
      env: claudeEnv(process.env),
    },
  );
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
