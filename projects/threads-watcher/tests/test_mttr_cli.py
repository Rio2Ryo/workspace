"""CLI tests for mttr.py — wraps compute_mttr_from_log / summarise_mttr
into a `python mttr.py [log]` operator surface.

Subprocess tests so the bash glue (default-path resolution, exit
codes, JSON vs text dispatch) is verified end-to-end, not just at
the helper boundary."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MTTR_PY = PROJECT_ROOT / "mttr.py"


def _make_log(tmp_path: Path, lines: list[str]) -> Path:
    log = tmp_path / "sync.log"
    log.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return log


def _run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(MTTR_PY), *args],
        capture_output=True,
        text=True,
        timeout=15,
        cwd=str(PROJECT_ROOT),
    )


def _warn(ts: str, handle: str, rate: float) -> str:
    return (
        f"{ts} sync_event: warn delta=0 handle={handle} rate={rate} "
        f"threshold=0.5 total=30 type=partial_error_rate window_hours=1"
    )


def _recovered(ts: str, handle: str, prev_bucket: float) -> str:
    return (
        f"{ts} sync_event: recovered delta=0 handle={handle} "
        f"prev_bucket={prev_bucket} type=partial_error_rate"
    )


# ── happy paths ─────────────────────────────────────────────────────────


def test_text_summary_for_a_single_incident(tmp_path):
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
    ])
    r = _run(str(log))
    assert r.returncode == 0
    assert '@hot' in r.stdout
    # Headers + the one row
    assert 'incidents' in r.stdout
    assert 'total_s' in r.stdout
    # Duration 3600s should appear
    assert '3600' in r.stdout


def test_text_summary_handles_zero_incidents_cleanly(tmp_path):
    # A log with warns but no recovereds → summary empty, but exit
    # 0 (success) with an explicit "no recovered incidents" line.
    log = _make_log(tmp_path, [_warn('2026-05-23T04:00:00Z', '@hot', 0.9)])
    r = _run(str(log))
    assert r.returncode == 0
    assert 'no recovered incidents' in r.stdout


def test_text_summary_multi_handle_alphabetic(tmp_path):
    # summarise_mttr sorts by handle. Pin that the CLI surface
    # preserves that ordering.
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@zeta', 0.9),
        _recovered('2026-05-23T04:10:00Z', '@zeta', 0.9),
        _warn('2026-05-23T04:00:00Z', '@alpha', 0.9),
        _recovered('2026-05-23T04:05:00Z', '@alpha', 0.9),
    ])
    r = _run(str(log))
    assert r.returncode == 0
    a_pos = r.stdout.index('@alpha')
    z_pos = r.stdout.index('@zeta')
    assert a_pos < z_pos, "handles must appear alphabetically in summary"


# ── JSON output ─────────────────────────────────────────────────────────


def test_json_summary_is_valid_json_with_expected_shape(tmp_path):
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
    ])
    r = _run('--json', str(log))
    assert r.returncode == 0
    payload = json.loads(r.stdout)
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert payload[0]['handle'] == '@hot'
    assert payload[0]['incidents'] == 1
    assert payload[0]['mean_s'] == 3600


def test_json_records_emits_per_incident_dict(tmp_path):
    # --json --records: full per-incident detail, structured as
    # dict[handle, list[record]] (same shape as compute_mttr returns).
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
    ])
    r = _run('--json', '--records', str(log))
    assert r.returncode == 0
    payload = json.loads(r.stdout)
    assert isinstance(payload, dict)
    assert '@hot' in payload
    assert payload['@hot'][0]['duration_s'] == 3600
    assert payload['@hot'][0]['prev_bucket'] == 0.9


# ── --records text output ──────────────────────────────────────────────


def test_records_text_shows_per_incident_lines(tmp_path):
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
    ])
    r = _run('--records', str(log))
    assert r.returncode == 0
    assert '@hot' in r.stdout
    assert 'duration_s=3600' in r.stdout
    assert 'prev_bucket=0.9' in r.stdout


# ── --warn-type filter ─────────────────────────────────────────────────


def test_warn_type_filter_excludes_other_metrics(tmp_path):
    # Mix two warn types; --warn-type=other_metric should see only the
    # other_metric pair, not the partial_error_rate pair.
    other_warn = (
        '2026-05-23T04:00:00Z sync_event: warn delta=0 handle=@hot '
        'rate=10 threshold=5 type=other_metric window_hours=1'
    )
    other_rec = (
        '2026-05-23T04:30:00Z sync_event: recovered delta=0 handle=@hot '
        'prev_bucket=10 type=other_metric'
    )
    log = _make_log(tmp_path, [
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
        other_warn, other_rec,
    ])
    r = _run('--warn-type', 'other_metric', '--json', str(log))
    assert r.returncode == 0
    payload = json.loads(r.stdout)
    assert payload[0]['mean_s'] == 1800  # 30 min for other_metric


# ── error handling ─────────────────────────────────────────────────────


def test_missing_log_file_exits_1_with_actionable_stderr(tmp_path):
    r = _run(str(tmp_path / "never.log"))
    assert r.returncode == 1
    assert 'log file not found' in r.stderr
    # Operator hint included for first-time invocations
    assert 'project root' in r.stderr


def test_bad_argument_exits_2(tmp_path):
    # argparse defaults to exit 2 on unknown flag — pin for operator
    # script reliability.
    r = _run('--no-such-flag')
    assert r.returncode == 2
    assert 'usage' in r.stderr.lower() or 'unrecognized' in r.stderr.lower()


def test_help_exits_0_with_usage(tmp_path):
    r = _run('--help')
    assert r.returncode == 0
    assert 'usage' in r.stdout.lower()
    assert 'log_path' in r.stdout


# ── sanity: malformed log lines silently skipped ──────────────────────


def test_log_with_unparseable_lines_still_returns_valid_records(tmp_path):
    log = _make_log(tmp_path, [
        'garbage line 1',
        '',
        '2026-05-23T04:00:00Z sync_event: skipped delta=75 blocker=recent_failures',
        _warn('2026-05-23T04:00:00Z', '@hot', 0.9),
        _recovered('2026-05-23T05:00:00Z', '@hot', 0.9),
    ])
    r = _run('--json', str(log))
    assert r.returncode == 0
    payload = json.loads(r.stdout)
    assert len(payload) == 1
    assert payload[0]['handle'] == '@hot'


# ── Production-shape volume e2e ────────────────────────────────────────
#
# Existing 11 tests use 1-3 warn/recovered pairs per handle. Real
# production: launchd hourly cron + sticky regimes → sync.log
# accumulates 168 warns + ~100 recovered pairs per handle per week.
# At 2 active handles (current production: @bmw_intokyo +
# @hal.lifedesign), weekly log is ~500+ relevant lines mixed with
# 5000+ non-MTTR lines (guard logs, DRY: would commit, etc.).
#
# Operator pain class not covered: scanner that misses pairs at
# scale, summarise that drops handles when log has interleaved
# noise, performance regression that makes hourly mttr-monitor
# noticeable. Mirrors the cron-latency.mjs production-shape e2e
# pattern (commit 6a71eca, submodule side).


def _seeded_rand(seed: int):
    """Deterministic pseudo-random for reproducible test runs."""
    state = [seed]
    def _next() -> float:
        state[0] = (state[0] * 9301 + 49297) % 233280
        return state[0] / 233280
    return _next


def _make_production_shape_log(tmp_path):
    """Build a synthetic sync.log with production-shape volume.

    Returns (path, expected_per_handle) where expected is dict of
    {handle: incident_count}.
    """
    rng = _seeded_rand(42)
    handles = ["@bmw_intokyo", "@hal.lifedesign", "@chronic", "@slow", "@flaky"]
    lines: list[str] = []
    expected: dict[str, int] = {}
    base_epoch = 1_700_000_000  # 2023-11-14 — deterministic per-handle ts

    for hi, h in enumerate(handles):
        # 80 warn/recovered pairs per handle = 160 lines/handle.
        # Each pair: warn @ ts_i, recovered @ ts_i + (60..3600)s.
        # Stagger handles by 1000s so events don't collide on same ts.
        pair_count = 80
        for i in range(pair_count):
            warn_ts = base_epoch + hi * 1000 + i * 7200  # 2h apart
            duration_s = int(60 + rng() * 3540)  # 1m-1h MTTR
            rec_ts = warn_ts + duration_s
            # ISO-8601 with Z suffix (matches sync_guards.format_outcome_event).
            import time
            warn_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(warn_ts))
            rec_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(rec_ts))
            rate = 0.5 + rng() * 0.5  # 0.5-1.0 plausible
            lines.append(_warn(warn_iso, h, round(rate, 2)))
            lines.append(_recovered(rec_iso, h, round(rate, 2)))
        expected[h] = pair_count

    # 🔒 IMPORTANT: keep warn/recovered pair file-order intact.
    # compute_mttr_from_log scans in file order (production sync.log
    # is append-only chronological — operators never get out-of-order
    # writes). Shuffling pairs would test a behaviour that production
    # never produces AND break the scanner's "warn opens, recovered
    # closes" pairing rule. Instead, generate noise separately and
    # interleave at random positions BETWEEN pair lines (never
    # between a pair's warn and its recovered).
    #
    # Approach: build pair_lines in order, then for each noise line
    # pick a random insertion point in the pair_lines, biased to
    # NOT split adjacent warn/recovered pairs.
    pair_lines = lines
    noise_lines: list[str] = []
    for i in range(5000):
        kind = int(rng() * 4)
        if kind == 0:
            noise_lines.append(f"2026-05-23T12:00:{i % 60:02d}Z DRY: would `git add` + commit \"snapshot\"")
        elif kind == 1:
            noise_lines.append(f"2026-05-23T12:00:{i % 60:02d}Z   guard: OK  | delta=0")
        elif kind == 2:
            noise_lines.append(f"2026-05-23T12:00:{i % 60:02d}Z db_max=44 cursor=43 delta=1 proceed=True")
        else:
            noise_lines.append(f"2026-05-23T12:00:{i % 60:02d}Z   guard: SKIP | recent failures detected")

    # Insert noise only at EVEN indices into pair_lines (i.e., before
    # warn lines or after recovered lines, never between a warn and
    # its recovered). pair_lines is structured as [warn0, rec0,
    # warn1, rec1, ...] so even indices = warn-line positions =
    # always pair-boundary insertion-safe.
    output: list[str] = []
    noise_idx = 0
    for i, line in enumerate(pair_lines):
        if i % 2 == 0 and noise_idx < len(noise_lines):
            # Insert a random burst of noise (0-3 lines) before this warn.
            burst = int(rng() * 4)
            for _ in range(min(burst, len(noise_lines) - noise_idx)):
                output.append(noise_lines[noise_idx])
                noise_idx += 1
        output.append(line)
    # Append any remaining noise at the end.
    output.extend(noise_lines[noise_idx:])
    lines = output

    log = tmp_path / "production-shape-sync.log"
    log.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return log, expected


def test_production_shape_aggregates_all_pairs_without_dropping(tmp_path):
    # 🔒 5 handles × 80 pairs each + 5000 noise lines. Aggregator
    # must surface every handle with the exact incident count.
    log, expected = _make_production_shape_log(tmp_path)
    r = _run('--json', str(log))
    assert r.returncode == 0
    summary = json.loads(r.stdout)
    by_handle = {row['handle']: row for row in summary}
    for handle, count in expected.items():
        assert handle in by_handle, f"handle {handle} dropped from summary"
        assert by_handle[handle]['incidents'] == count, (
            f"handle {handle}: expected {count} incidents, got "
            f"{by_handle[handle]['incidents']}"
        )


def test_production_shape_summary_invariants_per_handle(tmp_path):
    # 🔒 For every handle, stats must respect ordering:
    # 0 < median <= mean <= max AND total ≈ mean × incidents.
    # Catches summarise that mis-aggregates at scale.
    log, _ = _make_production_shape_log(tmp_path)
    r = _run('--json', str(log))
    assert r.returncode == 0
    summary = json.loads(r.stdout)
    for row in summary:
        assert row['incidents'] > 0
        assert row['median_s'] > 0
        assert row['median_s'] <= row['max_s'], (
            f"{row['handle']}: median {row['median_s']} > max {row['max_s']}"
        )
        assert row['mean_s'] <= row['max_s']
        # total_s == sum of per-incident durations ≈ mean × count.
        expected_total = row['mean_s'] * row['incidents']
        # Allow ±incidents drift for integer-rounding accumulation.
        assert abs(row['total_s'] - expected_total) <= row['incidents'], (
            f"{row['handle']}: total {row['total_s']} drifts from "
            f"mean*count {expected_total} by >{row['incidents']}s"
        )


def test_production_shape_cli_completes_under_3s(tmp_path):
    # 🔒 Performance budget: ~5800 lines total should aggregate in
    # well under 3s. Pin against future O(n²) regression that would
    # make hourly mttr monitoring uncomfortable for operator.
    import time as _time
    log, _ = _make_production_shape_log(tmp_path)
    start = _time.monotonic()
    r = _run('--json', str(log))
    elapsed = _time.monotonic() - start
    assert r.returncode == 0
    assert elapsed < 3.0, (
        f"mttr.py took {elapsed:.2f}s on production-shape log "
        f"(~5800 lines); budget 3s. O(n²) regression?"
    )
