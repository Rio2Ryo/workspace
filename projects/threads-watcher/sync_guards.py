"""Pure-Python ports of the gate checks implemented in `sync.sh.example`.

The shell script is the runtime path (launchd → bash). These helpers exist
so each guard can be unit-tested deterministically against synthetic SQLite
and JSON fixtures, without invoking bash or sqlite3 CLI. They are *also*
import-safe for any future Python orchestrator that wants to replace the
shell script with equivalent behaviour.

Guard semantics mirror the shell exactly. If you change a threshold here,
mirror it in sync.sh.example (or, better, replace the shell with this).
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path


# ── Tunables (must match sync.sh.example defaults) ──────────────────────

DEFAULT_COMMIT_MIN_GAP_SEC = 3600
DEFAULT_RECENT_CHECKS_WINDOW = 3
BAD_CHECK_STATUSES = frozenset({"error"})  # matches `grep -qi 'error'`


@dataclass(frozen=True)
class GuardDecision:
    """Single guard outcome.

    `proceed` is True only if every guard allows the sync to continue.
    `reason` is the human-readable explanation logged either way.
    `kind` is the canonical guard identifier ('detect_delta',
    'recent_failures', 'commit_gap', 'snapshot_sanity') used by
    structured event logs so operators can grep
        `grep "sync_event: skipped" logs/sync.log \\
            | grep -o "blocker=[a-z_]*" | sort | uniq -c`
    to histogram which guard dominates. Defaults to empty string for
    backward-compat with any caller that constructs GuardDecision
    directly without the new field.
    """

    proceed: bool
    reason: str
    kind: str = ''


# ── 1. DB delta detection ───────────────────────────────────────────────


def detect_delta(current_max: int, last_cursor: int) -> GuardDecision:
    """Skip when DB hasn't produced new rows since the last successful sync.

    The shell uses `<=` so an unchanged cursor (no growth) is also a skip.
    Negative cursor is treated as 0 to tolerate a corrupt cursor file.
    """
    cursor = max(0, last_cursor)
    if current_max <= cursor:
        return GuardDecision(False, f"no delta (max={current_max} cursor={cursor})", kind='detect_delta')
    return GuardDecision(True, f"delta={current_max - cursor}", kind='detect_delta')


# ── 2. Recent-failures guard ────────────────────────────────────────────


def recent_failures_guard(
    conn: sqlite3.Connection,
    *,
    window: int = DEFAULT_RECENT_CHECKS_WINDOW,
    allow_sticky_partial_error_regime: bool = False,
) -> GuardDecision:
    """Skip when any of the last `window` checks reported an error.

    Mirrors the shell's `grep -qi 'error'` against deduped recent statuses.
    'partial_error' contains the substring 'error' and so also triggers
    the skip — match the shell exactly even though we'd arguably prefer
    a stricter set test. If/when the shell tightens this, update both.

    Sticky-partial-error-regime escape valve (opt-in)
    -------------------------------------------------
    Default off: behaviour identical to the long-standing shell port,
    callers without the new kwarg see no change.

    When True, the guard distinguishes two failure shapes:
      (a) "Sticky regime" — every check in the window is `partial_error`
          AND all share the IDENTICAL `error` reason string. This is
          the signature of a stable post-count drop (Threads UI change
          or true post deletions): scraping IS still working, just
          consistently below previous_max. Allow publish so the
          snapshot reflects current reality — the alternative is
          permanent silent staleness (observed 2026-05-23: 93% of
          recent 30 checks were the same `found=4 previous_max=15`
          partial_error, sync blocked since the regime started).
      (b) "Transient" — mixed statuses, mixed error strings, or any
          full `status='error'`. Still block (current behaviour) —
          this is real instability and publishing now would freeze
          a half-broken state.

    The regime check requires `window >= 2` so a single partial_error
    can't by itself satisfy the "all checks share" predicate
    vacuously. Below that we fall through to the strict path.
    """
    rows = conn.execute(
        "SELECT status, error FROM checks ORDER BY id DESC LIMIT ?",
        (window,),
    ).fetchall()
    statuses = [str(row[0]) for row in rows]
    errors = [row[1] if row[1] is not None else "" for row in rows]
    bad = [s for s in statuses if "error" in s.lower()]
    if not bad:
        return GuardDecision(
            True, f"recent statuses ok (statuses={','.join(statuses) or '<none>'})",
            kind='recent_failures',
        )

    if (
        allow_sticky_partial_error_regime
        and len(rows) >= max(2, window)
        and all(s == "partial_error" for s in statuses)
        and len(set(errors)) == 1
        and errors[0] != ""
    ):
        # All `window` checks are the same partial_error shape — stable
        # regime. Permit the publish so the dashboard reflects the
        # current state instead of an indefinite stale snapshot.
        return GuardDecision(
            True,
            f"sticky partial_error regime (window={window}, reason={errors[0]!r})",
            kind='recent_failures',
        )

    return GuardDecision(
        False,
        f"recent failures detected (statuses={','.join(statuses) or '<none>'})",
        kind='recent_failures',
    )


# ── 3. Commit-frequency guard ───────────────────────────────────────────


def commit_gap_guard(
    last_commit_ts: int,
    now_ts: int,
    *,
    min_gap_sec: int = DEFAULT_COMMIT_MIN_GAP_SEC,
) -> GuardDecision:
    """Skip when last snapshot commit happened too recently.

    `last_commit_ts == 0` means the file was never committed (or git log
    returned nothing) — allow the first commit through, as the shell does.
    """
    if last_commit_ts <= 0:
        return GuardDecision(True, "no prior commit recorded; allowing first sync", kind='commit_gap')
    gap = now_ts - last_commit_ts
    if gap < min_gap_sec:
        return GuardDecision(False, f"commit gap {gap}s < {min_gap_sec}s", kind='commit_gap')
    return GuardDecision(True, f"gap={gap}s", kind='commit_gap')


# ── 4. Snapshot sanity (no BLOB / no local_path leaked) ─────────────────


FORBIDDEN_POST_KEYS = frozenset({"screenshot_png", "local_path"})


def _find_forbidden_key(node: object, trail: str) -> tuple[str, str] | None:
    """Walk dict/list trees, returning (forbidden_key, path) on first hit.

    Only DICT KEYS trip the guard — string values containing the literal
    text 'local_path' are legitimate (e.g., human-readable error
    messages) and must not false-positive.

    Returns None when nothing forbidden is present.
    """
    if isinstance(node, dict):
        for key, value in node.items():
            if key in FORBIDDEN_POST_KEYS:
                here = f"{trail}.{key}" if trail else key
                return key, here
            child_trail = f"{trail}.{key}" if trail else key
            found = _find_forbidden_key(value, child_trail)
            if found is not None:
                return found
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            child_trail = f"{trail}[{idx}]"
            found = _find_forbidden_key(item, child_trail)
            if found is not None:
                return found
    return None


def snapshot_sanity_check(snapshot_path: Path) -> GuardDecision:
    """Skip when the public snapshot has leaked private fields.

    The threads-watcher public status JSON must never expose the raw
    screenshot bytes (privacy/size) nor the local filesystem path
    (information disclosure). The shell does the same check via embedded
    Python; this is the canonical Python version.

    Walks the FULL snapshot tree (dicts + lists, all depths). Catches
    leaks not just in posts[i] but also in last_check, recent_stats,
    sync_state, and any future top-level field. Pre-rewrite the guard
    only inspected `posts[i].keys()`, so a `last_check.error.local_path`
    or a top-level `local_path` would have shipped to the public web UI
    without the guard noticing.
    """
    try:
        data = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return GuardDecision(False, f"snapshot not found: {snapshot_path}", kind='snapshot_sanity')
    except json.JSONDecodeError as exc:
        return GuardDecision(False, f"snapshot is not valid JSON: {exc}", kind='snapshot_sanity')

    # Valid JSON whose top level is not an object (a list / string /
    # number / null) — `.get` below would raise AttributeError. A guard
    # must reject it cleanly, not crash evaluate_all with a traceback.
    if not isinstance(data, dict):
        return GuardDecision(
            False, f"snapshot is not a JSON object (got {type(data).__name__})",
            kind='snapshot_sanity',
        )

    # Posts list must contain dicts only (per-element type pin).
    posts = data.get("posts") or []
    for idx, post in enumerate(posts):
        if not isinstance(post, dict):
            return GuardDecision(False, f"post[{idx}] is not an object", kind='snapshot_sanity')

    # Deep walk over the whole payload (root included).
    found = _find_forbidden_key(data, trail="")
    if found is not None:
        key, where = found
        # Format the location nicely for the historic `post[i] leaked...`
        # reason format used pre-rewrite tests, otherwise show the path
        # we found (e.g., `last_check.error.local_path`).
        if where.startswith("posts[") and where.count(".") == 1:
            # e.g. posts[1].screenshot_png → "post[1] leaked..." (preserve
            # the legacy phrasing exercised by existing tests).
            idx_part = where.split(".", 1)[0]  # 'posts[1]'
            idx = idx_part[len("posts["):-1]
            return GuardDecision(
                False, f"post[{idx}] leaked forbidden keys: ['{key}']",
                kind='snapshot_sanity',
            )
        return GuardDecision(
            False, f"leaked forbidden key at {where}: '{key}'",
            kind='snapshot_sanity',
        )

    return GuardDecision(True, f"snapshot ok ({len(posts)} posts checked)", kind='snapshot_sanity')


# ── Structured event-log line for grep-able outcomes ───────────────────


# Every kind a guard can set, plus the non-guard outcomes that sync.py
# emits. Pinned here so a future GuardDecision with a typo'd kind shows
# up as 'unknown' in the event line rather than silently passing through.
KNOWN_BLOCKER_KINDS = frozenset({
    'detect_delta',
    'recent_failures',
    'commit_gap',
    'snapshot_sanity',
})

OUTCOME_EVENTS = frozenset({
    # guard short-circuited
    'skipped',
    # would have committed but --confirm not passed
    'dry_run',
    # actually committed (commit done, push status separate)
    'committed',
    # commit + push both succeeded
    'pushed',
    # something bailed (lock contention, git failure, etc.)
    'error',
    # health-signal alert (not a sync outcome per se — fired separately
    # when an observed metric crosses a threshold). Requires `type=<known>`
    # in extra; see WARN_TYPES below.
    'warn',
    # positive transition: a metric that was previously warning is now
    # below threshold. The mirror of `warn`; same `type=<known>` required.
    # Lets operators grep `sync_event: recovered` for regime-cleared
    # signals without polling the dashboard. (Discord/Slack alerting
    # can pair the recovered event with the prior warn to compute MTTR.)
    'recovered',
})


# Vocabulary for the `warn` outcome's `type=` field. Closed set so a
# future typo on the caller side ('partial_error_rates' with trailing 's')
# raises ValueError instead of silently shipping a line operators won't
# grep for. Mirror of KNOWN_BLOCKER_KINDS shape.
WARN_TYPES = frozenset({
    # partial_error rate (recent_stats() per-handle) above threshold —
    # signals a sticky DOM-regression regime that the dashboard already
    # shows in red. Brings the signal into the grep-able log surface
    # so external alerting (Discord, monitoring tools) can latch onto it
    # without depending on the dashboard render layer.
    'partial_error_rate',
})


def format_outcome_event(
    outcome: str,
    *,
    delta: int,
    blocker_kind: str | None = None,
    extra: dict[str, object] | None = None,
) -> str:
    """Build a stable, grep-friendly single-line event for the sync log.

    Shape:
        sync_event: <outcome> delta=<n> [blocker=<kind>] [k=v ...]

    Why this exists
    ---------------
    Prior to this helper, the only signal in logs/sync.log about WHICH
    guard blocked a tick was the multi-line _log_decision prose:

        db_max=75 cursor=0 delta=75 proceed=False
          guard: OK  | delta=75
          guard: SKIP | recent failures detected (statuses=...)

    Operators couldn't run `grep "sync_event" logs/sync.log | sort | uniq -c`
    to see the histogram of blockers. This helper emits one stable line
    per invocation so:

        grep "sync_event: skipped" logs/sync.log \\
            | grep -o "blocker=[a-z_]*" | sort | uniq -c

    works out of the box. Mirrors the discipline Second Brain
    `index.ts:scheduled()` enforces with its `cron_*` / `cron_*_skipped`
    log events.
    """
    if outcome not in OUTCOME_EVENTS:
        raise ValueError(
            f"unknown outcome {outcome!r}; must be one of {sorted(OUTCOME_EVENTS)}",
        )
    if outcome in ('warn', 'recovered'):
        # Both warn and recovered lines MUST carry a `type=<known>` so
        # operator-side grep by type ('grep "type=partial_error_rate"')
        # is dependable. A missing or unknown type means the helper's
        # call site was wrong; raise loudly instead of silently emitting
        # a line operators can't filter on.
        ev_type = (extra or {}).get('type')
        if ev_type not in WARN_TYPES:
            raise ValueError(
                f"{outcome} outcome requires extra['type'] in {sorted(WARN_TYPES)}; "
                f"got {ev_type!r}",
            )
    parts = [f"sync_event: {outcome}", f"delta={delta}"]
    if outcome == 'skipped':
        # Required for skipped — without the kind, the entire reason
        # for this helper's existence is lost. Default to 'unknown'
        # so the line still emits but the operator sees the gap.
        kind = blocker_kind if blocker_kind in KNOWN_BLOCKER_KINDS else 'unknown'
        parts.append(f"blocker={kind}")
    if extra:
        for k, v in sorted(extra.items()):
            # Keep values shell-safe: no quotes, no spaces.
            sv = str(v).replace(' ', '_').replace('"', '').replace("'", '')
            parts.append(f"{k}={sv}")
    return ' '.join(parts)


# ── Per-handle health-signal warnings (partial_error_rate) ─────────────


# Default threshold for surfacing a partial_error_rate warning. Matches
# the dashboard's `.err` class threshold (commit e759120 surfaces this
# visually); duplicated as a constant so the log surface uses the same
# number.
DEFAULT_PARTIAL_ERROR_RATE_THRESHOLD = 0.5
DEFAULT_WARN_WINDOW_HOURS = 1


# Heartbeat: re-emit a warning at least this often even if the bucket
# hasn't moved, so operators can confirm the regime is still active
# from the log file alone. 1 hour matches the existing publish.log /
# auto-restart.out.log dedup intervals so all three log surfaces have
# the same "is anything alive?" cadence.
DEFAULT_WARN_HEARTBEAT_SEC = 3600

# Bucket the rate to 0.1 granularity. A 92.9% → 93.1% twitch is not
# an operationally interesting state change; a 50% → 70% jump is.
# Bucketing avoids re-emit storms when partial_error_rate flickers
# around a threshold edge tick-over-tick.
_RATE_BUCKET_GRANULARITY = 0.1


def _rate_bucket(rate: float) -> float:
    """Round `rate` DOWN to the nearest 0.1. 0.929 → 0.9, 0.5 → 0.5,
    0.4999 → 0.4. Stable string representation for state-file storage."""
    return round((int(rate / _RATE_BUCKET_GRANULARITY) * _RATE_BUCKET_GRANULARITY), 1)


def filter_warnings_for_emit(
    warnings: list[dict],
    state_path: Path,
    *,
    now_ts: int,
    heartbeat_sec: int = DEFAULT_WARN_HEARTBEAT_SEC,
) -> tuple[list[dict], list[dict], dict]:
    """Apply heartbeat + rate-bucket dedup to a list of warning dicts,
    AND detect handle recoveries (warned previously, not in this tick).

    Returns (emittable, recovered, new_state):
        emittable: warnings the caller SHOULD log this tick (warn events)
        recovered: handles that WERE in persisted state but are not in
                   `warnings` this tick — caller SHOULD emit one
                   `sync_event: recovered` per entry. Each dict has
                   `{handle, prev_bucket}` so the recovered line can
                   surface how far the rate fell.
        new_state: dict to persist back to `state_path`

    For each handle in `warnings`:
      - If the persisted bucket differs from the current bucket (a
        real regime shift), emit + update state.
      - Else if more than `heartbeat_sec` has elapsed since the last
        logged tick, emit a heartbeat + restamp.
      - Else suppress.

    Handles previously in state but NOT in `warnings` are surfaced in
    `recovered` (positive transition signal) AND dropped from
    `new_state` — a future tick where they re-trigger starts fresh and
    emits a fresh warn.

    Why this exists
    ---------------
    The warn line from commit 090e9a2 emits per-invocation, so a
    sustained partial_error_rate regime would emit ~288 lines/day/handle
    at the launchd 5-min cadence. Operator grep would see the same
    line in a tight loop; real regime shifts (bucket crossings) would
    be lost in the noise. Same dedup pattern as
    publish-if-delta.sh:621d32b / auto-restart-if-stale.sh:e73e85a.

    The recovered surface (this commit's addition) closes the
    operational gap of the warn line: a regime that clears used to be
    silent — the handle just disappeared from state and operators only
    knew via "I stopped seeing warn lines for @hot" which depends on
    actively watching. With the explicit recovered event, external
    alerting can pair (warn, recovered) for incident MTTR + Slack
    "@channel partial_error regime for @hot cleared".
    """
    state: dict = {}
    try:
        state = json.loads(state_path.read_text(encoding='utf-8'))
        if not isinstance(state, dict):
            state = {}
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}

    emittable: list[dict] = []
    new_state: dict = {}
    current_handles: set = set()

    for w in warnings:
        handle = w['handle']
        current_handles.add(handle)
        bucket = _rate_bucket(w['rate'])
        prev = state.get(handle)
        prev_bucket = prev.get('bucket') if isinstance(prev, dict) else None
        prev_ts = int(prev.get('ts', 0)) if isinstance(prev, dict) else 0
        elapsed = now_ts - prev_ts
        should_emit = (
            prev_bucket != bucket
            or elapsed >= heartbeat_sec
        )
        if should_emit:
            emittable.append(w)
            new_state[handle] = {'bucket': bucket, 'ts': now_ts}
        else:
            # suppress — keep the prior stamp so the heartbeat clock
            # continues to count from the last EMITTED tick, not the
            # most recent suppressed one (which would re-set the
            # heartbeat every tick and emit nothing forever).
            new_state[handle] = prev

    # Recovery detection: any handle in the persisted state that's
    # NOT in this tick's warnings has dropped below threshold.
    # Surface explicitly + drop from new_state so a future re-trigger
    # starts fresh.
    recovered: list[dict] = []
    for handle, prev in state.items():
        if handle in current_handles:
            continue
        if not isinstance(prev, dict):
            continue
        recovered.append({
            'handle': handle,
            'prev_bucket': prev.get('bucket'),
        })

    return emittable, recovered, new_state


# ── MTTR helper: pair (warn, recovered) events from a log file ──────────


# Log timestamp prefix shape: `2026-05-23T04:49:35Z sync_event: ...`
# Lines without this exact format are silently skipped; an operator who
# wants to consume a different log format should pass a pre-filtered
# Iterable[str] to the helper.
import re as _re  # late import scoped to MTTR helper

_LOG_LINE_RE = _re.compile(
    r'^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+'
    r'sync_event:\s+(?P<outcome>warn|recovered)\s+'
    r'(?P<kvs>.*)$'
)


def _parse_kvs(text: str) -> dict[str, str]:
    """Parse the trailing `k=v k=v` portion of a sync_event line.
    Values are shell-safe (no spaces, no quotes), so a plain split-on-
    space works."""
    out: dict[str, str] = {}
    for tok in text.split():
        if '=' not in tok:
            continue
        k, v = tok.split('=', 1)
        out[k] = v
    return out


def _ts_to_epoch(ts: str) -> int:
    """ISO-8601 Z-suffixed → epoch seconds. The log emits this format
    via `date -u +%FT%TZ` in the bash wrapper / Python TeeLogger."""
    from datetime import datetime, timezone
    return int(datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp())


def compute_mttr_from_log(
    log_lines: 'Iterable[str]',  # type: ignore[name-defined]  # forward ref
    *,
    warn_type: str = 'partial_error_rate',
) -> dict[str, list[dict]]:
    """Pair (warn, recovered) events per handle and return MTTR records.

    Returns a dict mapping handle → list of incident records, each:
        { warn_ts: int, recovered_ts: int, duration_s: int, prev_bucket: float | None }

    Pairing rule
    ------------
    For each handle, scan lines in order:
      - A `warn` line OPENS an incident if no incident is currently
        open for that handle. Subsequent warns (heartbeat re-emits,
        bucket-crossing re-emits) do NOT open a new incident — they
        belong to the same regime.
      - A `recovered` line CLOSES the currently-open incident,
        producing an MTTR record with duration_s = recovered_ts -
        warn_ts.

    Incidents without a matching recovered (still active at end of
    log) are NOT returned — operators reading the dashboard see them
    as "still warning" via the live warn lines.

    Why this exists
    ---------------
    Commit 0f1bc49 made (warn, recovered) pairs grep-able. The next
    step is computing MTTR from them — without a helper, every
    operator script reimplements the pairing logic. Pure function so
    Discord/Slack notify hooks, dashboards, and ad-hoc reports all
    share one source of truth.

    Filters on `warn_type` — defaults to 'partial_error_rate' (the
    only type today), but accepts future types as they land.
    """
    open_incidents: dict[str, int] = {}  # handle → warn_ts (epoch)
    open_prev_bucket: dict[str, float | None] = {}
    closed: dict[str, list[dict]] = {}

    for raw in log_lines:
        m = _LOG_LINE_RE.match(raw.rstrip('\n'))
        if not m:
            continue
        kvs = _parse_kvs(m.group('kvs'))
        if kvs.get('type') != warn_type:
            continue
        handle = kvs.get('handle')
        if not handle:
            continue
        ts_epoch = _ts_to_epoch(m.group('ts'))
        outcome = m.group('outcome')

        if outcome == 'warn':
            if handle not in open_incidents:
                # Open a new incident.
                open_incidents[handle] = ts_epoch
                # Capture prev_bucket from the warn's `rate` (it's the
                # CURRENT bucket since this is the first warn).
                try:
                    rate = float(kvs.get('rate', '0'))
                    open_prev_bucket[handle] = _rate_bucket(rate)
                except ValueError:
                    open_prev_bucket[handle] = None
            # Heartbeat / bucket-crossing re-emit — incident already open;
            # skip (don't reopen).
        elif outcome == 'recovered':
            if handle not in open_incidents:
                # Recovery without a preceding warn (log was truncated
                # or the warn predates the scan window) — skip.
                continue
            warn_ts = open_incidents.pop(handle)
            prev_bucket = open_prev_bucket.pop(handle, None)
            # The recovered line may also carry prev_bucket; prefer it
            # since it's stamped at recovery time (= the bucket from
            # the LAST persisted warn state, which may differ from the
            # opening warn's bucket if the rate rose mid-regime).
            try:
                bucket_from_rec = float(kvs.get('prev_bucket', ''))
            except ValueError:
                bucket_from_rec = None
            if bucket_from_rec is not None:
                prev_bucket = bucket_from_rec
            closed.setdefault(handle, []).append({
                'warn_ts': warn_ts,
                'recovered_ts': ts_epoch,
                'duration_s': ts_epoch - warn_ts,
                'prev_bucket': prev_bucket,
            })

    return closed


def summarise_mttr(
    records_by_handle: dict[str, list[dict]],
) -> list[dict]:
    """Aggregate MTTR records into per-handle stats.

    Returns a list (sorted by handle for stable output) of:
        { handle, incidents, total_s, mean_s, median_s, max_s }

    Empty record lists produce no row (the helper output of
    compute_mttr_from_log only contains handles with at least one
    closed incident).
    """
    out: list[dict] = []
    for handle in sorted(records_by_handle):
        records = records_by_handle[handle]
        if not records:
            continue
        durations = sorted(r['duration_s'] for r in records)
        n = len(durations)
        mid = n // 2
        median = durations[mid] if n % 2 == 1 else (durations[mid - 1] + durations[mid]) // 2
        out.append({
            'handle': handle,
            'incidents': n,
            'total_s': sum(durations),
            'mean_s': sum(durations) // n,
            'median_s': median,
            'max_s': max(durations),
        })
    return out


def compute_partial_error_rate_warnings(
    conn: sqlite3.Connection,
    *,
    threshold: float = DEFAULT_PARTIAL_ERROR_RATE_THRESHOLD,
    window_hours: int = DEFAULT_WARN_WINDOW_HOURS,
) -> list[dict]:
    """Per-handle warning list when partial_error_rate >= threshold.

    Returns one dict per offending handle:
        { handle, rate (rounded to 3dp), threshold, window_hours,
          total (checks in window), top_reason (str or '') }

    Order is deterministic (sorted by handle) so the emitted log
    lines have stable order tick-over-tick — easier for diff-based
    monitoring.

    Why this exists
    ---------------
    The dashboard UI already shows partial_error_rate >= 0.5 in red
    (commit e759120). But the dashboard is a poll-only signal — no
    external alerting tool can latch onto a red CSS class without
    rendering the page. Surfacing the same threshold check as a
    structured `sync_event: warn type=partial_error_rate …` line
    in logs/sync.log gives Discord/Slack/PagerDuty hooks a grep
    pattern to alert on:

        grep "sync_event: warn type=partial_error_rate" logs/sync.log

    Window default = 1h matches the dashboard's most-recent window,
    so the log signal lines up with what an operator sees there.
    """
    # Late import to keep sync_guards otherwise dependency-free for the
    # synthetic-data tests that import the helpers without a DB.
    from db import recent_stats

    handles = [
        str(row[0])
        for row in conn.execute(
            "SELECT DISTINCT handle FROM checks ORDER BY handle"
        ).fetchall()
    ]
    warnings: list[dict] = []
    for h in handles:
        s = recent_stats(conn, h, window_hours=window_hours)
        rate = s['partial_error_rate']
        if rate is None or rate < threshold:
            continue
        top = s.get('top_partial_error_reason') or {}
        warnings.append({
            'handle': h,
            'rate': round(float(rate), 3),
            'threshold': threshold,
            'window_hours': window_hours,
            'total': s['total'],
            'top_reason': str(top.get('reason', '')),
        })
    return warnings


# ── 5. Composite: run all guards in shell order ─────────────────────────


@dataclass(frozen=True)
class SyncDecision:
    proceed: bool
    delta: int  # 0 when no delta or upstream check failed
    decisions: list[GuardDecision]

    def first_blocker(self) -> GuardDecision | None:
        for d in self.decisions:
            if not d.proceed:
                return d
        return None


def evaluate_all(
    *,
    current_max: int,
    last_cursor: int,
    conn: sqlite3.Connection,
    last_commit_ts: int,
    now_ts: int,
    snapshot_path: Path,
    min_gap_sec: int = DEFAULT_COMMIT_MIN_GAP_SEC,
    window: int = DEFAULT_RECENT_CHECKS_WINDOW,
    allow_sticky_partial_error_regime: bool = False,
) -> SyncDecision:
    """Run guards in the same order as the shell, short-circuit on first skip."""
    decisions: list[GuardDecision] = []
    delta_decision = detect_delta(current_max, last_cursor)
    decisions.append(delta_decision)
    if not delta_decision.proceed:
        return SyncDecision(False, 0, decisions)

    fail_decision = recent_failures_guard(
        conn,
        window=window,
        allow_sticky_partial_error_regime=allow_sticky_partial_error_regime,
    )
    decisions.append(fail_decision)
    if not fail_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    gap_decision = commit_gap_guard(last_commit_ts, now_ts, min_gap_sec=min_gap_sec)
    decisions.append(gap_decision)
    if not gap_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    sanity_decision = snapshot_sanity_check(snapshot_path)
    decisions.append(sanity_decision)
    if not sanity_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    return SyncDecision(True, current_max - max(0, last_cursor), decisions)
