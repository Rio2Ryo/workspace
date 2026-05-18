"""Threads public-profile new-post watcher.

Detects new posts on a public Threads profile via headless Chromium and
saves a full-page screenshot of each new post page. No login, no posting,
no external services.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db import connect, get_seen_post_ids, init_db, latest_snapshot, record_check, save_post_screenshot
from health import (
    check_dom_regression,
    check_process_staleness,
    check_recent_errors,
    judge_partial_error,
    previous_max_found,
)
from playwright.sync_api import (
    Browser,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)
from watcher_pure import (
    _extract_post_ids,
    capture_with_retry,
    collect_post_ids_until_stable,
    combine_error_messages,
    extract_post_ids_from_hrefs,
    process_post_capture,
)


PROJECT_ROOT = Path(__file__).resolve().parent
SCREENSHOTS_DIR = PROJECT_ROOT / "screenshots"
WEB_SNAPSHOT_FILE = PROJECT_ROOT / "threads-watcher-status" / "state.json"
WEB_SNAPSHOT_HANDLE = "@hal.lifedesign"
DB_FILE = PROJECT_ROOT / "threads_watcher.db"

DEFAULT_HANDLE = "@hal.lifedesign"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
PROFILE_LOAD_TIMEOUT_MS = 30_000
POST_LOAD_TIMEOUT_MS = 30_000


def _normalize_handle(handle: str) -> str:
    return handle if handle.startswith("@") else f"@{handle}"


def _write_web_snapshot_from_db(snapshot: dict[str, Any]) -> None:
    """Write a sanitized status snapshot derived from the DB source of truth.

    The public status file intentionally excludes screenshot BLOBs and local file
    paths, but includes proof that screenshots were captured and persisted.
    """
    WEB_SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "handle": snapshot["handle"],
        "last_check": snapshot["last_check"],
        "saved_count": snapshot["saved_count"],
        "posts": snapshot["posts"],
        "snapshot_generated_at": _now_iso(),
    }
    WEB_SNAPSHOT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now_compact() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


# Implementations live in watcher_pure (no playwright dep). Aliases below
# preserve the historical module-private names so the rest of watcher.py
# (and any external import of `watcher._collect_post_ids_until_stable`)
# keeps working unchanged.
_collect_post_ids_until_stable = collect_post_ids_until_stable
_combine_error_messages = combine_error_messages


def _screenshot_post(
    browser: Browser,
    handle: str,
    post_id: str,
    out_dir: Path,
) -> dict[str, Any]:
    handle_no_at = handle.lstrip("@")
    url = f"https://www.threads.com/@{handle_no_at}/post/{post_id}"
    context = browser.new_context(user_agent=DEFAULT_USER_AGENT, viewport={"width": 1280, "height": 1800})
    page = context.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=POST_LOAD_TIMEOUT_MS)
        # Give SPA hydration a moment; networkidle is unreliable on Threads
        try:
            page.wait_for_load_state("networkidle", timeout=8_000)
        except PlaywrightTimeoutError:
            pass
        page.wait_for_timeout(1_500)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{post_id}__{_now_compact()}.png"
        screenshot_png = page.screenshot(path=str(out_path), full_page=True)
        dimensions = page.evaluate("() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })")
        return {
            "post_url": url,
            "png": screenshot_png,
            "path": out_path,
            "width": int(dimensions.get("width")) if dimensions.get("width") else None,
            "height": int(dimensions.get("height")) if dimensions.get("height") else None,
        }
    finally:
        context.close()


def run_once(handle: str, *, baseline_lookback_days: int | None = None) -> int:
    handle = _normalize_handle(handle)
    conn = connect(DB_FILE)
    init_db(conn)

    checked_at = _now_iso()
    found_count = 0
    new_count = 0
    status = "ok"
    error: str | None = None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                handle_no_at = handle.lstrip("@")
                profile_url = f"https://www.threads.com/@{handle_no_at}"
                context = browser.new_context(
                    user_agent=DEFAULT_USER_AGENT,
                    viewport={"width": 1280, "height": 1800},
                    locale="ja-JP",
                )
                page = context.new_page()
                page.goto(profile_url, wait_until="domcontentloaded", timeout=PROFILE_LOAD_TIMEOUT_MS)
                try:
                    page.wait_for_load_state("networkidle", timeout=8_000)
                except PlaywrightTimeoutError:
                    pass
                page.wait_for_timeout(2_000)

                post_ids = _collect_post_ids_until_stable(page, handle)
                found_count = len(post_ids)
                context.close()

                if not post_ids:
                    print(f"[warn] no post links found on {profile_url} — DOM may have changed or content gated", file=sys.stderr)
                prev_max = previous_max_found(conn, handle, lookback_days=baseline_lookback_days)
                partial_reason = judge_partial_error(found_count, prev_max)
                if partial_reason is not None:
                    status = "partial_error"
                    error = partial_reason
                    print(f"[warn] {error}", file=sys.stderr)

                seen_set = set(get_seen_post_ids(conn, handle))
                new_ids = [pid for pid in reversed(post_ids) if pid not in seen_set]
                capture_errors: list[str] = []
                for pid in new_ids:
                    # process_post_capture lives in watcher_pure so the entire
                    # per-post decision (retry, save, log routing) is tested
                    # without booting Chromium. Here we only bind in the
                    # browser/conn instances and replay the outcome.
                    outcome = process_post_capture(
                        pid=pid,
                        handle=handle,
                        project_root=PROJECT_ROOT,
                        screenshot_fn=(lambda pid=pid: _screenshot_post(
                            browser, handle, pid, SCREENSHOTS_DIR / handle_no_at
                        )),
                        save_fn=(lambda **kw: save_post_screenshot(conn, **kw)),
                        now_iso_fn=_now_iso,
                    )
                    if outcome.new_inserted:
                        new_count += 1
                    if outcome.capture_error:
                        capture_errors.append(outcome.capture_error)
                    if outcome.became_partial_error:
                        status = "partial_error"
                    for line in outcome.info_log:
                        print(line)
                    for line in outcome.error_log:
                        print(line, file=sys.stderr)
                error = _combine_error_messages(error, capture_errors)
            finally:
                browser.close()
    except Exception as e:
        status = "error"
        error = str(e)
        raise
    finally:
        record_check(
            conn,
            handle=handle,
            checked_at=_now_iso(),
            found_count=found_count,
            new_count=new_count,
            status=status,
            error=error,
        )
        if handle == WEB_SNAPSHOT_HANDLE:
            _write_web_snapshot_from_db(latest_snapshot(conn, handle))
        conn.close()

    print(f"[done] {handle} found={found_count} new_saved_to_db={new_count} at={checked_at}")
    return new_count


def run_watch(handle: str, interval_s: int, *, baseline_lookback_days: int | None = None) -> None:
    if interval_s < 60:
        print("[warn] interval below 60s is not allowed; clamping to 60s", file=sys.stderr)
        interval_s = 60
    print(f"[watch] handle={handle} interval={interval_s}s lookback_days={baseline_lookback_days}")
    while True:
        try:
            run_once(handle, baseline_lookback_days=baseline_lookback_days)
        except KeyboardInterrupt:
            print("[watch] interrupted")
            return
        except Exception as e:
            print(f"[watch] iteration failed: {e}", file=sys.stderr)
        time.sleep(interval_s)


def _find_watcher_process_start_iso() -> str | None:
    """Locate the live `watcher.py --watch` process and return its ISO-8601
    start time, or None when no such process is running.

    Uses pgrep + ps. Returns None on any error so the health check
    degrades gracefully — staleness is a soft signal, not load-bearing.
    """
    import subprocess
    try:
        pids = subprocess.check_output(
            ["pgrep", "-f", "watcher.py --watch"], text=True, stderr=subprocess.DEVNULL,
        ).strip().split()
    except subprocess.CalledProcessError:
        return None
    if not pids:
        return None
    try:
        # Use the OLDEST PID if multiple (e.g., a stale + a fresh — we
        # want to catch the case where someone forgot to kill the old one).
        out = subprocess.check_output(
            ["ps", "-o", "lstart=", "-p", pids[0]], text=True, stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return None
    if not out:
        return None
    # ps lstart format: "Sun May 17 20:00:14 2026" — LOCAL time.
    # Convert to UTC so it can be compared apples-to-apples against
    # the source-file mtimes (which _collect_source_mtimes already
    # normalises to UTC via datetime.fromtimestamp(..., tz=timezone.utc)).
    # Without this, on a JST-local host we'd compare "17:39 (local)"
    # against "08:45 (UTC)" and conclude the process is newer when
    # actually it started before the edits. Bug observed 2026-05-18
    # while building this very check; fixed in the same commit.
    try:
        from datetime import datetime, timezone
        dt_local = datetime.strptime(out, "%a %b %d %H:%M:%S %Y")
        # Naive datetime → astimezone() treats as system local time and
        # converts to UTC. Documented behaviour since Python 3.6.
        dt_utc = dt_local.astimezone(timezone.utc)
        return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None


def _collect_source_mtimes() -> list[tuple[str, str | None]]:
    """Read the mtime of every file whose changes need a watcher restart
    to take effect (Python import-once invariant).
    """
    from datetime import datetime, timezone
    paths = ["watcher.py", "watcher_pure.py", "health.py", "db.py"]
    out: list[tuple[str, str | None]] = []
    for p in paths:
        f = PROJECT_ROOT / p
        if not f.exists():
            out.append((p, None))
            continue
        ts = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        out.append((p, ts.strftime("%Y-%m-%dT%H:%M:%SZ")))
    return out


def run_health_check(handle: str, threshold: int = 3) -> int:
    """Run audit-log-based health checks. Returns 0 if healthy, 1 if any regression.

    Cron-friendly: no network calls, no Chromium, reads only the SQLite audit log
    plus the process table (for staleness).
    """
    conn = connect(DB_FILE)
    init_db(conn)
    try:
        reports = [
            check_dom_regression(conn, handle, threshold=threshold),
            check_recent_errors(conn, handle, threshold=threshold),
            check_process_staleness(
                process_start_iso=_find_watcher_process_start_iso(),
                source_files=_collect_source_mtimes(),
            ),
        ]
    finally:
        conn.close()

    exit_code = 0 if all(r.is_healthy for r in reports) else 1
    for r in reports:
        print(r.to_text())
        print()
    print(f"[health] handle={handle} exit_code={exit_code}")
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Threads public-profile new-post watcher")
    parser.add_argument("--handle", default=DEFAULT_HANDLE, help="Target handle, with or without leading @")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run a single check and exit (default)")
    mode.add_argument("--watch", action="store_true", help="Loop forever at --interval seconds")
    mode.add_argument("--health-check", action="store_true", help="Audit-log-only health check (no network)")
    parser.add_argument("--interval", type=int, default=600, help="Polling interval in seconds when --watch (min 60)")
    parser.add_argument("--threshold", type=int, default=3, help="Consecutive-failure threshold for --health-check")
    parser.add_argument(
        "--baseline-lookback-days",
        type=int,
        default=None,
        help=(
            "If set, restrict the partial-error baseline (previous_max_found) "
            "to checks newer than N days. Default None = all-time peak "
            "(preserves long-standing behaviour). Use this when a handle's "
            "true baseline has permanently dropped and the historic peak "
            "is no longer a fair comparison."
        ),
    )
    args = parser.parse_args(argv)

    handle = _normalize_handle(args.handle)
    if args.health_check:
        return run_health_check(handle, threshold=args.threshold)
    if args.watch:
        run_watch(handle, args.interval, baseline_lookback_days=args.baseline_lookback_days)
        return 0
    run_once(handle, baseline_lookback_days=args.baseline_lookback_days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
