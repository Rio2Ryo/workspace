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
from health import check_dom_regression, check_recent_errors
from playwright.sync_api import (
    Browser,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
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


def extract_post_ids_from_hrefs(hrefs: list[str | None], handle: str) -> list[str]:
    """Pure helper: extract unique Threads post IDs from anchor hrefs.

    Threads post URLs look like /@<handle>/post/<id>. We intentionally use
    href regex extraction rather than DOM selectors so a layout change is
    less likely to break detection.

    Returns IDs in first-seen (input) order, deduped, filtering out other
    handles' posts and unparseable hrefs.
    """
    handle_no_at = handle.lstrip("@")
    pattern = re.compile(rf"/@{re.escape(handle_no_at)}/post/([A-Za-z0-9_-]+)")
    seen: list[str] = []
    seen_set: set[str] = set()
    for href in hrefs:
        if not href:
            continue
        m = pattern.search(href)
        if not m:
            continue
        pid = m.group(1)
        if pid not in seen_set:
            seen_set.add(pid)
            seen.append(pid)
    return seen


def _extract_post_ids(page: Page, handle: str) -> list[str]:
    """Browser-side wrapper. Pulls hrefs from the live page, then delegates
    extraction to the pure helper above (so the regex logic stays testable)."""
    hrefs: list[str | None] = page.eval_on_selector_all(
        "a[href*='/post/']",
        "els => els.map(e => e.getAttribute('href'))",
    )
    return extract_post_ids_from_hrefs(hrefs, handle)


def collect_post_ids_until_stable(
    page: Page,
    handle: str,
    *,
    min_wait_ms: int = 7_500,
    max_wait_ms: int = 15_000,
    poll_ms: int = 750,
    now: "callable" = time.monotonic,  # type: ignore[valid-type]
) -> list[str]:
    """Collect profile post IDs after the Threads SPA has hydrated.

    A single selector read right after ``domcontentloaded`` is flaky on Threads:
    the profile initially exposes only a few anchors, then the remaining visible
    post links are attached by client-side hydration.  The watcher previously
    captured that early partial state (for example 4 instead of 15), so keep
    sampling until the set stops growing briefly or the bounded wait expires.

    `poll_ms` and `now` are injected so tests can drive the loop deterministically.
    """
    started = now()
    min_deadline = started + (min_wait_ms / 1000)
    deadline = started + (max_wait_ms / 1000)
    best: list[str] = []
    stable_reads = 0
    while True:
        current = _extract_post_ids(page, handle)
        if len(current) > len(best):
            best = current
            stable_reads = 0
        else:
            stable_reads += 1

        if now() >= min_deadline and stable_reads >= 3 and best:
            return best
        if now() >= deadline:
            return best or current
        page.wait_for_timeout(poll_ms)


# Backward-compatible private alias kept so callers within this module don't churn.
_collect_post_ids_until_stable = collect_post_ids_until_stable


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


def run_once(handle: str) -> int:
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
                previous_max_row = conn.execute(
                    "SELECT MAX(found_count) AS max_found FROM checks WHERE handle = ? AND status = 'ok'",
                    (handle,),
                ).fetchone()
                previous_max_found = int(previous_max_row["max_found"] or 0) if previous_max_row else 0
                if previous_max_found and found_count < previous_max_found:
                    status = "partial_error"
                    error = (
                        f"profile extraction returned partial result: found={found_count} "
                        f"previous_max={previous_max_found}"
                    )
                    print(f"[warn] {error}", file=sys.stderr)

                seen_set = set(get_seen_post_ids(conn, handle))
                new_ids = [pid for pid in reversed(post_ids) if pid not in seen_set]
                for pid in new_ids:
                    first_seen_at = _now_iso()
                    try:
                        captured = _screenshot_post(browser, handle, pid, SCREENSHOTS_DIR / handle_no_at)
                        local_rel_path = str(captured["path"].relative_to(PROJECT_ROOT))
                        inserted = save_post_screenshot(
                            conn,
                            handle=handle,
                            post_id=pid,
                            post_url=captured["post_url"],
                            first_seen_at=first_seen_at,
                            captured_at=_now_iso(),
                            screenshot_png=captured["png"],
                            width=captured["width"],
                            height=captured["height"],
                            local_path=local_rel_path,
                        )
                        if inserted:
                            new_count += 1
                            print(
                                f"[saved-db] {pid} bytes={len(captured['png'])} local={local_rel_path}"
                            )
                        else:
                            print(f"[skip] {pid} already exists in DB")
                    except Exception as e:
                        status = "partial_error"
                        print(f"[error] failed to capture/store {pid}: {e}", file=sys.stderr)
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


def run_watch(handle: str, interval_s: int) -> None:
    if interval_s < 60:
        print("[warn] interval below 60s is not allowed; clamping to 60s", file=sys.stderr)
        interval_s = 60
    print(f"[watch] handle={handle} interval={interval_s}s")
    while True:
        try:
            run_once(handle)
        except KeyboardInterrupt:
            print("[watch] interrupted")
            return
        except Exception as e:
            print(f"[watch] iteration failed: {e}", file=sys.stderr)
        time.sleep(interval_s)


def run_health_check(handle: str, threshold: int = 3) -> int:
    """Run audit-log-based health checks. Returns 0 if healthy, 1 if any regression.

    Cron-friendly: no network calls, no Chromium, reads only the SQLite audit log.
    """
    conn = connect(DB_FILE)
    init_db(conn)
    try:
        reports = [
            check_dom_regression(conn, handle, threshold=threshold),
            check_recent_errors(conn, handle, threshold=threshold),
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
    args = parser.parse_args(argv)

    handle = _normalize_handle(args.handle)
    if args.health_check:
        return run_health_check(handle, threshold=args.threshold)
    if args.watch:
        run_watch(handle, args.interval)
        return 0
    run_once(handle)
    return 0


if __name__ == "__main__":
    sys.exit(main())
