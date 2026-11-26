"""Unit tests for tools/jenkins_watch.py (JenkinsClient and clock faked)."""

from __future__ import annotations

import importlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from mcp_coder.utils.jenkins_operations import BuildInfo, JenkinsError

_TOOL_DIR = Path(__file__).resolve().parents[2] / "tools"
if str(_TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOL_DIR))

jenkins_watch = importlib.import_module("jenkins_watch")

FAILING_LOG = "2026-11-26 18:04:00 - ERROR - LLM timed out\nFinished: FAILURE"

# Shape of an Executor log: the script source echoes the markers, then they run.
EXECUTOR_LOG = "\r\n".join(
    [
        "echo command execution  =====================================",  # 1
        "echo archive after execution =======================================",  # 2
        "2026-11-26 18:00:00 - ERROR - before the section",  # 3
        "C:\\env>echo command execution  ===================================== ",  # 4
        "",  # 5
        "command execution  =====================================",  # 6
        "2026-11-26 18:04:00 - ERROR - LLM timed out",  # 7
        "C:\\env>echo archive after execution ======================================= ",  # 8
        "",  # 9
        "archive after execution =======================================",  # 10
        "2026-11-26 18:04:00 - ERROR - LLM timed out",  # 11: Text Finder echo
        "Finished: FAILURE",  # 12
    ]
)


def build(number: int, status: str, name: str = "repo - #43 - implement") -> BuildInfo:
    return BuildInfo(
        job_path="Windows-Agents/Executor",
        folder="Windows-Agents",
        job_name="Executor",
        number=number,
        status=status,
        timestamp=datetime(2026, 11, 26, tzinfo=timezone.utc),
        duration_ms=None,
        url="",
        display_name=name,
    )


class FakeClock:
    """Monotonic clock that only moves when the watcher sleeps."""

    def __init__(self) -> None:
        self.now = 0.0

    def sleep(self, seconds: float) -> None:
        self.now += seconds

    def time(self) -> float:
        return self.now


def run_watch(
    client: MagicMock, tmp_path: Path, idle: float = 5, timeout: float = 60
) -> int:
    clock = FakeClock()
    options = jenkins_watch.Options(
        job="Windows-Agents/Executor",
        pattern=None,
        limit=30,
        interval=60,
        idle=idle,
        timeout=timeout,
        log_dir=tmp_path / "logs",
    )
    return int(jenkins_watch.watch(client, options, sleep=clock.sleep, now=clock.time))


def client_listing(*listings: list[BuildInfo]) -> MagicMock:
    """Client whose get_recent_builds returns the listings in turn, then the last forever."""
    client = MagicMock()
    queue = list(listings)
    client.get_recent_builds.side_effect = lambda **_: (
        queue.pop(0) if len(queue) > 1 else queue[0]
    )
    client.get_console_output.return_value = FAILING_LOG
    return client


