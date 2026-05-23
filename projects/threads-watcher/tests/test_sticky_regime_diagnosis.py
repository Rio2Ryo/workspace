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
