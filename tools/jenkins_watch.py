#!/usr/bin/env python3
"""Watch Jenkins builds and exit when something needs a look.

First reports the current state: the running builds, else the newest build;
if that one ended badly, it exits at once (skip with --watch-only). Then polls
the newest builds, of one issue or of all, and prints new builds and status
changes. Each finished build, and on timeout each running build, gets
its console log saved and scanned for errors, warnings and the lines that
decide a workflow step. A successful build does not end the watch. All Jenkins
logic lives in ``mcp_coder.utils.jenkins_operations``, so run it with a Python
that has mcp-coder installed (the launcher's tool env); the script itself uses
only the standard library besides that.

Exit codes:
    0  idle: no build ran for --idle minutes
    1  problem: a build ended failure, unstable or aborted
    2  timeout: --timeout minutes passed
    3  Jenkins could not be read, or it is not configured

The scan covers the mcp-coder command's output, between the Executor's
"command execution ===" and "archive after execution ===" lines, and prints
that line range so a reader can open just that part of the saved log.

Usage:
    python tools/jenkins_watch.py [--issue N [--repo NAME]] [--job PATH]
        [--interval SECONDS] [--idle MINUTES] [--timeout MINUTES]
    python tools/jenkins_watch.py --inspect BUILD_NUMBER [--job PATH]
"""

import argparse
import re
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from mcp_coder.utils.jenkins_operations import BuildInfo, JenkinsClient, JenkinsError
from mcp_coder.utils.jenkins_operations.client import get_jenkins_config
from mcp_coder.utils.user_config import load_config

PROBLEM_STATUSES = frozenset({"failure", "unstable", "aborted"})
MAX_PRINTED_MATCHES = 25
MAX_JENKINS_ERRORS = 3
# Jenkins' Text Finder plugin quotes the patterns it searched for, " - ERROR - " included.
IGNORED_PREFIX = "[Text Finder]"
# The Executor script echoes these around the mcp-coder command. Anchored, so the
# echoed script source ("echo command execution ...") does not match.
SECTION_START = re.compile(r"^command execution\s+=+\s*$")
SECTION_END = re.compile(r"^archive after execution\s+=+\s*$")

LOG_PATTERNS = (
    (
        "error",
        re.compile(r" - (ERROR|CRITICAL) - |^ERROR:|Traceback \(most recent call last\)"),
    ),
    ("warning", re.compile(r" - WARNING - ")),
    (
        "decision",
        re.compile(
            r"Blocked marker found:|REVIEW HANDED OFF|Successfully updated issue #\d+ label:"
            r"|Skipped set-status|Workflow failed|^Finished: "
        ),
    ),
)


@dataclass(frozen=True)
class Options:
    """What to watch and for how long. Intervals in seconds, idle and timeout in minutes."""

    job: str | None
    pattern: re.Pattern[str] | None
    limit: int
    interval: float
    idle: float
    timeout: float
    log_dir: Path
    watch_only: bool = False


@dataclass(frozen=True)
class LogMatch:
    """One log line worth a look."""

    kind: str
    line_number: int
    text: str


def issue_pattern(issue: int, repo: str | None) -> re.Pattern[str]:
    """Return the display-name regex for one issue.

    Executor builds are named ``<repo> - #<issue> - <step> - #<build>``.

    Args:
        issue: Issue number
        repo: Repository name as in the display name, or None for any repo

    Returns:
        The compiled pattern
    """
    prefix = f"^{re.escape(repo)}" if repo else ""
    return re.compile(f"{prefix} - #{issue} - ")


def changed_builds(previous: list[BuildInfo], current: list[BuildInfo]) -> list[BuildInfo]:
    """Return the builds that are new or changed status.

    Keyed on job and number: the display name changes once a build gets an agent.

    Args:
        previous: Builds of the last poll
        current: Builds of this poll

    Returns:
        Changed builds, in the order of ``current``
    """
    status_before = {(b.job_path, b.number): b.status for b in previous}
    return [b for b in current if status_before.get((b.job_path, b.number)) != b.status]


def command_section(log: str) -> tuple[int, int] | None:
    """Return the lines of the mcp-coder command's output in an Executor log.

    Args:
        log: Console log text

    Returns:
        First and last line number (1-based, the markers included); the last is
        the end of the log while the build runs or after a crash. None when the
        command never started.
    """
    lines = log.splitlines()
    start = next((i for i, text in enumerate(lines) if SECTION_START.match(text)), None)
    if start is None:
        return None
    end = next(
        (i for i in range(start + 1, len(lines)) if SECTION_END.match(lines[i])),
        len(lines) - 1,
    )
    return start + 1, end + 1


