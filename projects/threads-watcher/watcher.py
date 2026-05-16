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

from playwright.sync_api import (
    Browser,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)


PROJECT_ROOT = Path(__file__).resolve().parent
STATE_FILE = PROJECT_ROOT / "state.json"
SCREENSHOTS_DIR = PROJECT_ROOT / "screenshots"

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


def _load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"[warn] state.json is corrupted; starting fresh", file=sys.stderr)
        return {}


def _save_state(state: dict[str, Any]) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now_compact() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _extract_post_ids(page: Page, handle: str) -> list[str]:
    """Collect post IDs from anchor hrefs on the profile page.

    Threads post URLs look like /@<handle>/post/<id>. We intentionally use
    href regex extraction rather than DOM selectors so a layout change is
    less likely to break detection.
    """
    handle_no_at = handle.lstrip("@")
    pattern = re.compile(rf"/@{re.escape(handle_no_at)}/post/([A-Za-z0-9_-]+)")
    hrefs: list[str] = page.eval_on_selector_all(
        "a[href*='/post/']",
        "els => els.map(e => e.getAttribute('href'))",
    )
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


def _screenshot_post(
    browser: Browser,
    handle: str,
    post_id: str,
    out_dir: Path,
) -> Path:
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
        page.screenshot(path=str(out_path), full_page=True)
        return out_path
    finally:
        context.close()


def _check_handle(playwright: Playwright, handle: str, state: dict[str, Any]) -> dict[str, Any]:
    handle = _normalize_handle(handle)
    handle_no_at = handle.lstrip("@")
    profile_url = f"https://www.threads.com/@{handle_no_at}"
    handle_state = state.setdefault(handle, {"seen_post_ids": [], "last_checked_at": None})
    seen_ids: list[str] = handle_state.get("seen_post_ids", [])
    seen_set = set(seen_ids)

    browser = playwright.chromium.launch(headless=True)
    new_post_paths: list[Path] = []
    try:
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

        post_ids = _extract_post_ids(page, handle)
        context.close()

        if not post_ids:
            print(f"[warn] no post links found on {profile_url} — DOM may have changed or content gated", file=sys.stderr)

        # Process oldest-first so seen_post_ids order reflects observation order
        new_ids = [pid for pid in reversed(post_ids) if pid not in seen_set]
        for pid in new_ids:
            try:
                out = _screenshot_post(browser, handle, pid, SCREENSHOTS_DIR / handle_no_at)
                new_post_paths.append(out)
                seen_ids.append(pid)
                seen_set.add(pid)
                print(f"[saved] {pid} -> {out.relative_to(PROJECT_ROOT)}")
            except Exception as e:
                print(f"[error] failed to capture {pid}: {e}", file=sys.stderr)
    finally:
        browser.close()

    handle_state["seen_post_ids"] = seen_ids
    handle_state["last_checked_at"] = _now_iso()
    state[handle] = handle_state
    return {"new_count": len(new_post_paths), "checked_at": handle_state["last_checked_at"]}


def run_once(handle: str) -> int:
    state = _load_state()
    with sync_playwright() as p:
        result = _check_handle(p, handle, state)
    _save_state(state)
    print(f"[done] {handle} new={result['new_count']} at={result['checked_at']}")
    return result["new_count"]


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Threads public-profile new-post watcher")
    parser.add_argument("--handle", default=DEFAULT_HANDLE, help="Target handle, with or without leading @")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run a single check and exit (default)")
    mode.add_argument("--watch", action="store_true", help="Loop forever at --interval seconds")
    parser.add_argument("--interval", type=int, default=600, help="Polling interval in seconds when --watch (min 60)")
    args = parser.parse_args(argv)

    handle = _normalize_handle(args.handle)
    if args.watch:
        run_watch(handle, args.interval)
        return 0
    run_once(handle)
    return 0


if __name__ == "__main__":
    sys.exit(main())
