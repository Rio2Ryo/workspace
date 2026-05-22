"""Tests for process_post_capture — the pure orchestrator that wires
the retry helper, the DB write, and the log-routing for ONE post
inside watcher.run_once's loop.

Before this extraction, the wiring lived directly in run_once, so
verifying it required booting Chromium. A future refactor that dropped
the retry call, mis-passed retry results, or swallowed a DB-write
exception would have only surfaced in production. These tests pin the
exact contract between the helper and the loop.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher_pure import (  # noqa: E402
    CaptureOutcome,
    RetryPolicy,
    process_post_capture,
)


# ── Fixture-ish helpers ─────────────────────────────────────────────────


def _fake_captured(path_under_root: Path) -> dict:
    """Shape returned by watcher._screenshot_post."""
    return {
        "post_url": "https://www.threads.com/@hal.lifedesign/post/PID",
        "png": b"\x89PNGfake",
        "path": path_under_root,
        "width": 1280,
        "height": 1800,
    }


def _frozen_now(values: list[str]):
    """Returns a now_iso callable that yields the next list entry on each call."""
    it = iter(values)
    return lambda: next(it)


def _no_sleep(_s: float) -> None:
    return None


# ── Happy paths ─────────────────────────────────────────────────────────


def test_happy_path_new_post_inserted(tmp_path):
    captured = _fake_captured(tmp_path / "screenshots" / "x.png")
    save_calls: list[dict] = []

    outcome = process_post_capture(
        pid="PID1",
        handle="@hal.lifedesign",
        project_root=tmp_path,
        screenshot_fn=lambda: captured,
        save_fn=lambda **kw: save_calls.append(kw) or True,
        now_iso_fn=_frozen_now(["2026-05-18T10:00:00Z", "2026-05-18T10:00:01Z"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is True
    assert outcome.capture_error is None
    assert outcome.became_partial_error is False
    assert outcome.error_log == []
    assert len(outcome.info_log) == 1
    assert "[saved-db]" in outcome.info_log[0]
    assert "PID1" in outcome.info_log[0]
    assert "bytes=8" in outcome.info_log[0]

    # save_fn called once with the right kwargs
    assert len(save_calls) == 1
    call = save_calls[0]
    assert call["post_id"] == "PID1"
    assert call["handle"] == "@hal.lifedesign"
    assert call["first_seen_at"] == "2026-05-18T10:00:00Z"
    assert call["captured_at"] == "2026-05-18T10:00:01Z"
    assert call["local_path"] == "screenshots/x.png"  # relative to project_root


def test_duplicate_returns_skip_path(tmp_path):
    captured = _fake_captured(tmp_path / "screenshots" / "dup.png")

    outcome = process_post_capture(
        pid="DUP",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=lambda: captured,
        save_fn=lambda **kw: False,  # INSERT OR IGNORE → False on duplicate
        now_iso_fn=_frozen_now(["t1", "t2"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.capture_error is None
    assert outcome.became_partial_error is False
    assert outcome.error_log == []
    assert outcome.info_log == ["[skip] DUP already exists in DB"]


# ── Capture failure paths ───────────────────────────────────────────────


def test_capture_exhausts_retries_returns_partial_error(tmp_path):
    save_calls: list[dict] = []

    def always_fails():
        raise RuntimeError("threads timeout")

    outcome = process_post_capture(
        pid="DEAD",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=always_fails,
        save_fn=lambda **kw: save_calls.append(kw) or True,
        now_iso_fn=lambda: "t",
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.became_partial_error is True
    assert outcome.capture_error is not None
    assert "DEAD:" in outcome.capture_error
    assert "capture exhausted retries" in outcome.capture_error
    # All three attempts recorded
    assert outcome.capture_error.count("attempt") == 3
    assert outcome.info_log == []
    assert len(outcome.error_log) == 1
    assert "failed to capture DEAD after 3 attempt" in outcome.error_log[0]
    # Crucially: save_fn must NOT be called when capture failed.
    assert save_calls == []


def test_capture_retries_then_succeeds_includes_retry_note(tmp_path):
    captured = _fake_captured(tmp_path / "s.png")
    call_count = {"n": 0}

    def flaky():
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise RuntimeError(f"transient #{call_count['n']}")
        return captured

    outcome = process_post_capture(
        pid="RETRY",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=flaky,
        save_fn=lambda **kw: True,
        now_iso_fn=_frozen_now(["t1", "t2"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is True
    assert outcome.became_partial_error is False  # eventual success → not partial
    assert outcome.capture_error is None
    assert len(outcome.info_log) == 1
    # "(after 2 retry/retries)" annotation surfaces how many retries it took
    assert "(after 2 retry/retries)" in outcome.info_log[0]


def test_capture_non_retryable_exits_immediately(tmp_path):
    call_count = {"n": 0}

    def buggy():
        call_count["n"] += 1
        raise TypeError("bad arg")

    outcome = process_post_capture(
        pid="BUG",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=buggy,
        save_fn=lambda **kw: True,
        now_iso_fn=lambda: "t",
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.became_partial_error is True
    # Single attempt, not 3 — non-retryable exit
    assert call_count["n"] == 1
    assert outcome.capture_error.count("attempt") == 1


# ── DB-write failure path ───────────────────────────────────────────────


def test_db_write_exception_becomes_partial_error_not_capture_failure(tmp_path):
    captured = _fake_captured(tmp_path / "s.png")

    def bad_save(**_kw):
        raise RuntimeError("disk I/O error")

    outcome = process_post_capture(
        pid="DBFAIL",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=lambda: captured,
        save_fn=bad_save,
        now_iso_fn=_frozen_now(["t1", "t2"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.became_partial_error is True
    # Crucial: the error label distinguishes DB-write from capture failure
    # so audit-log readers can tell whether to retry the capture or the DB.
    assert outcome.capture_error is not None
    assert "db write failed" in outcome.capture_error
    assert "DBFAIL" in outcome.capture_error
    assert outcome.error_log == ["[error] DB write failed for DBFAIL: disk I/O error"]
    assert outcome.info_log == []


# ── Log routing & wiring contract ──────────────────────────────────────


def test_now_iso_called_exactly_twice_on_success(tmp_path):
    captured = _fake_captured(tmp_path / "s.png")
    times: list[str] = []

    def now_iso():
        # Return distinguishable timestamps so we can assert which call
        # produced first_seen_at vs captured_at.
        times.append(f"call-{len(times) + 1}")
        return times[-1]

    save_calls: list[dict] = []
    process_post_capture(
        pid="P",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=lambda: captured,
        save_fn=lambda **kw: save_calls.append(kw) or True,
        now_iso_fn=now_iso,
        sleep_fn=_no_sleep,
    )

    assert times == ["call-1", "call-2"]  # first_seen_at, then captured_at
    assert save_calls[0]["first_seen_at"] == "call-1"
    assert save_calls[0]["captured_at"] == "call-2"


def test_now_iso_called_once_when_capture_fails(tmp_path):
    """When capture fails, we never reach the captured_at timestamp."""
    calls = {"n": 0}

    def now_iso():
        calls["n"] += 1
        return "t"

    process_post_capture(
        pid="P",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=lambda: (_ for _ in ()).throw(RuntimeError("boom")),
        save_fn=lambda **kw: True,
        now_iso_fn=now_iso,
        sleep_fn=_no_sleep,
    )

    # first_seen_at only — never reaches the captured_at call site
    assert calls["n"] == 1


def test_local_path_is_relative_to_project_root(tmp_path):
    # The local_path stored in DB must be project-relative so the same
    # row stays portable across machines (no /Users/x/... absolute leaks).
    nested = tmp_path / "screenshots" / "@hal.lifedesign" / "deep" / "P.png"
    captured = _fake_captured(nested)
    save_calls: list[dict] = []

    process_post_capture(
        pid="P",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=lambda: captured,
        save_fn=lambda **kw: save_calls.append(kw) or True,
        now_iso_fn=lambda: "t",
        sleep_fn=_no_sleep,
    )

    assert save_calls[0]["local_path"] == "screenshots/@hal.lifedesign/deep/P.png"
    # Defensive: never starts with project_root absolute prefix
    assert not save_calls[0]["local_path"].startswith(str(tmp_path))


def test_retry_policy_is_threaded_through(tmp_path):
    """A custom retry policy must reach capture_with_retry — not be silently
    replaced by the default. Pin by using max_attempts=1 (no retry) and a
    flaky callable: with max=1 we MUST see exactly 1 attempt."""
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        raise RuntimeError("x")

    outcome = process_post_capture(
        pid="P",
        handle="@x",
        project_root=tmp_path,
        screenshot_fn=flaky,
        save_fn=lambda **kw: True,
        now_iso_fn=lambda: "t",
        retry_policy=RetryPolicy(max_attempts=1),
        sleep_fn=_no_sleep,
    )

    assert calls["n"] == 1
    assert outcome.capture_error.count("attempt") == 1


def test_capture_outcome_is_immutable():
    # Frozen dataclass — defensive against a future refactor that mutates
    # the outcome between collection and replay.
    outcome = CaptureOutcome(
        new_inserted=True,
        capture_error=None,
        became_partial_error=False,
    )
    with pytest.raises((AttributeError, Exception)):
        outcome.new_inserted = False  # type: ignore[misc]


# ── On-disk capture-file cleanup ────────────────────────────────────────
#
# Playwright writes the captured PNG to `out_dir / {post_id}__{ts}.png`
# inside the project's `screenshots/` directory. Until this turn the
# file was never deleted — even though save_post_screenshot stores the
# bytes as a DB BLOB and nothing downstream reads local_path. Live
# deploy was at 47 MB across ~100 orphans per handle. process_post_
# capture now drops the file after a successful DB write, and keeps
# it on a DB-write exception (the orphan is debug evidence
# correlatable with the error_log line).


def test_capture_file_is_unlinked_after_successful_insert(tmp_path):
    capture_path = tmp_path / "screenshots" / "PID_cleanup.png"
    capture_path.parent.mkdir(parents=True)
    capture_path.write_bytes(b"\x89PNG-payload")

    outcome = process_post_capture(
        pid="PID_cleanup",
        handle="@hal.lifedesign",
        project_root=tmp_path,
        screenshot_fn=lambda: _fake_captured(capture_path),
        save_fn=lambda **_: True,
        now_iso_fn=_frozen_now(["t0", "t1"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is True
    assert not capture_path.exists()


def test_capture_file_is_unlinked_when_db_reports_duplicate(tmp_path):
    # save_fn returns False for an already-seen post. The capture file
    # is just as orphan in that case — the DB BLOB is already there —
    # so it should be dropped too.
    capture_path = tmp_path / "screenshots" / "PID_dup.png"
    capture_path.parent.mkdir(parents=True)
    capture_path.write_bytes(b"\x89PNG-dup")

    outcome = process_post_capture(
        pid="PID_dup",
        handle="@hal.lifedesign",
        project_root=tmp_path,
        screenshot_fn=lambda: _fake_captured(capture_path),
        save_fn=lambda **_: False,
        now_iso_fn=_frozen_now(["t0", "t1"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.capture_error is None
    assert not capture_path.exists()


def test_capture_file_is_kept_when_db_write_raises(tmp_path):
    # On DB-write exception the file is kept so an operator can
    # correlate the on-disk orphan with the error_log line.
    capture_path = tmp_path / "screenshots" / "PID_dberr.png"
    capture_path.parent.mkdir(parents=True)
    capture_path.write_bytes(b"\x89PNG-dberr")

    def boom(**_):
        raise RuntimeError("simulated D1 outage")

    outcome = process_post_capture(
        pid="PID_dberr",
        handle="@hal.lifedesign",
        project_root=tmp_path,
        screenshot_fn=lambda: _fake_captured(capture_path),
        save_fn=boom,
        now_iso_fn=_frozen_now(["t0", "t1"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is False
    assert outcome.became_partial_error is True
    assert "db write failed" in (outcome.capture_error or "")
    # Orphan deliberately preserved as debug evidence.
    assert capture_path.exists()
    assert capture_path.read_bytes() == b"\x89PNG-dberr"


def test_unlink_swallows_missing_file_after_save(tmp_path):
    # The cleanup must be defensive — a test that doesn't actually
    # write the file (or a file that vanished between capture and
    # save) must not turn a successful run into an error.
    capture_path = tmp_path / "screenshots" / "PID_never_written.png"
    capture_path.parent.mkdir(parents=True)
    # NOT writing the file.

    outcome = process_post_capture(
        pid="PID_never_written",
        handle="@hal.lifedesign",
        project_root=tmp_path,
        screenshot_fn=lambda: _fake_captured(capture_path),
        save_fn=lambda **_: True,
        now_iso_fn=_frozen_now(["t0", "t1"]),
        sleep_fn=_no_sleep,
    )

    assert outcome.new_inserted is True
