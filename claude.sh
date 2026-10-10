#!/usr/bin/env bash
# Launcher for Claude Code with the mcp-workspace MCP server.
# Adapted from mcp-coder's claude.sh: this repo has no Python project env, so only the
# tool env (where mcp-workspace is installed) is discovered.
# Assumes you're running from the project root.

set -u
clear

# === Step 1: Tool env discovery ===
TOOL_VENV_BIN=""
if [ -n "${VIRTUAL_ENV:-}" ]; then
    TOOL_VENV_BIN="$VIRTUAL_ENV/bin"
else
    MCP_WORKSPACE_PATH="$(command -v mcp-workspace 2>/dev/null || true)"
    if [ -n "$MCP_WORKSPACE_PATH" ]; then
        TOOL_VENV_BIN="$(cd "$(dirname "$MCP_WORKSPACE_PATH")" && pwd)"
    fi
fi

if [ -z "$TOOL_VENV_BIN" ]; then
    echo "ERROR: Cannot find mcp-workspace installation."
    echo
    echo "Either:"
    echo "  1. Activate the tool environment: source path/to/tool/.venv/bin/activate"
    echo "  2. Ensure mcp-workspace is on your PATH: pip install mcp-workspace"
    exit 1
fi

# === Step 2: Set tool env variables ===
MCP_CODER_VENV_PATH="$TOOL_VENV_BIN"
MCP_CODER_VENV_DIR="$(cd "$MCP_CODER_VENV_PATH/.." && pwd)"

# === Step 3: MCP tool verification ===
if [ ! -x "$MCP_CODER_VENV_PATH/mcp-workspace" ]; then
    echo "ERROR: mcp-workspace not found in $MCP_CODER_VENV_PATH"
    echo "Please install it: pip install mcp-workspace"
    exit 1
fi
"$MCP_CODER_VENV_PATH/mcp-workspace" --version

# === Step 4: Set env vars and launch ===
export MCP_CODER_VENV_PATH
export MCP_CODER_VENV_DIR
export MCP_CODER_PROJECT_DIR="$PWD"
export DISABLE_AUTOUPDATER=1
export MCP_TIMEOUT=30000
export PATH="$MCP_CODER_VENV_PATH:$PATH"

# === Step 5: Platform-specific MCP config override ===
# .mcp.json is Windows-only (uses .exe, backslashes, ${USERPROFILE}, \Lib\).
MCP_CONFIG_OVERRIDE=""
case "$(uname)" in
    Darwin)
        if [ -f "$PWD/.mcp.macos.json" ]; then
            MCP_CONFIG_OVERRIDE="$PWD/.mcp.macos.json"
        fi
        ;;
    Linux)
        if [ -f "$PWD/.mcp.linux.json" ]; then
            MCP_CONFIG_OVERRIDE="$PWD/.mcp.linux.json"
        fi
        ;;
esac

echo "Starting Claude Code with:"
echo "  Tool env:     $MCP_CODER_VENV_PATH"
echo "  Project dir:  $MCP_CODER_PROJECT_DIR"
echo "  Venv dir:     $MCP_CODER_VENV_DIR"
if [ -n "$MCP_CONFIG_OVERRIDE" ]; then
    echo "  MCP config:   $MCP_CONFIG_OVERRIDE (platform override)"
else
    echo "  MCP config:   .mcp.json (default)"
fi

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
if [ -n "$MCP_CONFIG_OVERRIDE" ]; then
    exec "$CLAUDE_BIN" --mcp-config "$MCP_CONFIG_OVERRIDE" --strict-mcp-config "$@"
else
    exec "$CLAUDE_BIN" "$@"
fi
