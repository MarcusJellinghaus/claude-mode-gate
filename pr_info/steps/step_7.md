# Step 7: Launcher warning when Claude Code differs from the pin

One commit. `claude.bat` and `claude.sh` warn, and never stop, when the binary they start is not the version pinned in `package.json`. The fix the warning names is `claude install <version>`.

## WHERE

- `claude.bat`, `claude.sh`, `CHANGELOG.md`

## WHAT

- The pin comes from `package.json` (not `node_modules`, which a fresh clone lacks), read with `node -p "require('./package.json').devDependencies['@anthropic-ai/claude-code']"`.
- The installed version is the first word of `<binary> --version` (for example `2.1.326 (Claude Code)`), where `<binary>` is the one the launcher actually starts, never whatever `claude` is first on the PATH.
- The warning comes right after the screen clear at the top.

## ALGORITHM

```text
binary = the launcher's own path (claude.bat: C:\Users\%USERNAME%\.local\bin\claude.exe; claude.sh: $CLAUDE_BIN)
pin  = node -p <pin from package.json>        (empty on error)
have = first word of: binary --version         (empty on error)
if have != pin: print "WARNING: Claude Code <have or 'not found'> differs from the version pinned in package.json (<pin>). Fix: claude install <pin>"
continue as before
```

## HOW

- `claude.bat`: after `cls` and `setlocal enabledelayedexpansion`, set `CLAUDE_EXE=C:\Users\%USERNAME%\.local\bin\claude.exe` and use it in the launch line too, so check and launch use the same binary. Read both values with `for /f` (`tokens=1` for the version, `2^>nul` to drop errors) and compare with `if not "!CLAUDE_HAVE!"=="!CLAUDE_PIN!"`.
- `claude.sh`: move the `CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"` line up, right after `clear`; then `CLAUDE_PIN="$(node -p ... 2>/dev/null || true)"`, `CLAUDE_HAVE="$("$CLAUDE_BIN" --version 2>/dev/null | awk '{print $1}' || true)"`, and an `if [ "$CLAUDE_HAVE" != "$CLAUDE_PIN" ]` echo. Keep `set -u` safe (both variables always set).
- No unit test: no gate runs `.bat` or `.sh`. The owner checks the warning by hand (a matching and a differing version).

## DATA

None.

## Checks and commit

- `npm run format`, then `npm run check`.
- `CHANGELOG.md`: `claude.bat` and `claude.sh` warn when the Claude Code they start differs from the version pinned in `package.json`.
- `git_commit` with `paths`: `claude.bat`, `claude.sh`, `CHANGELOG.md`.
- Message: `chore(launcher): warn when Claude Code differs from the pin`

## LLM prompt

> Read `pr_info/steps/summary.md` and `pr_info/steps/step_7.md`. Implement step 7 only: add the version warning to `claude.bat` and `claude.sh`, comparing the binary each launcher starts with the pin read from `package.json`, and update the CHANGELOG. Follow `.claude/CLAUDE.md` (MCP tools, `npm run format` then `npm run check` before `git_commit` with `paths`). Do not run the launchers.