def scan_log(log: str, first: int = 1, last: int | None = None) -> list[LogMatch]:
    """Find the errors, warnings and deciding lines in a console log.

    Args:
        log: Console log text
        first: First line number to scan (1-based)
        last: Last line number to scan, None for the end of the log

    Returns:
        Matches in log order; each line counts once, under its first kind
    """
    matches = []
    for line_number, text in enumerate(log.splitlines(), start=1):
        if line_number < first or (last is not None and line_number > last):
            continue
        if text.startswith(IGNORED_PREFIX):
            continue
        kind = next((k for k, regex in LOG_PATTERNS if regex.search(text)), None)
        if kind is not None:
            matches.append(LogMatch(kind, line_number, text))
    return matches


def say(message: str) -> None:
    """Print a timestamped line; flushed so a background run's output file stays current."""
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def describe(build: BuildInfo) -> str:
    """Return a one-line summary of a build."""
    return f"{build.status:<8} #{build.number}  {build.display_name}"


def inspect_log(client: JenkinsClient, job_path: str, number: int, log_dir: Path) -> None:
    """Save a build's console log (so far, if it still runs) and print what the scan found.

    Args:
        client: Jenkins client
        job_path: Full job path, e.g. "Windows-Agents/Executor"
        number: Build number
        log_dir: Directory for the log file
    """
    target = log_dir / f"{job_path.rsplit('/', 1)[-1]}_{number}.txt"
    try:
        text = client.get_console_output(job_path, number)
        log_dir.mkdir(parents=True, exist_ok=True)
        # newline="": the log already has CRLF; text mode would write CR CR LF on Windows.
        target.write_text(text, encoding="utf-8", newline="")
    except (JenkinsError, OSError) as e:
        print(f"  log download failed: {e}", flush=True)
        return
    section = command_section(text)
    if section is None:
        where = "no command section, whole log scanned"
        matches = scan_log(text)
    else:
        where = f"command section: lines {section[0]}-{section[1]}"
        matches = scan_log(text, *section)
    counts = ", ".join(
        f"{kind} {sum(m.kind == kind for m in matches)}" for kind, _ in LOG_PATTERNS
    )
    print(f"  log: {target} ({len(text.splitlines())} lines; {where}; {counts})")
    for match in matches[:MAX_PRINTED_MATCHES]:
        print(f"  {match.line_number:>6}: {match.text[:200]}")
    if len(matches) > MAX_PRINTED_MATCHES:
        print(f"  ... {len(matches) - MAX_PRINTED_MATCHES} more, see the log file")
    sys.stdout.flush()


def watch(
    client: JenkinsClient,
    options: Options,
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], float] = time.monotonic,
) -> int:
    """Poll until a build ends badly, nothing runs for a while, or time runs out.

    Args:
        client: Jenkins client
        options: What to watch and for how long
        sleep: Sleep function, replaced in tests
        now: Monotonic clock in seconds, replaced in tests

    Returns:
        Exit code, see the module docstring

    Raises:
        JenkinsError: If the first listing fails
    """

    def list_builds() -> list[BuildInfo]:
        return client.get_recent_builds(
            limit=options.limit, path=options.job, name_pattern=options.pattern
        )

    def running(builds: list[BuildInfo]) -> list[BuildInfo]:
        return [b for b in builds if b.status == "running"]

    start = last_active = now()
    jenkins_errors = 0
    previous = list_builds()
    for build in running(previous):
        say(describe(build))
    if not options.watch_only and previous and not running(previous):
        newest = previous[0]
        say(f"newest {describe(newest)}")
        if newest.status in PROBLEM_STATUSES:
            inspect_log(client, newest.job_path, newest.number, options.log_dir)
            say("RESULT: problem")
            return 1
    target = options.pattern.pattern if options.pattern else "all builds"
    say(f"watching {target} in {options.job or 'the whole server'}; {len(previous)} builds known")

    while True:
        if running(previous):
            last_active = now()
        if now() - start >= options.timeout * 60:
            for build in running(previous):
                say(f"still {describe(build)}")
                inspect_log(client, build.job_path, build.number, options.log_dir)
            say("RESULT: timeout")
            return 2
        if now() - last_active >= options.idle * 60:
            newest = f"; newest {describe(previous[0])}" if previous else ""
            say(f"RESULT: idle{newest}")
            return 0

        sleep(options.interval)
        try:
            current = list_builds()
            jenkins_errors = 0
        except JenkinsError as e:
            say(f"Jenkins error: {e}")
            jenkins_errors += 1
            if jenkins_errors >= MAX_JENKINS_ERRORS:
                say("RESULT: jenkins-error")
                return 3
            continue

        changed = changed_builds(previous, current)
        for build in changed:
            say(describe(build))
            if build.status != "running":
                inspect_log(client, build.job_path, build.number, options.log_dir)
        previous = current
        if any(b.status in PROBLEM_STATUSES for b in changed):
            say("RESULT: problem")
            return 1


