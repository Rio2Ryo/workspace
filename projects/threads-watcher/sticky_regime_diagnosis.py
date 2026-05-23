"""Operator-facing diagnostic: would `--allow-sticky-partial-error-regime`
actually change the current sync outcome?

Why this exists
---------------
The `--allow-sticky-partial-error-regime` CLI flag has been Yakon-
pending for multiple turns. The judgment burden is "is the current
regime stable enough to publish through it, or would enabling the
flag risk publishing a half-broken state?"

The watcher logic (sync_guards.recent_failures_guard) already
encodes the semantics: enable only when EVERY check in the window
is `partial_error` AND shares the IDENTICAL error reason. But
operator can't tell from the dashboard alone whether the live DB
satisfies that predicate RIGHT NOW.

This script runs the same guard against threads_watcher.db with
allow=False AND allow=True, compares outcomes, and surfaces the
empirical verdict:

  - "SAFE TO ENABLE" — flag would unblock publish; regime is the
    documented sticky shape (all partial_error, same reason)
  - "NO-OP" — flag wouldn't change behavior right now (e.g.,
    mixed statuses, or no error at all)
  - "INSUFFICIENT DATA" — fewer than `window` checks recorded yet

Reduces Yakon's judgment burden: empirical, current, machine-
checkable evidence vs read-the-source mental model.

Usage
-----
    python sticky_regime_diagnosis.py
    python sticky_regime_diagnosis.py --window 5 --json
    python sticky_regime_diagnosis.py --db /path/to/scratch.db
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
from sync_guards import (  # noqa: E402
    DEFAULT_RECENT_CHECKS_WINDOW, recent_failures_guard,
)


DEFAULT_DB = PROJECT_ROOT / "threads_watcher.db"


def diagnose(conn: sqlite3.Connection, *, window: int) -> dict:
    """Compare guard outcomes with allow=False vs allow=True.
    Returns a structured verdict the CLI dispatcher renders.

    Pure function on the connection so tests can supply scratch
    databases with synthetic check histories.
    """
    rows = conn.execute(
        "SELECT status, error FROM checks ORDER BY id DESC LIMIT ?",
        (window,),
    ).fetchall()
    statuses = [str(r[0]) for r in rows]
    errors = [r[1] if r[1] is not None else "" for r in rows]

    strict = recent_failures_guard(
        conn, window=window, allow_sticky_partial_error_regime=False,
    )
    permissive = recent_failures_guard(
        conn, window=window, allow_sticky_partial_error_regime=True,
    )

    if len(rows) < window:
        verdict = "INSUFFICIENT_DATA"
        reason = (
            f"only {len(rows)} check(s) recorded; need {window} for "
            f"a sticky-regime evaluation (use --window N to lower)."
        )
    elif strict.proceed == permissive.proceed:
        if strict.proceed:
            verdict = "NO_OP"
            reason = "guard already permits publish — flag has no effect"
        else:
            verdict = "NO_OP"
            reason = (
                f"strict blocks AND permissive blocks — regime isn't "
                f"the pure sticky shape (all partial_error + same "
                f"reason). Statuses: {statuses!r}"
            )
    else:
        # strict.proceed=False, permissive.proceed=True → flag WOULD help
        verdict = "SAFE_TO_ENABLE"
        reason = (
            f"strict blocks but permissive permits — current regime "
            f"matches the documented sticky shape. Enabling the flag "
            f"on this DB right now would unblock publish."
        )

    # Distribution summary for operator context.
    from collections import Counter
    status_dist = dict(Counter(statuses))
    unique_errors = sorted(set(e for e in errors if e))
    # 🔒 Per-reason counts — closes the operator-UX gap where
    # status_distribution shows "all partial_error" but verdict is
    # NO_OP because the reasons differ. Without per-reason counts
    # operator has to infer "is the outlier reason 1 flake or 5
    # real divergences?" from the unique-reason list alone. Counter
    # output is JSON-serialisable dict.
    error_reason_dist = dict(Counter(e for e in errors if e))

    return {
        "verdict": verdict,
        "reason": reason,
        "window": window,
        "checks_seen": len(rows),
        "status_distribution": status_dist,
        "unique_error_reasons_count": len(unique_errors),
        "unique_error_reasons": unique_errors,
        "error_reason_distribution": error_reason_dist,
        "strict_proceed": strict.proceed,
        "strict_reason": strict.reason,
        "permissive_proceed": permissive.proceed,
        "permissive_reason": permissive.reason,
    }


# Window sweep used by --recommendation mode. Range covers operator-
# realistic choices: window=3 (default guard) up through 30 (close to
# the production hourly cron's full day of checks). Stops at 30 so a
# fresh DB with < 30 rows doesn't dominate the recommendation logic
# with INSUFFICIENT_DATA noise.
RECOMMENDATION_WINDOWS = (3, 5, 10, 20, 30)

# Cron-friendly transition alerter default state path. Operator who
# wires --alert-on-transition into hourly launchd gets a notification
# only when the recommendation FLIPS (e.g., WAIT → STRONG_ENABLE),
# not on every tick. Same shape as discord_post.py's cooldown state
# (commit 23ef7fc).
DEFAULT_ALERT_STATE_PATH = (
    PROJECT_ROOT / "threads-watcher-status" / "sticky-regime-last-recommendation.json"
)


def _load_last_recommendation(path: Path) -> str | None:
    """Read persisted last recommendation. Returns None on missing /
    malformed file (treat both as no-prior-state, same defensive
    degradation as discord_post.py:_load_cooldown_state)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return None
        v = data.get("recommendation")
        return v if isinstance(v, str) else None
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _save_last_recommendation(path: Path, recommendation: str) -> None:
    """Persist just-rendered recommendation. Best-effort: failure
    WARNs to stderr but doesn't propagate (alert succeeded, missing
    state file just means next tick may re-alert)."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"recommendation": recommendation}),
            encoding="utf-8",
        )
    except OSError as e:
        sys.stderr.write(f"WARN: failed to save alert state to {path}: {e}\n")


def check_transition(
    current: str, last: str | None,
) -> tuple[bool, str]:
    """Decide whether the current recommendation represents a
    transition worth alerting on.

    Returns (alert?, message).

    🔒 First run (no prior state) does NOT alert — alerting on every
    first-time-setup would spam the channel. Operator opts in via a
    state-file priming run or seeds the state-file deliberately.
    """
    if last is None:
        return False, "no prior state — recording current, no transition alert"
    if current == last:
        return False, f"unchanged: {current}"
    return True, f"TRANSITION: {last} → {current}"


def recommend(conn: sqlite3.Connection) -> dict:
    """Multi-window scan + single ENABLE/WAIT/INVESTIGATE recommendation.

    Reduces operator window-choice burden — instead of "did I pick the
    right window?", operator gets a unified recommendation backed by
    per-window evidence.

    Decision matrix:
      - all windows SAFE_TO_ENABLE                  → STRONG_ENABLE
      - small windows SAFE, large windows NO_OP    → CONDITIONAL_ENABLE
      - all NO_OP                                   → WAIT
      - any INSUFFICIENT_DATA in the smaller windows → INSUFFICIENT_DATA
    """
    per_window: dict[int, dict] = {}
    for w in RECOMMENDATION_WINDOWS:
        per_window[w] = diagnose(conn, window=w)

    verdicts = {w: r["verdict"] for w, r in per_window.items()}
    # Smallest window first — operator typically trusts the most-recent
    # signal more than the historical aggregate.
    safe_windows = sorted([w for w, v in verdicts.items() if v == "SAFE_TO_ENABLE"])
    no_op_windows = sorted([w for w, v in verdicts.items() if v == "NO_OP"])
    insufficient_windows = sorted([w for w, v in verdicts.items() if v == "INSUFFICIENT_DATA"])

    # If the smallest window can't even satisfy the predicate, the DB
    # is too fresh — recommend waiting for more check history.
    if RECOMMENDATION_WINDOWS[0] in insufficient_windows:
        return _build_recommendation(
            "INSUFFICIENT_DATA",
            f"DB has fewer than {RECOMMENDATION_WINDOWS[0]} checks recorded; "
            f"wait for the watcher cron to accumulate more history before "
            f"deciding.",
            per_window, safe_windows, no_op_windows, insufficient_windows,
        )

    if not safe_windows:
        return _build_recommendation(
            "WAIT",
            f"No window in {list(RECOMMENDATION_WINDOWS)} satisfies the "
            f"sticky-regime predicate (all-partial_error + same reason). "
            f"Regime not stable enough yet — wait for cleaner check "
            f"history OR investigate the OK/error mix.",
            per_window, safe_windows, no_op_windows, insufficient_windows,
        )

    if set(safe_windows) == set(w for w in RECOMMENDATION_WINDOWS if w not in insufficient_windows):
        return _build_recommendation(
            "STRONG_ENABLE",
            f"Every evaluable window ({safe_windows}) reports "
            f"SAFE_TO_ENABLE — regime is stably sticky across all "
            f"horizons. Enabling --allow-sticky-partial-error-regime "
            f"is the lowest-risk option right now.",
            per_window, safe_windows, no_op_windows, insufficient_windows,
        )

    # Mixed: small windows safe, larger NO_OP → conditional. Operator's
    # call on which horizon they trust.
    return _build_recommendation(
        "CONDITIONAL_ENABLE",
        f"Smaller windows ({safe_windows}) report SAFE_TO_ENABLE but "
        f"larger windows ({no_op_windows}) still see OK/error outliers. "
        f"Enable if you trust the recent signal; wait if you want "
        f"longer-term stability before flipping the flag.",
        per_window, safe_windows, no_op_windows, insufficient_windows,
    )


def _build_recommendation(
    recommendation: str, rationale: str,
    per_window: dict[int, dict],
    safe_windows: list[int],
    no_op_windows: list[int],
    insufficient_windows: list[int],
) -> dict:
    return {
        "recommendation": recommendation,
        "rationale": rationale,
        "safe_windows": safe_windows,
        "no_op_windows": no_op_windows,
        "insufficient_windows": insufficient_windows,
        "per_window_verdict": {w: r["verdict"] for w, r in per_window.items()},
    }


def _render_recommendation(result: dict) -> str:
    emoji = {
        "STRONG_ENABLE": "🟢",
        "CONDITIONAL_ENABLE": "🟡",
        "WAIT": "🔴",
        "INSUFFICIENT_DATA": "❔",
    }.get(result["recommendation"], "❓")
    lines = [
        f"{emoji} {result['recommendation']}",
        f"   {result['rationale']}",
        "",
        "per-window verdicts:",
    ]
    for w in RECOMMENDATION_WINDOWS:
        verdict = result["per_window_verdict"].get(w, "?")
        verdict_emoji = {
            "SAFE_TO_ENABLE": "🟢",
            "NO_OP": "🟡",
            "INSUFFICIENT_DATA": "❔",
        }.get(verdict, "❓")
        lines.append(f"  window={w:>2}: {verdict_emoji} {verdict}")
    return "\n".join(lines)


def _render_text(result: dict) -> str:
    lines = []
    emoji = {
        "SAFE_TO_ENABLE": "🟢",
        "NO_OP": "🟡",
        "INSUFFICIENT_DATA": "❔",
    }.get(result["verdict"], "❓")
    lines.append(f"{emoji} {result['verdict']}")
    lines.append(f"   {result['reason']}")
    lines.append("")
    lines.append(f"window           : last {result['window']} checks "
                 f"(seen {result['checks_seen']})")
    lines.append(f"status distribution: {result['status_distribution']}")
    lines.append(f"unique error reasons: {result['unique_error_reasons_count']}")
    # Per-reason counts in descending order — operator immediately
    # sees "5× found=4, 1× found=6" (dominant + outlier) vs equal
    # split "3× found=4, 3× found=6" (true bimodal divergence).
    if result["error_reason_distribution"]:
        ranked = sorted(
            result["error_reason_distribution"].items(),
            key=lambda kv: (-kv[1], kv[0]),
        )
        for err, count in ranked[:5]:
            lines.append(f"  {count}× {err}")
    lines.append("")
    lines.append(f"strict (default)  : "
                 f"{'PROCEED' if result['strict_proceed'] else 'BLOCK'} "
                 f"— {result['strict_reason']}")
    lines.append(f"permissive (flag) : "
                 f"{'PROCEED' if result['permissive_proceed'] else 'BLOCK'} "
                 f"— {result['permissive_reason']}")
    return "\n".join(lines)


def _cli_main(argv: list[str] | None = None) -> int:
    import argparse
    p = argparse.ArgumentParser(
        prog="sticky_regime_diagnosis.py",
        description=(
            "Decide whether enabling --allow-sticky-partial-error-regime "
            "would change current sync behaviour. Reduces operator "
            "judgment burden by running the guard against the live DB "
            "and reporting the empirical verdict."
        ),
    )
    p.add_argument(
        "--db", type=Path, default=DEFAULT_DB,
        help=f"SQLite path (default: {DEFAULT_DB}).",
    )
    p.add_argument(
        "--window", type=int, default=DEFAULT_RECENT_CHECKS_WINDOW,
        help=f"Number of recent checks to evaluate (default: {DEFAULT_RECENT_CHECKS_WINDOW}).",
    )
    p.add_argument(
        "--json", action="store_true",
        help="Emit machine-readable JSON instead of text.",
    )
    p.add_argument(
        "--recommendation", action="store_true",
        help=(
            "Multi-window sweep + single ENABLE/WAIT recommendation. "
            "Reduces operator window-choice burden: instead of 'did I "
            "pick the right --window?', scans windows "
            "{3,5,10,20,30} and outputs STRONG_ENABLE / "
            "CONDITIONAL_ENABLE / WAIT / INSUFFICIENT_DATA with "
            "per-window evidence. Composes with --json."
        ),
    )
    p.add_argument(
        "--alert-on-transition", action="store_true",
        help=(
            "Cron-friendly: run --recommendation, compare against "
            "the last persisted recommendation, emit a TRANSITION "
            "line (+ exit 0) ONLY when the verdict flipped. Silent "
            "on no-change. Operator wires hourly via launchd; pipes "
            "to discord_post.py for actual notification."
        ),
    )
    p.add_argument(
        "--alert-state-path", type=Path, default=DEFAULT_ALERT_STATE_PATH,
        help=(
            f"State file for --alert-on-transition (last recommendation). "
            f"Default: {DEFAULT_ALERT_STATE_PATH}"
        ),
    )
    p.add_argument(
        "--watch", action="store_true",
        help=(
            "Re-diagnose every --interval seconds until Ctrl+C. tmux "
            "pane常駐 use case — operator keeps a live verdict pane "
            "open during regime debugging to spot the moment the "
            "regime transitions from NO_OP to SAFE_TO_ENABLE."
        ),
    )
    p.add_argument(
        "--interval", type=int, default=60,
        help="Seconds between re-diagnoses in --watch mode. Default 60.",
    )
    args = p.parse_args(argv)

    if args.window <= 0:
        sys.stderr.write(f"ERROR: --window must be > 0, got {args.window}\n")
        return 2

    if args.watch and args.interval <= 0:
        # 🔒 Operator footgun guard (mirror of status.py --watch).
        sys.stderr.write(
            f"ERROR: --interval must be > 0, got {args.interval}\n"
        )
        return 2

    if not args.db.is_file():
        sys.stderr.write(f"ERROR: DB file not found: {args.db}\n")
        return 1

    if args.alert_on_transition:
        return _alert_once(
            args.db, args.alert_state_path, json_mode=args.json,
        )

    if args.recommendation:
        return _recommend_once(args.db, json_mode=args.json)

    if args.watch:
        return _watch_loop(
            args.db, args.window,
            interval=args.interval, json_mode=args.json,
        )
    return _diagnose_once(args.db, args.window, json_mode=args.json)


def _alert_once(
    db_path: Path, alert_state_path: Path, *, json_mode: bool,
) -> int:
    """Run recommendation + compare against persisted last + emit
    only on transition. Always exit 0 — operator chains stdout to
    actual notifier (discord_post.py / mail / etc.)."""
    conn = sqlite3.connect(str(db_path))
    try:
        result = recommend(conn)
    finally:
        conn.close()
    current = result["recommendation"]
    last = _load_last_recommendation(alert_state_path)
    transitioned, message = check_transition(current, last)

    # ALWAYS persist current — so the next cron tick has fresh state
    # even on the no-transition path.
    _save_last_recommendation(alert_state_path, current)

    if json_mode:
        sys.stdout.write(json.dumps({
            "transitioned": transitioned,
            "current_recommendation": current,
            "last_recommendation": last,
            "message": message,
            "rationale": result["rationale"],
        }, indent=2) + "\n")
    elif transitioned:
        # Print to stdout so cron pipes can grep + relay. Silent on
        # no-transition (operator-friendly cron behavior).
        print(message)
        print(f"  rationale: {result['rationale']}")
    # No-transition + non-JSON = no output at all (cron-friendly silence).
    return 0


def _recommend_once(db_path: Path, *, json_mode: bool) -> int:
    """Run multi-window recommendation + render. Mirror of
    _diagnose_once shape."""
    conn = sqlite3.connect(str(db_path))
    try:
        result = recommend(conn)
    finally:
        conn.close()
    if json_mode:
        sys.stdout.write(json.dumps(result, indent=2) + "\n")
    else:
        sys.stdout.write(_render_recommendation(result) + "\n")
    return 0


def _diagnose_once(db_path: Path, window: int, *, json_mode: bool) -> int:
    """Connect → diagnose → render → close. Returns exit code.
    Extracted so --watch can re-invoke per tick without duplicating
    dispatch logic."""
    conn = sqlite3.connect(str(db_path))
    try:
        result = diagnose(conn, window=window)
    finally:
        conn.close()

    if json_mode:
        sys.stdout.write(json.dumps(result, indent=2) + "\n")
    else:
        sys.stdout.write(_render_text(result) + "\n")
    return 0


def _watch_loop(
    db_path: Path, window: int, *,
    interval: int, json_mode: bool, sleep_fn=None,
) -> int:
    """Re-diagnose every `interval` seconds until KeyboardInterrupt.
    Mirror of status.py:_watch_loop (commit 97f76ba) shape. sleep_fn
    injection lets tests run instantly.

    Ctrl+C → exit 0 (operator-initiated). Mid-loop DB errors (e.g.,
    sqlite3.OperationalError from a concurrent vacuum) WARN + continue
    rather than crash the pane."""
    import time
    sleep = sleep_fn if sleep_fn is not None else time.sleep
    CLEAR = "\033[2J\033[H"
    try:
        while True:
            sys.stdout.write(CLEAR)
            sys.stdout.flush()
            try:
                _diagnose_once(db_path, window, json_mode=json_mode)
            except sqlite3.OperationalError as e:
                sys.stderr.write(
                    f"WARN: diagnose tick failed ({type(e).__name__}: {e}); "
                    f"continuing\n"
                )
            sleep(interval)
    except KeyboardInterrupt:
        sys.stderr.write("\n--watch interrupted; exiting cleanly\n")
        return 0


if __name__ == "__main__":
    sys.exit(_cli_main())
