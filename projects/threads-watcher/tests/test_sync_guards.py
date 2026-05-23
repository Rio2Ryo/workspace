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
        # also update this constant — drift-proof.
        assert OUTCOME_EVENTS == {
            'skipped', 'dry_run', 'committed', 'pushed', 'error',
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
