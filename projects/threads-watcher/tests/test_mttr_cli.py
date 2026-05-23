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
