# Step 2: Pin Claude Code and add `scripts/claude.mjs`

One commit: the exact devDependency (installed by the owner right after the move commit) plus the one module that starts Claude Code. It comes straight after step 1, so no other commit runs `npm run check` while the devDependency is installed but unused (knip would report it).

## Preconditions

Read with `read_file`; for each failure write one line to `pr_info/.blocked.txt` and stop:

- `package.json` `devDependencies["@anthropic-ai/claude-code"]` is exactly `2.1.326` (no `^` or `~`), and `package-lock.json` lists it.
- `node_modules/@anthropic-ai/claude-code/package.json` exists with `"version": "2.1.326"`.
- That file has no `preinstall`, `install` or `postinstall` script, and its `bin` target file exists in the package folder. (The repo sets `ignore-scripts=true`; a package that needs an install script is the issue's fallback case for the owner.)
- If it has an `exports` field, it exposes `./package.json`.

## WHERE

- Create `scripts/claude.mjs` and `tests/claude.test.ts`.
- Commit the owner's `package.json` and `package-lock.json` changes.
- `CHANGELOG.md`.

## WHAT

```js
// scripts/claude.mjs
/**
 * @param {string} pkgDir the package folder
 * @param {unknown} bin the package.json `bin` field: a path, or { claude: path }
 * @param {readonly string[]} args
 * @param {string} nodePath process.execPath
 * @returns {{ command: string, args: string[] }}
 */
export function claudeCommand(pkgDir, bin, args, nodePath)

/**
 * @param {readonly string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, stdio?: "inherit" | "ignore" }} [options]
 * @returns {number} the exit code
 */
export function runClaude(args, { env = process.env, stdio = "inherit" } = {})
```

`main` runs `runClaude(process.argv.slice(2))` and exits with its code, so `node scripts/claude.mjs plugin validate plugin --strict` works.

## ALGORITHM

```text
claudeCommand(pkgDir, bin, args, nodePath):
  target = typeof bin === "string" ? bin : bin?.claude; not a non-empty string → throw Error("@anthropic-ai/claude-code: no claude bin")
  path = resolve(pkgDir, target)
  /\.[cm]?js$/.test(path) ? { command: nodePath, args: [path, ...args] } : { command: path, args: [...args] }
runClaude(args, options):
  pkgFile = createRequire(import.meta.url).resolve("@anthropic-ai/claude-code/package.json")   // literal specifier: knip sees the dependency
  { command, args } = claudeCommand(dirname(pkgFile), JSON.parse(readFileSync(pkgFile)).bin, args, process.execPath)
  return spawnSync(command, args, { stdio, env: { ...env, DISABLE_AUTOUPDATER: "1" } }).status ?? 1   // no shell
```

## Tests first (`tests/claude.test.ts`)

Table over `claudeCommand` with `path.resolve` for the expected paths:

- string bin `cli.js` → `node` + `[<pkgDir>/cli.js, ...args]` (JS case);
- `{ claude: "cli.mjs" }` → JS case;
- `{ claude: "bin/claude.exe" }` → the executable itself, args unchanged (native case);
- `{ claude: "bin/claude" }` (no extension) → native case;
- `undefined`, `{}`, `{ claude: "" }` → throws.

`runClaude` does I/O and is not unit-tested; step 4 and step 5 run it for real.

## HOW

- `node:child_process` `spawnSync` without `shell`, `node:module` `createRequire`, `node:fs`, `node:path`, `node:url` (for the `main` guard, as in the other scripts).
- ESLint security suppressions inline with the rule and a reason (for example `detect-non-literal-fs-filename`: the path comes from Node's resolver for the fixed package).
- Run `npm run deadcode`: knip must count `@anthropic-ai/claude-code` as used. If it still reports it, write one line to `pr_info/.blocked.txt` and stop.
- Run `npm run audit`: Claude Code's dependencies join the audit.

## DATA

- `claudeCommand` → `{ command, args }`.
- `runClaude` → exit code, `1` when the child has none.

## Checks and commit

- `npm run format`, then `npm run check`.
- `CHANGELOG.md`: Claude Code is an exact devDependency, and `scripts/claude.mjs` is the one way the repo starts it (the pinned binary, without a shell, `DISABLE_AUTOUPDATER=1`).
- `git_commit` with `paths`: `package.json`, `package-lock.json`, `scripts/claude.mjs`, `tests/claude.test.ts`, `CHANGELOG.md`.
- Message: `build(deps): pin Claude Code and start it through scripts/claude.mjs`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_2.md`. Implement step 2 only: check the preconditions on the owner's install, write `tests/claude.test.ts` first and see it fail, then write `scripts/claude.mjs`. Do not run `npm install`. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). If a precondition or the knip check fails, write one line to `pr_info/.blocked.txt` and stop.
