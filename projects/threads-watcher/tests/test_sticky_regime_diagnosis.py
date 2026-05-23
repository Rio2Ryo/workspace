"""Tests for sticky_regime_diagnosis.py — operator decision tool.

Builds synthetic check histories in scratch sqlite DBs, runs the
diagnose helper, and asserts the verdict + reasoning matches the
documented sticky-regime semantics from sync_guards.recent_failures_guard.
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from sticky_regime_diagnosis import diagnose  # noqa: E402


def _make_db(tmp_path: Path) -> sqlite3.Connection:
    """Create a scratch DB with the minimal `checks` schema used by
    recent_failures_guard. id auto-increments via ROWID semantics —
    insert order = ordering."""
    db = tmp_path / "t.db"
    conn = sqlite3.connect(str(db))
    conn.executescript("""
        CREATE TABLE checks (
            id INTEGER PRIMARY KEY,
            checked_at TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL,
            error TEXT,
            found_count INTEGER NOT NULL DEFAULT 0,
            new_count INTEGER NOT NULL DEFAULT 0,
            handle TEXT NOT NULL DEFAULT '@x'
        );
    """)
    return conn


def _seed(conn, checks: list[tuple[str, str | None]]):
    for status, error in checks:
        conn.execute(
            "INSERT INTO checks (status, error) VALUES (?, ?)",
            (status, error),
        )
    conn.commit()


# ── verdict matrix ────────────────────────────────────────────────────


class TestDiagnoseVerdicts:
    def test_safe_to_enable_when_pure_sticky_regime(self, tmp_path):
        # 🔒 The headline win: 3 partial_error with same reason →
        # strict blocks, permissive permits → SAFE_TO_ENABLE.
        # Matches the empirical production scenario the flag was
        # designed for.
        conn = _make_db(tmp_path)
        reason = "profile extraction returned partial result: found=4 previous_max=15"
        _seed(conn, [
            ("partial_error", reason),
            ("partial_error", reason),
            ("partial_error", reason),
        ])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "SAFE_TO_ENABLE"
        assert result["strict_proceed"] is False
        assert result["permissive_proceed"] is True
        assert result["unique_error_reasons_count"] == 1

    def test_no_op_when_all_ok(self, tmp_path):
        # All OK → both guards permit → flag has no effect right now.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None), ("ok", None), ("ok", None)])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "NO_OP"
        assert result["strict_proceed"] is True
        assert result["permissive_proceed"] is True
        assert "already permits" in result["reason"]

    def test_no_op_when_mixed_statuses(self, tmp_path):
        # 🔒 The current production reality (2026-05-23): 23 partial_error
        # + 7 ok → strict blocks AND permissive blocks (not pure
        # sticky shape). Flag wouldn't help. Yakon decision data point.
        conn = _make_db(tmp_path)
        reason = "profile extraction returned partial result: found=4 previous_max=15"
        _seed(conn, [
            ("ok", None),
            ("partial_error", reason),
            ("partial_error", reason),
        ])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "NO_OP"
        assert result["strict_proceed"] is False
        assert result["permissive_proceed"] is False
        # 🔒 Reason explains WHY flag wouldn't help so operator
        # doesn't enable expecting effect.
        assert "isn't the pure sticky shape" in result["reason"]

    def test_no_op_when_partial_errors_have_different_reasons(self, tmp_path):
        # All partial_error but reasons differ → not the documented
        # sticky shape (could be transient instability).
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("partial_error", "reason A"),
            ("partial_error", "reason B"),
            ("partial_error", "reason A"),
        ])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "NO_OP"
        assert result["unique_error_reasons_count"] == 2

    def test_no_op_when_status_error_present(self, tmp_path):
        # Full 'error' (not partial) → real failure → block.
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("partial_error", "x"),
            ("error", "timeout"),
            ("partial_error", "x"),
        ])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "NO_OP"
        assert result["permissive_proceed"] is False

    def test_insufficient_data_when_window_exceeds_check_count(self, tmp_path):
        # Operator runs against fresh DB with < window checks.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)])
        result = diagnose(conn, window=3)
        assert result["verdict"] == "INSUFFICIENT_DATA"
        assert "1 check(s)" in result["reason"]


# ── distribution reporting ─────────────────────────────────────────────


class TestDistributionFields:
    def test_status_distribution_counts(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("ok", None), ("ok", None),
            ("partial_error", "r"),
        ])
        result = diagnose(conn, window=3)
        assert result["status_distribution"] == {"ok": 2, "partial_error": 1}

    def test_unique_error_reasons_dedup(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("partial_error", "A"),
            ("partial_error", "A"),
            ("partial_error", "B"),
        ])
        result = diagnose(conn, window=3)
        assert sorted(result["unique_error_reasons"]) == ["A", "B"]
        assert result["unique_error_reasons_count"] == 2

    def test_error_reason_distribution_counts_per_reason(self, tmp_path):
        # 🔒 Operator-UX gap closer: when 5/5 are partial_error but
        # verdict is NO_OP, operator needs per-reason count to
        # distinguish "dominant + 1 flake" from "true 3:2 bimodal
        # divergence". The unique_error_reasons list alone hides
        # this distinction.
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("partial_error", "found=4"),
            ("partial_error", "found=4"),
            ("partial_error", "found=4"),
            ("partial_error", "found=4"),
            ("partial_error", "found=6"),
        ])
        result = diagnose(conn, window=5)
        assert result["error_reason_distribution"] == {
            "found=4": 4,
            "found=6": 1,
        }
        # Sanity: classification still NO_OP (per-reason heterogeneity).
        assert result["verdict"] == "NO_OP"

    def test_error_reason_distribution_empty_when_all_ok(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None), ("ok", None), ("ok", None)])
        result = diagnose(conn, window=3)
        assert result["error_reason_distribution"] == {}


# ── CLI ────────────────────────────────────────────────────────────────


class TestCli:
    def _run(self, *args, cwd):
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "sticky_regime_diagnosis.py"), *args],
            cwd=str(cwd), capture_output=True, text=True, timeout=10,
        )

    def test_help_exits_zero(self, tmp_path):
        r = self._run("--help", cwd=tmp_path)
        assert r.returncode == 0
        assert "usage" in r.stdout.lower()

    def test_missing_db_exits_one(self, tmp_path):
        r = self._run("--db", str(tmp_path / "nope.db"), cwd=tmp_path)
        assert r.returncode == 1
        assert "not found" in r.stderr.lower()

    def test_invalid_window_exits_two(self, tmp_path):
        # Make a valid DB so we get past the DB existence check.
        conn = _make_db(tmp_path)
        conn.close()
        r = self._run("--db", str(tmp_path / "t.db"), "--window", "0", cwd=tmp_path)
        assert r.returncode == 2
        assert "must be > 0" in r.stderr.lower()

    def test_json_output_structure(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 3)
        conn.close()
        r = self._run("--db", str(tmp_path / "t.db"), "--json", "--window", "3", cwd=tmp_path)
        assert r.returncode == 0
        parsed = json.loads(r.stdout)
        assert parsed["verdict"] == "NO_OP"
        assert "status_distribution" in parsed
        assert parsed["window"] == 3

    def test_text_output_shows_verdict_and_distribution(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [
            ("partial_error", "r"), ("partial_error", "r"), ("partial_error", "r"),
        ])
        conn.close()
        r = self._run("--db", str(tmp_path / "t.db"), "--window", "3", cwd=tmp_path)
        assert r.returncode == 0
        assert "SAFE_TO_ENABLE" in r.stdout
        assert "🟢" in r.stdout
        assert "status distribution" in r.stdout


# ── --watch loop ──────────────────────────────────────────────────────


from sticky_regime_diagnosis import _watch_loop  # noqa: E402


class TestWatchLoop:
    """Mirror of TestWatchLoop from test_status_cli.py — sleep_fn
    injection drives the loop without real time.sleep."""

    def test_renders_each_tick_until_keyboard_interrupt(self, tmp_path, capsys):
        # 🔒 3 ticks then Ctrl+C → exit 0, 3 renders happened. Pin the
        # ANSI-clear-screen + diagnose cadence.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 3)
        conn.close()
        db_path = tmp_path / "t.db"

        calls = []
        def mock_sleep(seconds):
            calls.append(seconds)
            if len(calls) >= 3:
                raise KeyboardInterrupt

        rc = _watch_loop(
            db_path, window=3,
            interval=60, json_mode=False, sleep_fn=mock_sleep,
        )
        assert rc == 0
        out = capsys.readouterr().out
        # Verdict header appears once per tick.
        assert out.count("🟡 NO_OP") == 3, (
            f"Expected 3 renders, got {out.count('🟡 NO_OP')}"
        )
        assert calls == [60, 60, 60]

    def test_ansi_clear_screen_emitted_each_tick(self, tmp_path, capsys):
        # 🔒 tidy-pane invariant: \033[2J\033[H present each tick.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 3)
        conn.close()
        db_path = tmp_path / "t.db"

        def one_then_kbd(_secs):
            raise KeyboardInterrupt

        _watch_loop(
            db_path, window=3,
            interval=60, json_mode=False, sleep_fn=one_then_kbd,
        )
        out = capsys.readouterr().out
        assert "\033[2J" in out
        assert "\033[H" in out

    def test_db_error_mid_loop_does_not_crash(self, tmp_path, capsys):
        # 🔒 Operational realism: concurrent vacuum / lock / corruption
        # mid-watch should WARN + continue rather than crash the
        # operator's tmux pane. Force the failure by deleting the DB
        # file between first render and second sleep.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 3)
        conn.close()
        db_path = tmp_path / "t.db"

        calls = []
        def evil_sleep(seconds):
            calls.append(seconds)
            # Corrupt the DB file before the 2nd render. Writing
            # garbage causes sqlite3.DatabaseError on next connect.
            # NOTE: sqlite3 raises DatabaseError (not OperationalError)
            # for malformed files. Adjust the catch in _watch_loop or
            # use a different failure mode that yields OperationalError.
            # For now, use a lock-style failure: rename then restore.
            if len(calls) == 1:
                db_path.rename(db_path.with_suffix(".moved"))
            elif len(calls) == 2:
                # restore so the 3rd tick succeeds, then exit
                db_path.with_suffix(".moved").rename(db_path)
                raise KeyboardInterrupt

        # The rename causes connect to fail with OperationalError
        # ("unable to open database file"). Run and verify WARN
        # surfaced + loop continued.
        rc = _watch_loop(
            db_path, window=3,
            interval=60, json_mode=False, sleep_fn=evil_sleep,
        )
        assert rc == 0
        err = capsys.readouterr().err
        assert "WARN: diagnose tick failed" in err


class TestCliWatch:
    """CLI-level --watch invocation guards."""

    def test_invalid_interval_exits_two(self, tmp_path, capsys):
        # 🔒 Operator footgun guard (mirror of status.py).
        from sticky_regime_diagnosis import _cli_main
        conn = _make_db(tmp_path)
        conn.close()
        rc = _cli_main([
            "--db", str(tmp_path / "t.db"),
            "--watch", "--interval", "0",
        ])
        assert rc == 2
        err = capsys.readouterr().err
        assert "interval must be > 0" in err.lower()

    def test_interval_default_is_60(self, tmp_path, monkeypatch):
        # Default-value pin so a future help-text refactor that
        # silently changes the default trips here.
        import sticky_regime_diagnosis
        conn = _make_db(tmp_path)
        conn.close()
        captured = {}
        def fake_loop(db_path, window, *, interval, json_mode, sleep_fn=None):
            captured["interval"] = interval
            return 0
        monkeypatch.setattr(sticky_regime_diagnosis, "_watch_loop", fake_loop)
        rc = sticky_regime_diagnosis._cli_main([
            "--db", str(tmp_path / "t.db"), "--watch",
        ])
        assert rc == 0
        assert captured["interval"] == 60


# ── --recommendation mode (multi-window decision matrix) ───────────────


from sticky_regime_diagnosis import (  # noqa: E402
    RECOMMENDATION_WINDOWS, recommend,
)


class TestRecommendDecisionMatrix:
    """Pin the 4 verdict states: STRONG_ENABLE / CONDITIONAL_ENABLE /
    WAIT / INSUFFICIENT_DATA. Reduces operator burden by replacing
    "pick the right --window" with single recommendation."""

    def test_strong_enable_when_all_windows_safe(self, tmp_path):
        # 🔒 Pure sticky regime across enough history that ALL
        # RECOMMENDATION_WINDOWS (up to 30) see SAFE_TO_ENABLE.
        conn = _make_db(tmp_path)
        reason = "found=4 previous_max=15"
        _seed(conn, [("partial_error", reason)] * 35)
        result = recommend(conn)
        assert result["recommendation"] == "STRONG_ENABLE"
        # Every window evaluable + safe.
        assert result["safe_windows"] == list(RECOMMENDATION_WINDOWS)
        assert result["no_op_windows"] == []
        assert result["insufficient_windows"] == []

    def test_conditional_enable_when_recent_safe_but_history_mixed(self, tmp_path):
        # 🔒 Operator-realistic: last 3-5 checks are pure sticky,
        # but 10-30 window still has OK/error outliers from a few
        # hours ago. Operator's call on which horizon to trust.
        # Seed: 25 mixed history, then 5 pure sticky most recent.
        conn = _make_db(tmp_path)
        reason = "found=4 previous_max=15"
        # 25 mixed (OK + different partial reason) — these are OLDER
        _seed(conn, [("ok", None)] * 12 + [("partial_error", "different reason")] * 13)
        # 5 pure sticky MOST RECENT (higher id, returned first)
        _seed(conn, [("partial_error", reason)] * 5)
        result = recommend(conn)
        assert result["recommendation"] == "CONDITIONAL_ENABLE"
        # Small windows see only the recent sticky.
        assert 3 in result["safe_windows"]
        assert 5 in result["safe_windows"]
        # Large windows include the mixed history.
        assert 30 in result["no_op_windows"]

    def test_wait_when_no_window_is_safe(self, tmp_path):
        # Current production reality at multiple turns: regime is
        # mixed across all windows → WAIT, not enable.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 35)  # all OK = both guards permit
        # But "all OK" makes both strict + permissive permit — that's
        # NO_OP, not WAIT. Need a setup where strict blocks but
        # permissive ALSO blocks (mixed). Use error+ok mix.
        conn.executescript("DELETE FROM checks;")
        _seed(conn, [("partial_error", "A"), ("ok", None)] * 18)
        result = recommend(conn)
        assert result["recommendation"] == "WAIT"
        assert result["safe_windows"] == []
        # Larger windows hit NO_OP (block on both guards).
        assert len(result["no_op_windows"]) > 0

    def test_insufficient_data_when_db_too_fresh(self, tmp_path):
        # Smallest RECOMMENDATION_WINDOWS[0]=3 can't be evaluated →
        # whole recommendation = INSUFFICIENT_DATA.
        conn = _make_db(tmp_path)
        _seed(conn, [("ok", None)] * 2)  # only 2 checks
        result = recommend(conn)
        assert result["recommendation"] == "INSUFFICIENT_DATA"

    def test_recommendation_includes_per_window_verdicts(self, tmp_path):
        # 🔒 Operator visibility: the recommendation MUST surface
        # each window's individual verdict so operator can see the
        # evidence behind the unified recommendation.
        conn = _make_db(tmp_path)
        reason = "found=4 previous_max=15"
        _seed(conn, [("partial_error", reason)] * 35)
        result = recommend(conn)
        assert "per_window_verdict" in result
        for w in RECOMMENDATION_WINDOWS:
            assert w in result["per_window_verdict"]


class TestCliRecommendation:
    def _run(self, *args, cwd):
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "sticky_regime_diagnosis.py"), *args],
            cwd=str(cwd), capture_output=True, text=True, timeout=10,
        )

    def test_cli_emits_recommendation_text(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [("partial_error", "r")] * 35)
        conn.close()
        r = self._run(
            "--db", str(tmp_path / "t.db"), "--recommendation", cwd=tmp_path,
        )
        assert r.returncode == 0
        assert "STRONG_ENABLE" in r.stdout
        # Per-window block.
        assert "window= 3" in r.stdout
        assert "window=30" in r.stdout

    def test_cli_recommendation_json_shape(self, tmp_path):
        conn = _make_db(tmp_path)
        _seed(conn, [("partial_error", "r")] * 35)
        conn.close()
        r = self._run(
            "--db", str(tmp_path / "t.db"),
            "--recommendation", "--json", cwd=tmp_path,
        )
        assert r.returncode == 0
        parsed = json.loads(r.stdout)
        assert parsed["recommendation"] == "STRONG_ENABLE"
        assert "per_window_verdict" in parsed
        assert "rationale" in parsed
