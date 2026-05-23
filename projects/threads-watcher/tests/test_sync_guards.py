"""Tests for sync_guards — the pure-Python ports of sync.sh.example gates.

Each test exercises a single guard in isolation, plus integration tests
that run `evaluate_all` against an in-memory DB and synthetic snapshots
to verify short-circuit ordering and total decision shape.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import init_db, record_check  # noqa: E402
from sync_guards import (  # noqa: E402
    BAD_CHECK_STATUSES,
    DEFAULT_COMMIT_MIN_GAP_SEC,
    DEFAULT_RECENT_CHECKS_WINDOW,
    KNOWN_BLOCKER_KINDS,
    OUTCOME_EVENTS,
    GuardDecision,
    SyncDecision,
    commit_gap_guard,
    detect_delta,
    evaluate_all,
    format_outcome_event,
    recent_failures_guard,
    snapshot_sanity_check,
)


# ── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    init_db(c)
    yield c
    c.close()


def _add_check(conn: sqlite3.Connection, status: str, error: str | None = None) -> None:
    record_check(
        conn,
        handle="@hal.lifedesign",
        checked_at="2026-05-17T22:00:00Z",
        found_count=15 if status == "ok" else 0,
        new_count=0,
        status=status,
        error=error,
    )


def _write_snapshot(path: Path, posts: list[dict]) -> None:
    path.write_text(json.dumps({"posts": posts, "handle": "@hal.lifedesign"}), encoding="utf-8")


# ── detect_delta ─────────────────────────────────────────────────────────


def test_delta_guard_skips_when_db_max_equals_cursor():
    d = detect_delta(current_max=42, last_cursor=42)
    assert not d.proceed
    assert "no delta" in d.reason


def test_delta_guard_skips_when_db_max_below_cursor():
    # Possible if DB was wiped & rebuilt; cursor file would be stale.
    d = detect_delta(current_max=10, last_cursor=42)
    assert not d.proceed


def test_delta_guard_proceeds_when_strictly_greater():
    d = detect_delta(current_max=50, last_cursor=42)
    assert d.proceed
    assert "delta=8" in d.reason


def test_delta_guard_first_run_proceeds_with_any_posts():
    d = detect_delta(current_max=1, last_cursor=0)
    assert d.proceed


def test_delta_guard_tolerates_negative_cursor_file():
    # Corrupted cursor should not push past zero.
    d = detect_delta(current_max=5, last_cursor=-7)
    assert d.proceed
    assert "delta=5" in d.reason


# ── recent_failures_guard ────────────────────────────────────────────────


def test_recent_failures_proceeds_when_no_history(conn):
    d = recent_failures_guard(conn)
    assert d.proceed
    assert "ok" in d.reason  # "(statuses=<none>)" path


def test_recent_failures_proceeds_when_all_ok(conn):
    for _ in range(3):
        _add_check(conn, "ok")
    d = recent_failures_guard(conn)
    assert d.proceed


def test_recent_failures_skips_on_explicit_error(conn):
    _add_check(conn, "ok")
    _add_check(conn, "ok")
    _add_check(conn, "error", "DOM regression")
    d = recent_failures_guard(conn)
    assert not d.proceed


def test_recent_failures_skips_on_partial_error(conn):
    # Mirrors shell's substring match — partial_error contains 'error'.
    _add_check(conn, "ok")
    _add_check(conn, "partial_error", "abc: timeout")
    _add_check(conn, "ok")
    d = recent_failures_guard(conn)
    assert not d.proceed


def test_recent_failures_only_inspects_window(conn):
    # An old error outside the window must not trigger a skip.
    _add_check(conn, "error", "old")
    for _ in range(3):
        _add_check(conn, "ok")
    d = recent_failures_guard(conn, window=3)
    assert d.proceed


# ── recent_failures_guard: sticky-partial-error-regime opt-in ────────────
#
# Why this exists
# ---------------
# Observed 2026-05-23: 28 of 30 recent checks were `partial_error` with
# the IDENTICAL reason "profile extraction returned partial result:
# found=4 previous_max=15". The strict guard treats that as a failure
# every tick → sync was blocked for days while the dashboard went
# stale. The sticky-regime escape valve recognises that signature
# (all-same partial_error in the window) as a stable state and lets
# the snapshot publish through, so operators see the current reality
# instead of an indefinite stale snapshot.
#
# Default off — every existing caller without the kwarg sees the
# original strict behaviour (already pinned by the tests above).


# A common partial_error reason used across the sticky-regime tests.
_HAL_PARTIAL = "profile extraction returned partial result: found=4 previous_max=15"


def test_sticky_regime_default_off_still_blocks(conn):
    # Belt-and-braces: even with all-same partial_error, the DEFAULT
    # behaviour (no kwarg passed) must remain "block". Catches an
    # accidental flip of the default to True.
    for _ in range(3):
        _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn)  # no kwarg
    assert not d.proceed, (
        "Default behaviour MUST remain strict — sticky-regime is opt-in"
    )


def test_sticky_regime_opt_in_allows_uniform_partial_error(conn):
    # The exact production scenario: window=3, every row is the same
    # partial_error shape → with opt-in, guard allows the publish.
    for _ in range(3):
        _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
    assert d.proceed, (
        f"Sticky partial_error regime should permit publish under opt-in. "
        f"Got reason={d.reason!r}"
    )
    assert "sticky partial_error regime" in d.reason
    # The reason string surfaces the regime for the operator log so
    # they can see WHY the guard passed despite no 'ok' check.
    assert "found=4 previous_max=15" in d.reason


def test_sticky_regime_blocks_when_reasons_differ(conn):
    # Opt-in ON but error strings differ → NOT a stable regime, block.
    # Pin: a mix of "found=4" and "found=2" partial_errors means the
    # scraping result is itself unstable — publishing now would freeze
    # a noisy state.
    _add_check(conn, "partial_error", "found=4 previous_max=15")
    _add_check(conn, "partial_error", "found=2 previous_max=15")
    _add_check(conn, "partial_error", "found=4 previous_max=15")
    d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
    assert not d.proceed, "Mixed partial_error reasons must NOT be treated as sticky"


def test_sticky_regime_blocks_when_mixed_with_ok(conn):
    # Opt-in ON but not ALL recent are partial_error (one 'ok' in the
    # mix) → fall through to strict, block. The sticky-regime
    # recognition requires uniformity.
    _add_check(conn, "ok")
    _add_check(conn, "partial_error", _HAL_PARTIAL)
    _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
    assert not d.proceed, "Partial_error + ok mix must NOT be sticky regime"


def test_sticky_regime_blocks_when_any_full_error_present(conn):
    # 🔒 Critical safety: even under opt-in, a full status='error' (not
    # partial_error) must ALWAYS block. Sticky-regime is only for the
    # "scraping works at a lower count" shape, not for "scraping
    # broke entirely". Without this guard a real outage would publish.
    _add_check(conn, "partial_error", _HAL_PARTIAL)
    _add_check(conn, "error", "playwright timeout")
    _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
    assert not d.proceed, (
        "Full 'error' status must ALWAYS block — sticky-regime is "
        "partial_error-only"
    )


def test_sticky_regime_requires_full_window(conn):
    # Opt-in ON but window=3 and only 2 partial_error rows exist
    # (DB hasn't accumulated 3 checks yet) → not enough evidence
    # to declare a stable regime. Block.
    for _ in range(2):
        _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn, window=3, allow_sticky_partial_error_regime=True)
    assert not d.proceed, (
        "Sticky regime requires the FULL window of rows; fewer = "
        "insufficient evidence"
    )


def test_sticky_regime_rejects_empty_error_string(conn):
    # Defensive: if `error` is the empty string (NOT NULL but empty),
    # all-same uniformity is trivially true but the operator has no
    # diagnostic. Treat empty as "no regime signature available" and
    # fall through to the strict path so the operator sees the block
    # and investigates.
    for _ in range(3):
        _add_check(conn, "partial_error", "")
    d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
    assert not d.proceed, "Empty error string must not satisfy sticky regime"


def test_sticky_regime_with_larger_window(conn):
    # Pin behaviour across non-default windows: window=5 with 5 uniform
    # partial_error rows still passes. Makes future tunability of the
    # default safe.
    for _ in range(5):
        _add_check(conn, "partial_error", _HAL_PARTIAL)
    d = recent_failures_guard(conn, window=5, allow_sticky_partial_error_regime=True)
    assert d.proceed


def test_evaluate_all_threads_sticky_regime_flag_through(conn, tmp_path):
    # The opt-in kwarg must reach recent_failures_guard via evaluate_all
    # (not just be silently dropped). End-to-end: with the flag ON and
    # all-same partial_error rows + a clean snapshot, the composite
    # decision proceeds.
    for _ in range(3):
        _add_check(conn, "partial_error", _HAL_PARTIAL)
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])  # clean snapshot

    # Without the flag: composite blocks at recent_failures_guard.
    blocked = evaluate_all(
        current_max=50,
        last_cursor=0,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert not blocked.proceed
    blocker = blocked.first_blocker()
    assert blocker is not None
    assert "recent failures" in blocker.reason

    # With the flag: composite passes.
    allowed = evaluate_all(
        current_max=50,
        last_cursor=0,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
        allow_sticky_partial_error_regime=True,
    )
    assert allowed.proceed, (
        f"evaluate_all should thread the kwarg through. "
        f"Decisions: {[(d.proceed, d.reason) for d in allowed.decisions]}"
    )


# ── commit_gap_guard ─────────────────────────────────────────────────────


def test_commit_gap_first_run_allows_through():
    d = commit_gap_guard(last_commit_ts=0, now_ts=1_700_000_000)
    assert d.proceed


def test_commit_gap_blocks_within_threshold():
    d = commit_gap_guard(last_commit_ts=1_700_000_000, now_ts=1_700_000_500)
    assert not d.proceed


def test_commit_gap_proceeds_past_threshold():
    d = commit_gap_guard(
        last_commit_ts=1_700_000_000,
        now_ts=1_700_000_000 + DEFAULT_COMMIT_MIN_GAP_SEC + 1,
    )
    assert d.proceed


def test_commit_gap_exact_threshold_proceeds():
    # gap == threshold means >= threshold seconds have passed. Shell uses <.
    d = commit_gap_guard(
        last_commit_ts=1_700_000_000,
        now_ts=1_700_000_000 + DEFAULT_COMMIT_MIN_GAP_SEC,
    )
    assert d.proceed


def test_commit_gap_custom_threshold():
    d = commit_gap_guard(last_commit_ts=100, now_ts=200, min_gap_sec=50)
    assert d.proceed


# ── snapshot_sanity_check ────────────────────────────────────────────────


def test_sanity_check_passes_on_clean_snapshot(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "post_url": "https://..."}])
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


def test_sanity_check_blocks_when_screenshot_png_leaks(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "screenshot_png": "AAAA"}])
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "screenshot_png" in d.reason


def test_sanity_check_blocks_when_local_path_leaks(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "local_path": "/Users/x/secret"}])
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "local_path" in d.reason


def test_sanity_check_reports_which_post_index_leaked(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(
        snapshot,
        [
            {"post_id": "a"},
            {"post_id": "b", "screenshot_png": "X"},
        ],
    )
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "post[1]" in d.reason


def test_sanity_check_handles_missing_file(tmp_path):
    d = snapshot_sanity_check(tmp_path / "missing.json")
    assert not d.proceed
    assert "not found" in d.reason


def test_sanity_check_handles_invalid_json(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text("{not json", encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "JSON" in d.reason


def test_sanity_check_passes_with_zero_posts(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps({"posts": []}), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


def test_sanity_check_passes_when_posts_key_missing(tmp_path):
    # Sanity allows snapshots that just omit posts; shell only iterates if present.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps({"handle": "@x"}), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


# Valid JSON whose top level is NOT an object. snapshot_sanity_check
# handled FileNotFoundError + JSONDecodeError but then called
# data.get("posts") — which raises AttributeError on a list / str /
# None / number top level. A defensive guard must return a clean
# GuardDecision(False, ...), not crash evaluate_all with a traceback.


def test_sanity_check_blocks_top_level_array(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps([]), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "object" in d.reason.lower()


def test_sanity_check_blocks_top_level_null(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps(None), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "object" in d.reason.lower()


def test_sanity_check_blocks_top_level_string(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps("corrupt"), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "object" in d.reason.lower()


# Deep recursion — defense in depth for forbidden keys in non-`posts`
# regions of the snapshot. Today's payload is built from explicit DB
# columns so the leak surface is small, but the guard's job is to stop
# the next mistake (a refactor exposing `last_check.error` raw text with
# a path, or a future top-level field added without sanitising it). All
# three tests below FAIL before the deep-walk rewrite and pass after.


def test_sanity_check_blocks_local_path_nested_in_last_check(tmp_path):
    # `last_check` is whatever sqlite3.Row → dict produces; if a future
    # column or richer error dict carries an absolute path, the public
    # snapshot would leak it. The guard must inspect it.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(
        json.dumps({
            "handle": "@x",
            "posts": [{"post_id": "a"}],
            "last_check": {
                "checked_at": "2026-05-18T13:03:03Z",
                "status": "error",
                "error": {"detail": "fopen failed", "local_path": "/Users/umi/.config/secret"},
            },
        }),
        encoding="utf-8",
    )
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed, "guard must reject local_path nested inside last_check.error"
    assert "local_path" in d.reason


def test_sanity_check_blocks_screenshot_png_nested_in_post_meta(tmp_path):
    # If a future schema attaches per-post metadata (thumbnail blob,
    # extracted EXIF, OCR text + raw bytes), a flat-keys check misses
    # forbidden keys hidden one level down.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(
        json.dumps({
            "handle": "@x",
            "posts": [
                {"post_id": "a"},
                {"post_id": "b", "meta": {"thumbnail": {"screenshot_png": "AAAA"}}},
            ],
        }),
        encoding="utf-8",
    )
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed, "guard must reject screenshot_png nested inside post[].meta.thumbnail"
    assert "screenshot_png" in d.reason


def test_sanity_check_blocks_forbidden_key_at_top_level(tmp_path):
    # A new top-level field that accidentally proxies a forbidden key
    # name (e.g., debug dump from watcher.run_once). The current guard
    # never looks at top-level keys outside of `posts`.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(
        json.dumps({
            "handle": "@x",
            "posts": [],
            "local_path": "/Users/umi/screens/dump.png",  # blatant top-level leak
        }),
        encoding="utf-8",
    )
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed, "guard must reject local_path at top-level of snapshot"
    assert "local_path" in d.reason


def test_sanity_check_passes_when_forbidden_key_appears_only_in_string_value(tmp_path):
    # A description / message string that happens to mention the
    # literal word "local_path" must NOT trigger the guard — only
    # forbidden KEYS in dict objects do. Prevents false-positives on
    # legitimate error text.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(
        json.dumps({
            "handle": "@x",
            "posts": [{"post_id": "a"}],
            "last_check": {
                "status": "ok",
                "error": "warning: previous run had local_path None",
            },
        }),
        encoding="utf-8",
    )
    d = snapshot_sanity_check(snapshot)
    assert d.proceed, "string values mentioning forbidden key names must not trip the guard"


# ── evaluate_all (composite, short-circuit) ──────────────────────────────


def test_evaluate_all_short_circuits_on_no_delta(conn, tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=10,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert not result.proceed
    assert result.delta == 0
    assert len(result.decisions) == 1  # short-circuited before fail/gap/sanity


def test_evaluate_all_short_circuits_on_recent_failure(conn, tmp_path):
    _add_check(conn, "error", "fail")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=5,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert not result.proceed
    assert result.delta == 5
    assert len(result.decisions) == 2  # delta + fail; gap & sanity skipped


def test_evaluate_all_passes_all_gates(conn, tmp_path):
    for _ in range(3):
        _add_check(conn, "ok")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc"}])
    result = evaluate_all(
        current_max=43,
        last_cursor=0,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert result.proceed
    assert result.delta == 43
    assert all(d.proceed for d in result.decisions)
    assert len(result.decisions) == 4


def test_evaluate_all_first_blocker_helper(conn, tmp_path):
    _add_check(conn, "error", "boom")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=5,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    blocker = result.first_blocker()
    assert blocker is not None
    assert "recent failures" in blocker.reason


# ── safety constants regression ──────────────────────────────────────────


def test_default_thresholds_match_shell_script():
    # If these defaults drift from sync.sh.example, the launchd cron and
    # this Python evaluator will silently diverge. Hard-code & assert.
    assert DEFAULT_COMMIT_MIN_GAP_SEC == 3600
    assert DEFAULT_RECENT_CHECKS_WINDOW == 3
    assert "error" in BAD_CHECK_STATUSES


# ── kind field on GuardDecision + format_outcome_event ──────────────────
#
# Pinning the structured-event surface that sync.py logs at every exit
# path. Without these, an operator running
#   grep "sync_event: skipped" logs/sync.log \
#     | grep -o "blocker=[a-z_]*" | sort | uniq -c
# would silently miss any guard that forgot to set its `kind`, getting
# blocker=unknown rows instead of a real histogram.


class TestGuardDecisionKind:
    def test_detect_delta_sets_kind(self):
        for d in (detect_delta(10, 0), detect_delta(0, 10)):
            assert d.kind == 'detect_delta', f"detect_delta returned kind={d.kind!r}"

    def test_recent_failures_sets_kind_on_all_paths(self, conn):
        # Empty history → proceed=True
        assert recent_failures_guard(conn).kind == 'recent_failures'
        # All ok → proceed=True
        for _ in range(3):
            _add_check(conn, 'ok')
        assert recent_failures_guard(conn).kind == 'recent_failures'
        # Failure → proceed=False
        _add_check(conn, 'error', 'x')
        assert recent_failures_guard(conn).kind == 'recent_failures'

    def test_recent_failures_sticky_regime_path_also_sets_kind(self, conn):
        # The opt-in escape valve has its own return statement — pin
        # that it also stamps kind (the surface this entire feature
        # exists to make grep-able).
        for _ in range(3):
            _add_check(conn, 'partial_error', 'found=4 previous_max=15')
        d = recent_failures_guard(conn, allow_sticky_partial_error_regime=True)
        assert d.proceed is True
        assert d.kind == 'recent_failures'
        assert 'sticky' in d.reason

    def test_commit_gap_sets_kind(self):
        assert commit_gap_guard(0, 1_000_000).kind == 'commit_gap'
        assert commit_gap_guard(1_000_000, 1_000_500).kind == 'commit_gap'
        assert commit_gap_guard(1_000_000, 1_000_000 + DEFAULT_COMMIT_MIN_GAP_SEC + 1).kind == 'commit_gap'

    def test_snapshot_sanity_sets_kind_on_all_paths(self, tmp_path):
        # Missing file path
        d = snapshot_sanity_check(tmp_path / 'never.json')
        assert d.proceed is False and d.kind == 'snapshot_sanity'

        # Invalid JSON
        bad = tmp_path / 'bad.json'
        bad.write_text('not json at all', encoding='utf-8')
        d = snapshot_sanity_check(bad)
        assert d.proceed is False and d.kind == 'snapshot_sanity'

        # Top-level non-object
        wrong = tmp_path / 'arr.json'
        wrong.write_text('[]', encoding='utf-8')
        d = snapshot_sanity_check(wrong)
        assert d.proceed is False and d.kind == 'snapshot_sanity'

        # Forbidden key leak
        leaked = tmp_path / 'leak.json'
        _write_snapshot(leaked, [{'id': 1, 'screenshot_png': 'AAA'}])
        d = snapshot_sanity_check(leaked)
        assert d.proceed is False and d.kind == 'snapshot_sanity'

        # Happy path
        clean = tmp_path / 'clean.json'
        _write_snapshot(clean, [{'id': 1}])
        d = snapshot_sanity_check(clean)
        assert d.proceed is True and d.kind == 'snapshot_sanity'


class TestFormatOutcomeEvent:
    def test_skipped_event_includes_blocker_kind(self):
        line = format_outcome_event('skipped', delta=75, blocker_kind='recent_failures')
        assert line.startswith('sync_event: skipped ')
        assert 'delta=75' in line
        assert 'blocker=recent_failures' in line

    def test_skipped_event_with_unknown_kind_falls_back_to_unknown(self):
        # A typo on a guard's kind ('recent_failure' missing the 's')
        # would silently set blocker=recent_failure in the event log.
        # The KNOWN_BLOCKER_KINDS set rejects that and falls back to
        # 'unknown' so operators see the gap.
        line = format_outcome_event('skipped', delta=10, blocker_kind='recent_failure')
        assert 'blocker=unknown' in line

    def test_skipped_event_with_none_kind_falls_back_to_unknown(self):
        # decision.first_blocker() could return None in a vacuous case.
        # Don't crash on None — emit blocker=unknown.
        line = format_outcome_event('skipped', delta=0, blocker_kind=None)
        assert 'blocker=unknown' in line

    def test_dry_run_event_has_no_blocker_field(self):
        line = format_outcome_event('dry_run', delta=42)
        assert line.startswith('sync_event: dry_run ')
        assert 'delta=42' in line
        assert 'blocker=' not in line

    def test_committed_event_carries_extra_fields(self):
        line = format_outcome_event('committed', delta=5, extra={'sha': 'abc1234'})
        assert line == 'sync_event: committed delta=5 sha=abc1234'

    def test_pushed_event_with_branch_extra(self):
        line = format_outcome_event('pushed', delta=5, extra={'branch': 'main'})
        assert 'sync_event: pushed' in line
        assert 'branch=main' in line

    def test_extra_values_with_spaces_or_quotes_are_sanitised(self):
        # Shell-safety: a reason string with spaces would break the
        # `grep | cut` parsing pattern. Sanitise to underscores so the
        # line stays one shell-token per field.
        line = format_outcome_event(
            'error', delta=0, extra={'detail': 'lock held', 'msg': 'a "b" c'},
        )
        # spaces → underscores, quotes stripped
        assert 'detail=lock_held' in line
        assert 'msg=a_b_c' in line

    def test_extras_are_sorted_for_stable_output(self):
        # Deterministic ordering so grep + sort + uniq on the full line
        # gives stable histograms across runs.
        line = format_outcome_event(
            'committed', delta=1,
            extra={'zeta': 'z', 'alpha': 'a', 'middle': 'm'},
        )
        # Find the positions of each key in the output
        pos_a = line.index('alpha=')
        pos_m = line.index('middle=')
        pos_z = line.index('zeta=')
        assert pos_a < pos_m < pos_z

    def test_unknown_outcome_raises_value_error(self):
        # The outcome vocabulary is a closed set. A typo on the caller
        # side ('skiped' missing the second 'p') would silently emit
        # `sync_event: skiped delta=0` which the grep pattern doesn't
        # match — operators would never see the line. Raise loudly.
        with pytest.raises(ValueError, match='unknown outcome'):
            format_outcome_event('skiped', delta=0)

    def test_outcome_events_set_covers_every_path(self):
        # Pin the set so a future caller adding a new outcome must
        # also update this constant — drift-proof. `warn` joined when
        # partial_error_rate alerting landed; `recovered` joined as
        # the positive-transition counterpoint.
        assert OUTCOME_EVENTS == {
            'skipped', 'dry_run', 'committed', 'pushed', 'error',
            'warn', 'recovered',
        }

    def test_known_blocker_kinds_set_matches_all_guard_functions(self):
        # If a future guard adds itself to evaluate_all but forgets
        # KNOWN_BLOCKER_KINDS, every block from that guard logs as
        # 'unknown' — the entire histogram quietly degrades. Pin the
        # canonical set.
        assert KNOWN_BLOCKER_KINDS == {
            'detect_delta', 'recent_failures', 'commit_gap', 'snapshot_sanity',
        }


class TestSkippedEventEndToEnd:
    """The outcome line is the operator-visible surface — confirm it
    actually appears in sync.py's log for the production-typical skip
    case (recent_failures dominating the window)."""

    def test_evaluate_all_then_format_outcome_emits_recent_failures(self, conn, tmp_path):
        # Simulate the production sticky-regime scenario at the
        # SyncDecision layer (no subprocess). With a delta + a window
        # full of partial_error, evaluate_all returns proceed=False
        # with recent_failures as the first blocker — and the helper
        # emits the canonical 'blocker=recent_failures' line.
        for _ in range(3):
            _add_check(conn, 'partial_error', 'found=4 previous_max=15')
        snapshot = tmp_path / 'state.json'
        _write_snapshot(snapshot, [])

        decision = evaluate_all(
            current_max=75,
            last_cursor=0,
            conn=conn,
            last_commit_ts=0,
            now_ts=1_700_000_000,
            snapshot_path=snapshot,
        )
        assert not decision.proceed
        blocker = decision.first_blocker()
        assert blocker is not None
        line = format_outcome_event(
            'skipped', delta=decision.delta, blocker_kind=blocker.kind,
        )
        assert line == 'sync_event: skipped delta=75 blocker=recent_failures'


# ── partial_error_rate warnings ────────────────────────────────────────


class TestPartialErrorRateWarnings:
    """compute_partial_error_rate_warnings(conn) brings the dashboard's
    visual >= 0.5 partial_error_rate alert into the grep-able log
    surface. Sticky-regime case: 28 partial_error rows out of 30 in
    the last hour → rate ~0.93 → emit a warning row for that handle."""

    def _seed_partial(self, conn, handle: str, count: int, reason: str = 'found=4 prev=15'):
        from datetime import datetime, timedelta, timezone
        for i in range(count):
            ts = (datetime.now(timezone.utc) - timedelta(minutes=i)).strftime('%Y-%m-%dT%H:%M:%SZ')
            record_check(
                conn, handle=handle, checked_at=ts,
                found_count=4, new_count=0, status='partial_error', error=reason,
            )

    def _seed_ok(self, conn, handle: str, count: int):
        from datetime import datetime, timedelta, timezone
        for i in range(count):
            ts = (datetime.now(timezone.utc) - timedelta(minutes=i)).strftime('%Y-%m-%dT%H:%M:%SZ')
            record_check(
                conn, handle=handle, checked_at=ts,
                found_count=15, new_count=0, status='ok', error=None,
            )

    def test_returns_empty_when_no_handles_above_threshold(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        # All-healthy handle → no warning
        self._seed_ok(conn, '@healthy', 10)
        assert compute_partial_error_rate_warnings(conn) == []

    def test_returns_warning_when_handle_above_threshold(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        # 28 partial + 2 ok = 93% partial_error_rate → warning
        self._seed_partial(conn, '@hot', 28)
        self._seed_ok(conn, '@hot', 2)
        warnings = compute_partial_error_rate_warnings(conn)
        assert len(warnings) == 1
        w = warnings[0]
        assert w['handle'] == '@hot'
        assert w['rate'] >= 0.9
        assert w['threshold'] == 0.5
        assert w['window_hours'] == 1
        assert w['total'] == 30
        assert w['top_reason'] == 'found=4 prev=15'

    def test_threshold_param_is_respected(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        # 3 partial + 7 ok = 30% → below default 0.5, but above 0.2
        self._seed_partial(conn, '@blip', 3)
        self._seed_ok(conn, '@blip', 7)
        assert compute_partial_error_rate_warnings(conn, threshold=0.5) == []
        warnings = compute_partial_error_rate_warnings(conn, threshold=0.2)
        assert len(warnings) == 1
        assert warnings[0]['handle'] == '@blip'

    def test_window_hours_param_isolates_recent_rows(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        from datetime import datetime, timedelta, timezone
        # OLD partial_error rows (25h ago) should NOT count under 1h window
        for i in range(28):
            ts = (datetime.now(timezone.utc) - timedelta(hours=25, minutes=i)).strftime('%Y-%m-%dT%H:%M:%SZ')
            record_check(
                conn, handle='@old', checked_at=ts,
                found_count=4, new_count=0, status='partial_error', error='old',
            )
        # 1 fresh ok within 1h
        self._seed_ok(conn, '@old', 1)
        # Default window=1 → only 1 ok seen → 0% partial → no warning
        assert compute_partial_error_rate_warnings(conn, window_hours=1) == []
        # 168h window → old + new visible → 28/29 ~ 96% partial → warning
        warnings = compute_partial_error_rate_warnings(conn, window_hours=168)
        assert len(warnings) == 1

    def test_returns_one_warning_per_offending_handle(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        self._seed_partial(conn, '@hot1', 28, reason='reason A')
        self._seed_ok(conn, '@hot1', 2)
        self._seed_partial(conn, '@hot2', 25, reason='reason B')
        self._seed_ok(conn, '@hot2', 5)
        self._seed_ok(conn, '@cool', 10)
        warnings = compute_partial_error_rate_warnings(conn)
        # Deterministic order — sorted by handle.
        assert [w['handle'] for w in warnings] == ['@hot1', '@hot2']
        assert warnings[0]['top_reason'] == 'reason A'
        assert warnings[1]['top_reason'] == 'reason B'

    def test_no_checks_at_all_yields_empty(self, conn):
        from sync_guards import compute_partial_error_rate_warnings
        # Empty DB → no handles → no warnings (not a crash)
        assert compute_partial_error_rate_warnings(conn) == []


class TestWarnOutcomeEvent:
    """format_outcome_event('warn', ...) brings the partial_error_rate
    surface into the canonical sync_event log line."""

    def test_warn_line_shape(self):
        line = format_outcome_event(
            'warn', delta=0,
            extra={
                'type': 'partial_error_rate',
                'handle': '@hal.lifedesign',
                'rate': 0.929,
                'threshold': 0.5,
                'window_hours': 1,
            },
        )
        assert line.startswith('sync_event: warn ')
        assert 'type=partial_error_rate' in line
        assert 'handle=@hal.lifedesign' in line
        assert 'rate=0.929' in line
        assert 'threshold=0.5' in line
        assert 'window_hours=1' in line

    def test_warn_without_type_raises(self):
        # The whole point of WARN_TYPES is that ALL warn lines have a
        # known type=. Calling without one is a bug at the call site,
        # not a graceful degradation case.
        with pytest.raises(ValueError, match='extra\\[.type.\\]'):
            format_outcome_event('warn', delta=0)

    def test_warn_with_unknown_type_raises(self):
        with pytest.raises(ValueError, match='extra\\[.type.\\]'):
            format_outcome_event(
                'warn', delta=0, extra={'type': 'partial_error_rates'},  # trailing 's'
            )

    def test_known_warn_types_pinned(self):
        # Drift guard: future callers adding a new warn type MUST
        # also update WARN_TYPES; this test makes that mandatory.
        from sync_guards import WARN_TYPES
        assert WARN_TYPES == {'partial_error_rate'}

    def test_warn_extras_sorted_for_stable_diff(self):
        # The composite check: every value-bearing field appears in
        # sorted order so `tail -f | grep warn` produces stable lines
        # tick-over-tick (easier to spot real changes).
        line = format_outcome_event(
            'warn', delta=0,
            extra={'type': 'partial_error_rate', 'handle': '@x', 'rate': 0.6},
        )
        # Find positions
        h = line.index('handle=')
        r = line.index('rate=')
        t = line.index('type=')
        assert h < r < t  # lex order: handle < rate < type


# ── filter_warnings_for_emit (heartbeat dedup) ─────────────────────────


class TestFilterWarningsForEmit:
    """Heartbeat + rate-bucket dedup for partial_error_rate warnings.
    Without this filter, sustained regimes emit ~288 lines/day/handle
    at the 5-min launchd cadence. With it: bucket changes + heartbeat
    every hour, otherwise silent."""

    def _w(self, handle: str, rate: float) -> dict:
        return {
            'handle': handle,
            'rate': rate,
            'threshold': 0.5,
            'window_hours': 1,
            'total': 30,
            'top_reason': 'x',
        }

    def test_first_emit_when_state_file_missing(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "never.json"
        warnings = [self._w('@h', 0.9)]
        emittable, _recovered, new_state = filter_warnings_for_emit(
            warnings, state_path, now_ts=1000,
        )
        assert len(emittable) == 1
        assert new_state == {'@h': {'bucket': 0.9, 'ts': 1000}}

    def test_repeat_within_same_bucket_and_heartbeat_suppresses(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(
            json.dumps({'@h': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        # 100s later, same bucket — should suppress.
        emittable, _recovered, new_state = filter_warnings_for_emit(
            [self._w('@h', 0.91)], state_path, now_ts=1100, heartbeat_sec=3600,
        )
        assert emittable == []
        # State preserves the ORIGINAL timestamp so heartbeat clock
        # keeps counting from last EMITTED tick.
        assert new_state == {'@h': {'bucket': 0.9, 'ts': 1000}}

    def test_bucket_change_re_emits(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(
            json.dumps({'@h': {'bucket': 0.6, 'ts': 1000}}), encoding='utf-8',
        )
        # Rate jumped 0.65 → 0.85 → bucket 0.6 → 0.8 → re-emit.
        emittable, _recovered, new_state = filter_warnings_for_emit(
            [self._w('@h', 0.85)], state_path, now_ts=1100, heartbeat_sec=3600,
        )
        assert len(emittable) == 1
        assert new_state['@h']['bucket'] == 0.8
        assert new_state['@h']['ts'] == 1100

    def test_heartbeat_elapsed_re_emits(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(
            json.dumps({'@h': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        # Same bucket but >= heartbeat_sec elapsed (3600s default).
        emittable, _recovered, _ = filter_warnings_for_emit(
            [self._w('@h', 0.91)], state_path, now_ts=1000 + 3601,
            heartbeat_sec=3600,
        )
        assert len(emittable) == 1

    def test_heartbeat_exactly_at_interval_re_emits(self, tmp_path):
        # Boundary: elapsed == heartbeat_sec. The `>=` comparison
        # means we should re-emit, not wait one more second.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(
            json.dumps({'@h': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        emittable, _recovered, _ = filter_warnings_for_emit(
            [self._w('@h', 0.91)], state_path, now_ts=1000 + 3600,
            heartbeat_sec=3600,
        )
        assert len(emittable) == 1

    def test_recovered_handle_dropped_from_state(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        # @hot was warned previously; this tick it's not in warnings.
        state_path.write_text(
            json.dumps({'@hot': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        emittable, _recovered, new_state = filter_warnings_for_emit(
            [], state_path, now_ts=1100,
        )
        assert emittable == []
        # State no longer mentions @hot — if it re-triggers later,
        # the first-emit branch fires (no stale state from history).
        assert '@hot' not in new_state

    def test_multiple_handles_independent_state(self, tmp_path):
        # @a is steady-state (bucket unchanged + heartbeat not elapsed
        # → suppress), @b just crossed a bucket boundary (re-emit).
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(json.dumps({
            '@a': {'bucket': 0.7, 'ts': 1000},
            '@b': {'bucket': 0.5, 'ts': 1000},
        }), encoding='utf-8')
        emittable, _recovered, new_state = filter_warnings_for_emit(
            [self._w('@a', 0.72), self._w('@b', 0.85)],
            state_path, now_ts=1100, heartbeat_sec=3600,
        )
        assert [e['handle'] for e in emittable] == ['@b']
        # @a state preserved, @b state advanced.
        assert new_state['@a'] == {'bucket': 0.7, 'ts': 1000}
        assert new_state['@b'] == {'bucket': 0.8, 'ts': 1100}

    def test_corrupt_state_file_treated_as_empty(self, tmp_path):
        # Operator (or disk corruption) wrote garbage. Don't crash —
        # treat as no-prior-state so the next tick re-emits everything.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text("not valid json {{", encoding='utf-8')
        emittable, _recovered, new_state = filter_warnings_for_emit(
            [self._w('@h', 0.9)], state_path, now_ts=1000,
        )
        assert len(emittable) == 1
        assert new_state == {'@h': {'bucket': 0.9, 'ts': 1000}}

    def test_state_file_with_wrong_top_level_type(self, tmp_path):
        # Defensive: file contains a JSON array, not an object.
        # Treat as empty.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text("[]", encoding='utf-8')
        emittable, _recovered, _ = filter_warnings_for_emit(
            [self._w('@h', 0.9)], state_path, now_ts=1000,
        )
        assert len(emittable) == 1

    def test_rate_bucket_boundary_0_5(self, tmp_path):
        # Pin bucket math: 0.5 → 0.5, 0.49999 → 0.4. The strict
        # boundary matters because the default threshold IS 0.5, so a
        # warning at exactly rate=0.5 must bucket to 0.5 not 0.4.
        from sync_guards import _rate_bucket
        assert _rate_bucket(0.5) == 0.5
        assert _rate_bucket(0.499) == 0.4
        assert _rate_bucket(0.929) == 0.9
        assert _rate_bucket(1.0) == 1.0

    def test_three_identical_ticks_yield_exactly_one_emit(self, tmp_path):
        # 🔒 Core operational win: a sustained regime that would have
        # emitted 288 lines/day now emits ~24 (1/hour heartbeat) + 1
        # per bucket crossing. Pin the per-tick suppression.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        total_emitted = 0
        for i in range(3):
            warnings = [self._w('@h', 0.92)]
            emittable, _recovered, new_state = filter_warnings_for_emit(
                warnings, state_path,
                now_ts=1000 + i * 60,  # 1 min apart, well under 3600s heartbeat
                heartbeat_sec=3600,
            )
            total_emitted += len(emittable)
            state_path.write_text(json.dumps(new_state), encoding='utf-8')
        assert total_emitted == 1, (
            f"Expected 1 emit across 3 identical ticks; got {total_emitted}"
        )


# ── recovered event (positive transition of warn) ──────────────────────


class TestRecoveredEvent:
    """The recovered surface complements the warn line: when a handle
    previously above threshold drops below it, filter_warnings_for_emit
    surfaces it in the `recovered` list so sync.py can emit
    `sync_event: recovered type=partial_error_rate handle=@x ...`."""

    def _w(self, handle: str, rate: float) -> dict:
        return {
            'handle': handle,
            'rate': rate,
            'threshold': 0.5,
            'window_hours': 1,
            'total': 30,
            'top_reason': 'x',
        }

    def test_handle_dropping_below_threshold_appears_in_recovered(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        # @hot was warned previously at bucket 0.9.
        state_path.write_text(
            json.dumps({'@hot': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        # This tick: no warnings at all (everything below threshold).
        emittable, recovered, new_state = filter_warnings_for_emit(
            [], state_path, now_ts=1100,
        )
        assert emittable == []
        assert len(recovered) == 1
        assert recovered[0]['handle'] == '@hot'
        assert recovered[0]['prev_bucket'] == 0.9
        # State no longer mentions @hot — a future re-trigger starts fresh.
        assert '@hot' not in new_state

    def test_no_recovered_when_no_prior_state(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "never.json"  # missing
        emittable, recovered, new_state = filter_warnings_for_emit(
            [], state_path, now_ts=1000,
        )
        assert recovered == []

    def test_no_recovered_when_handle_still_warning(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(
            json.dumps({'@hot': {'bucket': 0.9, 'ts': 1000}}), encoding='utf-8',
        )
        # Still warning, same bucket, within heartbeat → suppress warn
        # but DO NOT recover.
        emittable, recovered, new_state = filter_warnings_for_emit(
            [self._w('@hot', 0.91)], state_path, now_ts=1100, heartbeat_sec=3600,
        )
        assert emittable == []
        assert recovered == []
        # State still tracks @hot.
        assert '@hot' in new_state

    def test_partial_recovery_one_recovered_one_still_warning(self, tmp_path):
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(json.dumps({
            '@a': {'bucket': 0.9, 'ts': 1000},
            '@b': {'bucket': 0.7, 'ts': 1000},
        }), encoding='utf-8')
        # Only @b is still hot. @a dropped below threshold.
        emittable, recovered, new_state = filter_warnings_for_emit(
            [self._w('@b', 0.72)], state_path, now_ts=1100, heartbeat_sec=3600,
        )
        # @b is suppressed (same bucket + within heartbeat). @a is recovered.
        assert emittable == []
        assert [r['handle'] for r in recovered] == ['@a']
        # State retains @b, drops @a.
        assert '@b' in new_state
        assert '@a' not in new_state

    def test_recovered_event_line_shape(self):
        # sync.py will pass each recovered dict into format_outcome_event.
        # Pin the line shape.
        line = format_outcome_event(
            'recovered', delta=0,
            extra={
                'type': 'partial_error_rate',
                'handle': '@hot',
                'prev_bucket': 0.9,
            },
        )
        assert line.startswith('sync_event: recovered ')
        assert 'type=partial_error_rate' in line
        assert 'handle=@hot' in line
        assert 'prev_bucket=0.9' in line

    def test_recovered_without_type_raises(self):
        # Same validation as warn — type field is required so operator
        # grep `type=partial_error_rate` works on both event classes.
        with pytest.raises(ValueError, match='extra\\[.type.\\]'):
            format_outcome_event('recovered', delta=0)

    def test_recovered_with_unknown_type_raises(self):
        with pytest.raises(ValueError, match='extra\\[.type.\\]'):
            format_outcome_event(
                'recovered', delta=0, extra={'type': 'unknown_metric'},
            )

    def test_recovered_state_drop_does_NOT_emit_when_warn_re_added(self, tmp_path):
        # 🔒 critical correctness pin (see body).
        # Critical correctness: a handle that bounces (warn → recover →
        # warn again) within consecutive ticks should produce a
        # recovered+warn sequence over 2 ticks, NOT confuse the state.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        # Tick 1: handle warning
        _, _, st1 = filter_warnings_for_emit(
            [self._w('@bounce', 0.9)], state_path, now_ts=1000,
        )
        state_path.write_text(json.dumps(st1), encoding='utf-8')
        # Tick 2: handle recovered (dropped below threshold)
        _, rec2, st2 = filter_warnings_for_emit(
            [], state_path, now_ts=1100,
        )
        assert len(rec2) == 1 and rec2[0]['handle'] == '@bounce'
        state_path.write_text(json.dumps(st2), encoding='utf-8')
        # Tick 3: handle warning AGAIN at a different bucket. Use 0.65
        # rather than exactly 0.6 — floating-point arithmetic in
        # _rate_bucket means 0.6/0.1 ≈ 5.9999 so bucket=0.5; pick a
        # value well inside the bucket to avoid that boundary surprise.
        emit3, rec3, st3 = filter_warnings_for_emit(
            [self._w('@bounce', 0.65)], state_path, now_ts=1200,
        )
        # Fresh warn (state was empty post-recovery → first-emit branch)
        assert len(emit3) == 1
        assert rec3 == []  # no recovery this tick
        assert st3['@bounce']['bucket'] == 0.6  # 0.65 buckets to 0.6

    def test_recovered_handles_malformed_state_entry(self, tmp_path):
        # Defensive: if the JSON state has a non-dict value for a handle
        # (corruption), skip it in the recovered scan rather than crash.
        from sync_guards import filter_warnings_for_emit
        state_path = tmp_path / "s.json"
        state_path.write_text(json.dumps({
            '@good': {'bucket': 0.9, 'ts': 1000},
            '@malformed': 'not a dict',
        }), encoding='utf-8')
        _, recovered, _ = filter_warnings_for_emit(
            [], state_path, now_ts=1100,
        )
        # @good recovered, @malformed silently skipped (not a crash).
        assert [r['handle'] for r in recovered] == ['@good']


# ── MTTR helper: compute_mttr_from_log / summarise_mttr ────────────────


class TestComputeMTTRFromLog:
    """Pair (warn, recovered) sync_event lines from a log file and
    return per-handle incident durations. The downstream use case is
    feeding Discord/Slack notify hooks ("regime for @hot lasted 3.2h")
    and ops dashboards.

    Heartbeat warn re-emits must NOT open a second incident — the
    pairing rule is "first warn after the last recovered opens; first
    recovered closes; everything between is the same incident".
    """

    def _warn(self, ts: str, handle: str, rate: float) -> str:
        return (
            f'{ts} sync_event: warn delta=0 handle={handle} rate={rate} '
            f'threshold=0.5 total=30 type=partial_error_rate window_hours=1'
        )

    def _recovered(self, ts: str, handle: str, prev_bucket: float) -> str:
        return (
            f'{ts} sync_event: recovered delta=0 handle={handle} '
            f'prev_bucket={prev_bucket} type=partial_error_rate'
        )

    def test_single_warn_then_recovered_yields_one_record(self):
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        ]
        result = compute_mttr_from_log(lines)
        assert list(result.keys()) == ['@hot']
        assert len(result['@hot']) == 1
        rec = result['@hot'][0]
        assert rec['duration_s'] == 3600
        assert rec['prev_bucket'] == 0.9

    def test_heartbeat_warn_re_emits_do_NOT_open_new_incident(self):
        # 🔒 Core pairing pin: warn → warn (heartbeat) → recovered
        # produces ONE incident, not two. The middle warn would
        # otherwise inflate incident counts.
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            self._warn('2026-05-23T04:30:00Z', '@hot', 0.91),  # heartbeat
            self._warn('2026-05-23T04:45:00Z', '@hot', 0.92),  # heartbeat
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        ]
        records = compute_mttr_from_log(lines)
        assert len(records['@hot']) == 1
        assert records['@hot'][0]['duration_s'] == 3600  # from FIRST warn

    def test_two_incidents_separated_by_recovered_in_middle(self):
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
            self._warn('2026-05-23T06:00:00Z', '@hot', 0.65),
            self._recovered('2026-05-23T06:15:00Z', '@hot', 0.6),
        ]
        records = compute_mttr_from_log(lines)
        durations = [r['duration_s'] for r in records['@hot']]
        assert durations == [3600, 900]

    def test_unmatched_warn_is_dropped(self):
        # Still-open incident at end of log → not returned (operators
        # see it as "still warning" from the live log tail).
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            # no recovered
        ]
        assert compute_mttr_from_log(lines) == {}

    def test_unmatched_recovered_is_dropped(self):
        # Recovered without a preceding warn (log truncation, scan
        # window starts mid-regime) → silently skipped.
        from sync_guards import compute_mttr_from_log
        lines = [
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        ]
        assert compute_mttr_from_log(lines) == {}

    def test_independent_handles_tracked_separately(self):
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@a', 0.9),
            self._warn('2026-05-23T04:10:00Z', '@b', 0.7),
            self._recovered('2026-05-23T04:30:00Z', '@a', 0.9),
            self._recovered('2026-05-23T05:00:00Z', '@b', 0.7),
        ]
        records = compute_mttr_from_log(lines)
        assert set(records.keys()) == {'@a', '@b'}
        assert records['@a'][0]['duration_s'] == 1800   # 30 min
        assert records['@b'][0]['duration_s'] == 3000   # 50 min

    def test_filters_by_warn_type(self):
        # A future warn_type ('fast_fail_rate' or similar) should not
        # contaminate MTTR for the requested type.
        from sync_guards import compute_mttr_from_log
        lines = [
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            ('2026-05-23T04:30:00Z sync_event: warn delta=0 handle=@hot '
             'rate=10 threshold=5 type=other_metric window_hours=1'),
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        ]
        result = compute_mttr_from_log(lines, warn_type='partial_error_rate')
        # The 'other_metric' warn must NOT be confused with the
        # partial_error_rate warn — different type filter.
        assert len(result['@hot']) == 1

    def test_ignores_unparseable_lines(self):
        from sync_guards import compute_mttr_from_log
        lines = [
            'random log line without sync_event',
            '2026-05-23T04:00:00Z sync_event: skipped delta=75 blocker=recent_failures',
            self._warn('2026-05-23T04:00:00Z', '@hot', 0.9),
            'malformed sync_event: warn missing handle',
            self._recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        ]
        records = compute_mttr_from_log(lines)
        assert len(records['@hot']) == 1


class TestSummariseMttr:
    """summarise_mttr aggregates per-handle records into stats
    (count, total, mean, median, max) for dashboard / Slack digest."""

    def test_empty_input_yields_empty_summary(self):
        from sync_guards import summarise_mttr
        assert summarise_mttr({}) == []

    def test_handle_with_zero_records_skipped(self):
        from sync_guards import summarise_mttr
        # Should not crash on empty per-handle list (compute_mttr
        # wouldn't produce one, but defensive).
        assert summarise_mttr({'@empty': []}) == []

    def test_single_incident_yields_single_row(self):
        from sync_guards import summarise_mttr
        records = {'@hot': [{'warn_ts': 0, 'recovered_ts': 600, 'duration_s': 600, 'prev_bucket': 0.9}]}
        out = summarise_mttr(records)
        assert len(out) == 1
        assert out[0] == {
            'handle': '@hot', 'incidents': 1, 'total_s': 600,
            'mean_s': 600, 'median_s': 600, 'max_s': 600,
        }

    def test_multi_incident_aggregation(self):
        from sync_guards import summarise_mttr
        records = {
            '@hot': [
                {'warn_ts': 0, 'recovered_ts': 100, 'duration_s': 100, 'prev_bucket': None},
                {'warn_ts': 200, 'recovered_ts': 500, 'duration_s': 300, 'prev_bucket': None},
                {'warn_ts': 1000, 'recovered_ts': 1500, 'duration_s': 500, 'prev_bucket': None},
            ],
        }
        out = summarise_mttr(records)
        assert out[0]['incidents'] == 3
        assert out[0]['total_s'] == 900
        assert out[0]['mean_s'] == 300
        assert out[0]['median_s'] == 300  # middle of [100, 300, 500]
        assert out[0]['max_s'] == 500

    def test_median_with_even_count_averages_middle_two(self):
        from sync_guards import summarise_mttr
        records = {'@x': [
            {'warn_ts': 0, 'recovered_ts': 100, 'duration_s': 100, 'prev_bucket': None},
            {'warn_ts': 0, 'recovered_ts': 200, 'duration_s': 200, 'prev_bucket': None},
            {'warn_ts': 0, 'recovered_ts': 400, 'duration_s': 400, 'prev_bucket': None},
            {'warn_ts': 0, 'recovered_ts': 800, 'duration_s': 800, 'prev_bucket': None},
        ]}
        # Sorted: [100, 200, 400, 800]; median = (200+400)/2 = 300
        out = summarise_mttr(records)
        assert out[0]['median_s'] == 300

    def test_alphabetic_handle_ordering(self):
        from sync_guards import summarise_mttr
        records = {
            '@zeta': [{'warn_ts': 0, 'recovered_ts': 10, 'duration_s': 10, 'prev_bucket': None}],
            '@alpha': [{'warn_ts': 0, 'recovered_ts': 20, 'duration_s': 20, 'prev_bucket': None}],
            '@middle': [{'warn_ts': 0, 'recovered_ts': 30, 'duration_s': 30, 'prev_bucket': None}],
        }
        out = summarise_mttr(records)
        assert [r['handle'] for r in out] == ['@alpha', '@middle', '@zeta']