def test_failed_build_is_a_problem_and_its_log_is_scanned(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = client_listing([build(1, "running")], [build(1, "failure")])
    assert run_watch(client, tmp_path) == 1
    client.get_console_output.assert_called_once_with("Windows-Agents/Executor", 1)
    assert (tmp_path / "logs" / "Executor_1.txt").read_text(encoding="utf-8") == FAILING_LOG
    out = capsys.readouterr().out
    assert "error 1, warning 0, decision 1" in out
    assert "1: 2026-11-26 18:04:00 - ERROR - LLM timed out" in out
    assert "RESULT: problem" in out


@pytest.mark.parametrize("status", ["unstable", "aborted"])
def test_unstable_and_aborted_are_problems(status: str, tmp_path: Path) -> None:
    client = client_listing([build(1, "running")], [build(1, status)])
    assert run_watch(client, tmp_path) == 1


def test_success_keeps_watching_until_idle(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = client_listing([build(1, "running")], [build(1, "success")])
    assert run_watch(client, tmp_path) == 0
    client.get_console_output.assert_called_once()
    assert "RESULT: idle" in capsys.readouterr().out


def test_new_build_keeps_watching(tmp_path: Path) -> None:
    client = client_listing(
        [build(1, "success")],
        [build(2, "running"), build(1, "success")],
        [build(2, "failure"), build(1, "success")],
    )
    assert run_watch(client, tmp_path) == 1


def test_timeout_scans_the_running_build_so_far(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = client_listing([build(1, "running")])
    assert run_watch(client, tmp_path, timeout=3) == 2
    client.get_console_output.assert_called_once_with("Windows-Agents/Executor", 1)
    assert "RESULT: timeout" in capsys.readouterr().out


def test_jenkins_errors_in_a_row_end_the_watch(tmp_path: Path) -> None:
    client = MagicMock()
    client.get_recent_builds.side_effect = [[build(1, "running")]] + [
        JenkinsError("down")
    ] * 3
    assert run_watch(client, tmp_path) == 3


def test_one_jenkins_error_is_retried(tmp_path: Path) -> None:
    client = MagicMock()
    client.get_recent_builds.side_effect = [
        [build(1, "running")],
        JenkinsError("blip"),
        [build(1, "failure")],
    ]
    client.get_console_output.return_value = ""
    assert run_watch(client, tmp_path) == 1


def test_changed_builds_reports_new_builds_and_status_changes() -> None:
    before = [build(1, "running"), build(2, "success")]
    after = [build(3, "running"), build(1, "failure"), build(2, "success")]
    changed = jenkins_watch.changed_builds(before, after)
    assert [b.number for b in changed] == [3, 1]


def test_renamed_build_is_not_a_change() -> None:
    changed = jenkins_watch.changed_builds(
        [build(1, "running", "#1")], [build(1, "running")]
    )
    assert changed == []


@pytest.mark.parametrize(
    ("repo", "expected"),
    [(None, " - #43 - "), ("a.b", r"^a\.b - #43 - ")],
)
def test_issue_pattern(repo: str | None, expected: str) -> None:
    assert jenkins_watch.issue_pattern(43, repo).pattern == expected


def test_scan_log_finds_errors_warnings_and_deciding_lines() -> None:
    log = "\n".join(
        [
            "2026-11-26 18:03:00 - INFO - starting",
            "2026-11-26 18:03:01 - WARNING - format_code is ignored",
            "Traceback (most recent call last):",
            "2026-11-26 18:04:00 - ERROR - LLM timed out",
            "Successfully updated issue #43 label: status-04:plan-review",
            "Finished: SUCCESS",
        ]
    )
    assert [(m.kind, m.line_number) for m in jenkins_watch.scan_log(log)] == [
        ("warning", 2),
        ("error", 3),
        ("error", 4),
        ("decision", 5),
        ("decision", 6),
    ]


def test_scan_log_ignores_ordinary_lines() -> None:
    assert jenkins_watch.scan_log("- INFO - all good\nno error here") == []


def test_scan_log_ignores_jenkins_text_finder_lines() -> None:
    log = "[Text Finder] Finished searching for pattern ' - ERROR - ' in console output."
    assert jenkins_watch.scan_log(log) == []


def test_command_section_uses_the_run_time_markers() -> None:
    assert jenkins_watch.command_section(EXECUTOR_LOG) == (6, 10)


def test_command_section_runs_to_the_end_without_an_end_marker() -> None:
    log = "start\ncommand execution  =====\nstill running"
    assert jenkins_watch.command_section(log) == (2, 3)


def test_command_section_is_none_without_a_start_marker() -> None:
    assert jenkins_watch.command_section("Finished: FAILURE") is None


def test_scan_log_limits_to_a_line_range() -> None:
    matches = jenkins_watch.scan_log(EXECUTOR_LOG, first=6, last=10)
    assert [m.line_number for m in matches] == [7]


def test_inspect_scans_the_command_section_and_keeps_line_endings(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = MagicMock()
    client.get_console_output.return_value = EXECUTOR_LOG
    jenkins_watch.inspect_log(client, "Windows-Agents/Executor", 1, tmp_path)
    assert (tmp_path / "Executor_1.txt").read_bytes() == EXECUTOR_LOG.encode("utf-8")
    out = capsys.readouterr().out
    assert "command section: lines 6-10" in out
    assert "error 1, warning 0, decision 0" in out


def test_inspect_scans_everything_without_a_command_section(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = MagicMock()
    client.get_console_output.return_value = FAILING_LOG
    jenkins_watch.inspect_log(client, "Windows-Agents/Executor", 1, tmp_path)
    out = capsys.readouterr().out
    assert "no command section" in out
    assert "error 1, warning 0, decision 1" in out


def test_inspect_option_scans_one_build_and_exits(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = MagicMock()
    client.get_console_output.return_value = EXECUTOR_LOG
    monkeypatch.setattr(jenkins_watch, "make_client", lambda: client)
    argv = ["--inspect", "7", "--job", "A/Executor", "--log-dir", str(tmp_path)]
    assert jenkins_watch.main(argv) == 0
    client.get_console_output.assert_called_once_with("A/Executor", 7)
    client.get_recent_builds.assert_not_called()
    assert "command section: lines 6-10" in capsys.readouterr().out


def test_repo_without_issue_exits_2() -> None:
    with pytest.raises(SystemExit) as exc_info:
        jenkins_watch.main(["--repo", "x"])
    assert exc_info.value.code == 2
