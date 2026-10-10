@echo off
cls
setlocal enabledelayedexpansion
REM Launcher for Claude Code with the mcp-workspace MCP server.
REM Adapted from mcp-coder's claude.bat: this repo has no Python project env, so only the
REM tool env (where mcp-coder / mcp-workspace is installed) is discovered.
REM Assumes you're running from the project root.

REM === Step 1: Tool env discovery ===
set "TOOL_VENV_SCRIPTS="

if "!VIRTUAL_ENV!"=="" goto :discover_from_path

REM VIRTUAL_ENV is set: assume it is the tool env
set "TOOL_VENV_SCRIPTS=!VIRTUAL_ENV!\Scripts"
goto :tool_env_found

:discover_from_path
for /f "delims=" %%i in ('where mcp-workspace 2^>nul') do (
    if "!TOOL_VENV_SCRIPTS!"=="" (
        set "TOOL_VENV_SCRIPTS=%%~dpi"
        if "!TOOL_VENV_SCRIPTS:~-1!"=="\" set "TOOL_VENV_SCRIPTS=!TOOL_VENV_SCRIPTS:~0,-1!"
    )
)
if "!TOOL_VENV_SCRIPTS!"=="" (
    echo ERROR: Cannot find mcp-workspace installation.
    echo.
    echo Either:
    echo   1. Activate the tool environment: path\to\tool\.venv\Scripts\activate.bat
    echo   2. Ensure mcp-workspace is on your PATH: pip install mcp-workspace
    exit /b 1
)

:tool_env_found
REM === Step 2: Set tool env variables ===
set "MCP_CODER_VENV_PATH=!TOOL_VENV_SCRIPTS!"
for %%d in ("!MCP_CODER_VENV_PATH!\..") do set "MCP_CODER_VENV_DIR=%%~fd"

REM === Step 3: MCP tool verification ===
if not exist "!MCP_CODER_VENV_PATH!\mcp-workspace.exe" (
    echo ERROR: mcp-workspace.exe not found in !MCP_CODER_VENV_PATH!
    echo Please install it: pip install mcp-workspace
    exit /b 1
)
"!MCP_CODER_VENV_PATH!\mcp-workspace.exe" --version

REM === Step 4: Set env vars and launch ===
set "MCP_CODER_PROJECT_DIR=%CD%"
set "DISABLE_AUTOUPDATER=1"
set "MCP_TIMEOUT=30000"
set "PATH=!MCP_CODER_VENV_PATH!;!PATH!"

echo Starting Claude Code with:
echo   Tool env:     !MCP_CODER_VENV_PATH!
echo   Project dir:  !MCP_CODER_PROJECT_DIR!
echo   Venv dir:     !MCP_CODER_VENV_DIR!

C:\Users\%USERNAME%\.local\bin\claude.exe %*

REM Reset terminal state after Claude exits (workaround for dirty terminal bug)
REM See https://github.com/anthropics/claude-code/issues/38761
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
<nul set /p="!ESC![?2004l!ESC![?1l!ESC![?25h!ESC![J"