def configured_executor_job() -> str | None:
    """Return the executor_job_path shared by all coordinator repos, else None."""
    repos = load_config().get("coordinator", {}).get("repos", {})
    paths = {r.get("executor_job_path") for r in repos.values() if isinstance(r, dict)}
    jobs = sorted(p for p in paths if isinstance(p, str) and p.strip())
    return jobs[0] if len(jobs) == 1 else None


def make_client() -> JenkinsClient | None:
    """Create a JenkinsClient from the configuration, or print what is missing."""
    config = get_jenkins_config()
    names = {"server_url": "JENKINS_URL", "username": "JENKINS_USER", "api_token": "JENKINS_TOKEN"}
    missing = [env for key, env in names.items() if config.get(key) is None]
    if missing:
        print(f"Jenkins not configured: missing {', '.join(missing)}.", file=sys.stderr)
        return None
    return JenkinsClient(
        str(config["server_url"]), str(config["username"]), str(config["api_token"])
    )


def positive_float(value: str) -> float:
    """Parse a positive number for argparse."""
    try:
        number = float(value)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"invalid number: '{value}'") from e
    if number <= 0:
        raise argparse.ArgumentTypeError(f"must be positive, got {value}")
    return number


def main(argv: list[str] | None = None) -> int:
    """Run the tool.

    Args:
        argv: Command-line arguments (default: sys.argv[1:])

    Returns:
        Exit code, see the module docstring
    """
    parser = argparse.ArgumentParser(description="Watch Jenkins builds.")
    parser.add_argument("--issue", type=int, help="watch one issue's builds (default: all)")
    parser.add_argument("--repo", help="repo name in the display name; needs --issue")
    parser.add_argument(
        "--job", help="job or folder path (default: the configured executor job)"
    )
    parser.add_argument("--limit", type=int, default=30, help="newest N builds (default: 30)")
    parser.add_argument("--interval", type=positive_float, default=120, help="seconds (default: 120)")
    parser.add_argument("--idle", type=positive_float, default=20, help="minutes (default: 20)")
    parser.add_argument("--timeout", type=positive_float, default=90, help="minutes (default: 90)")
    parser.add_argument(
        "--log-dir", type=Path, default=Path(".scratch/jenkins"), help="(default: .scratch/jenkins)"
    )
    parser.add_argument(
        "--inspect", type=int, metavar="N", help="only save and scan build N's log, then exit"
    )
    parser.add_argument(
        "--watch-only",
        action="store_true",
        help="skip the initial check of the newest build, e.g. right after a retry",
    )
    args = parser.parse_args(argv)
    if args.repo and args.issue is None:
        parser.error("--repo needs --issue")
    job = args.job or configured_executor_job()
    if args.inspect is not None and job is None:
        parser.error("--inspect needs --job (no single executor job configured)")

    client = make_client()
    if client is None:
        return 3
    if args.inspect is not None:
        inspect_log(client, job, args.inspect, args.log_dir)
        return 0
    options = Options(
        job=job,
        pattern=issue_pattern(args.issue, args.repo) if args.issue is not None else None,
        limit=args.limit,
        interval=args.interval,
        idle=args.idle,
        timeout=args.timeout,
        log_dir=args.log_dir,
        watch_only=args.watch_only,
    )
    try:
        return watch(client, options)
    except JenkinsError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    # Logs hold non-ASCII ("→"); a Windows console's cp1252 stdout would raise on them.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.exit(main())
