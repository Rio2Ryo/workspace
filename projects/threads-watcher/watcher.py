"""Threads public-profile new-post watcher.

Detects new posts on a public Threads profile via headless Chromium and
saves a full-page screenshot of each new post page. No login, no posting,
no external services.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db import connect, export_status_screenshots, get_seen_post_ids, init_db, latest_snapshot, record_check, save_post_screenshot, update_post_screenshot
from health import (
    HealthReport,
    check_dom_regression,
    check_process_staleness,
    check_recent_errors,
    judge_heartbeat_alert,
    judge_partial_error,
    previous_max_found,
    should_resend_heartbeat_alert,
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
WEB_SNAPSHOT_HANDLES = ["@hal.lifedesign", "@bmw_intokyo"]
DB_FILE = PROJECT_ROOT / "threads_watcher.db"

DEFAULT_HANDLES = WEB_SNAPSHOT_HANDLES
DEFAULT_HANDLE = ",".join(DEFAULT_HANDLES)
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
PROFILE_LOAD_TIMEOUT_MS = 30_000
POST_LOAD_TIMEOUT_MS = 30_000


def _parse_notify_handles(raw: str) -> set[str]:
    return {_normalize_handle(h.strip()) for h in raw.split(",") if h.strip()}


def _notify_new_post(handle: str, post_id: str, captured: dict[str, Any]) -> None:
    """Best-effort Discord notification for newly persisted target posts.

    Notification is explicitly opt-in via env vars so normal local runs remain
    read-only apart from the SQLite/screenshot artifacts. The live Mac mini
    runner sets these for @bmw_intokyo → the dedicated Discord thread.
    """
    target = os.environ.get("THREADS_WATCHER_NOTIFY_TARGET", "").strip()
    if not target:
        return

    notify_handles = _parse_notify_handles(os.environ.get("THREADS_WATCHER_NOTIFY_HANDLES", ""))
    if notify_handles and _normalize_handle(handle) not in notify_handles:
        return

    post_url = str(captured.get("post_url") or f"https://www.threads.com/{handle}/post/{post_id}")
    text = str(captured.get("post_text") or "").strip()
    posted_at = str(captured.get("posted_at") or "").strip()
    lines = [
        f"🧵 {handle} に新規投稿がありました",
        f"{post_url}",
    ]
    if posted_at:
        lines.append(f"posted_at: {posted_at}")
    if text:
        snippet = text.replace("\n", " ")[:280]
        lines.append(f"本文: {snippet}")

    try:
        subprocess.run(
            [
                "openclaw", "message", "send",
                "--channel", os.environ.get("THREADS_WATCHER_NOTIFY_CHANNEL", "discord"),
                "--target", target,
                "--message", "\n".join(lines),
            ],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
    except Exception as exc:
        print(f"[notify-warn] failed to send notification for {handle}/{post_id}: {exc}", file=sys.stderr)


def _normalize_handle(handle: str) -> str:
    return handle if handle.startswith("@") else f"@{handle}"


def _parse_handles(raw: str) -> list[str]:
    handles = [_normalize_handle(h.strip()) for h in raw.split(",") if h.strip()]
    return handles or list(DEFAULT_HANDLES)


def _combined_snapshot(conn: Any, handles: list[str]) -> dict[str, Any]:
    snapshots = [latest_snapshot(conn, h) for h in handles]
    posts: list[dict[str, Any]] = []
    for snap in snapshots:
        posts.extend(snap.get("posts", []))
    posts.sort(key=lambda p: str(p.get("posted_at") or p.get("captured_at") or p.get("first_seen_at") or ""), reverse=True)

    last_checks = [s.get("last_check") for s in snapshots if s.get("last_check")]
    last_checks.sort(key=lambda c: str(c.get("checked_at") or ""), reverse=True)
    first = snapshots[0] if snapshots else latest_snapshot(conn, DEFAULT_HANDLES[0])
    return {
        **first,
        "handle": ", ".join(handles),
        "handles": handles,
        "last_check": last_checks[0] if last_checks else None,
        "saved_count": len(posts),
        "posts": posts,
    }


def _write_web_snapshot_from_db(conn: Any, handle: str | None = None) -> None:
    """Write a sanitized status snapshot derived from the DB source of truth.

    The status file still excludes screenshot BLOBs and local host paths, but
    now includes browser-safe relative screenshot paths. PNG assets are exported
    under threads-watcher-status/screenshots/ so the static page can render the
    saved screenshots alongside each post URL.
    """
    WEB_SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    handles = WEB_SNAPSHOT_HANDLES if handle is None or handle in WEB_SNAPSHOT_HANDLES else [handle]
    snapshot = _combined_snapshot(conn, handles)
    screenshot_paths: dict[str, str] = {}
    for h in handles:
        for pid, path in export_status_screenshots(conn, h, WEB_SNAPSHOT_FILE.parent).items():
            screenshot_paths[f"{h}:{pid}"] = path
    for post in snapshot.get("posts", []):
        post["screenshot_path"] = screenshot_paths.get(f"{post.get('handle')}:{post.get('post_id')}")

    # Late import: sync.py imports sync_guards which imports json/sqlite —
    # all stdlib, no playwright dependency.
    from sync import get_active_dry_run_alert
    from watcher_pure import build_web_snapshot_payload
    payload = build_web_snapshot_payload(
        snapshot,
        dry_run_alert=get_active_dry_run_alert(),
        generated_at=_now_iso(),
    )
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



def _dismiss_threads_overlays(page: Page) -> None:
    """Best-effort removal of Threads login/app/cookie overlays before capture.

    Public Threads pages often hydrate a login/app-install prompt over the post.
    For watcher screenshots the post itself is the artifact, so close obvious
    buttons first, then remove modal/backdrop containers that are not article
    content. This runs inside the per-post context only.
    """
    close_selectors = [
        "button[aria-label='Close']",
        "button[aria-label='閉じる']",
        "div[role='dialog'] button[aria-label='Close']",
        "div[role='dialog'] button[aria-label='閉じる']",
        "text=後で",
        "text=あとで",
        "text=Not now",
        "text=Continue as guest",
        "text=ゲストとして続行",
    ]
    for selector in close_selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() > 0 and locator.is_visible(timeout=500):
                locator.click(timeout=1_000)
                page.wait_for_timeout(300)
        except Exception:
            pass

    page.evaluate(
        """
        () => {
          const remove = (el) => { try { el.remove(); } catch (_) {} };
          const loginText = /(Threadsでもっと発信しよう|Threadsにログインするかサインアップ|Instagramでログイン|代わりにユーザーネームでログイン|次に進むことで|ログインして他の返信|log in|login|sign up|continue as)/i;

          // Remove semantic dialogs and their modal containers. Climb to the
          // highest non-article ancestor so the dimming wrapper disappears too.
          for (const el of Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))) {
            let target = el;
            while (target.parentElement && target.parentElement !== document.body && !target.parentElement.querySelector('article')) {
              target = target.parentElement;
            }
            if (!target.querySelector('article')) remove(target);
            else remove(el);
          }

          // Remove login/app sidebars, bottom terms banners, and reply-login
          // prompts by text, while preserving any container that actually holds
          // the post article.
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const text = (el.innerText || '').trim();
            if (!text || !loginText.test(text) || el.querySelector('article')) continue;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const isUiChrome =
              rect.x > window.innerWidth * 0.55 ||
              rect.y > window.innerHeight * 0.78 ||
              (style.position === 'sticky' && rect.x > window.innerWidth * 0.5) ||
              (style.position === 'fixed' && rect.y > window.innerHeight * 0.7);
            if (isUiChrome) remove(el);
          }

          // Remove common full-screen/backdrop layers that block or dim the
          // post but do not carry semantic roles. Keep article containers.
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || '').trim();
            const isBackdrop = style.position === 'fixed' &&
              rect.width >= window.innerWidth * 0.9 &&
              rect.height >= window.innerHeight * 0.9 &&
              !el.querySelector('article') &&
              text.length < 20;
            const isBottomNotice = style.position === 'fixed' &&
              rect.y >= window.innerHeight * 0.65 &&
              rect.width >= window.innerWidth * 0.5 &&
              !el.querySelector('article');
            if (isBackdrop || isBottomNotice) remove(el);
          }
          document.documentElement.style.overflow = 'auto';
          document.body.style.overflow = 'auto';
        }
        """
    )


def _extract_post_metadata(page: Page, handle: str) -> dict[str, str | None]:
    """Extract target post text and posted timestamp from a hydrated Threads post page."""
    meta = page.evaluate(
        """
        (handle) => {
          const handleNoAt = String(handle || '').replace(/^@/, '');
          const times = Array.from(document.querySelectorAll('time')).map((t) => ({
            text: (t.innerText || '').trim(),
            datetime: t.getAttribute('datetime'),
          }));
          const bodyText = (document.body.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
          const title = (document.title || '').trim();
          let text = title && title !== 'Threads' ? title : null;

          if (!text) {
            const idx = bodyText.findIndex((line) => line === handleNoAt || line === '@' + handleNoAt);
            if (idx >= 0) {
              // Typical post page: スレッド / 表示N回 / handle / relative-time / post text / counts...
              for (let i = idx + 2; i < Math.min(bodyText.length, idx + 8); i++) {
                const candidate = bodyText[i];
                if (!candidate || candidate === '·' || /^\\d+$/.test(candidate)) continue;
                if (candidate === '投稿者' || candidate === '関連するスレッド') continue;
                text = candidate;
                break;
              }
            }
          }

          return {
            post_text: text,
            posted_at: times[0]?.datetime || null,
            posted_at_label: times[0]?.text || null,
          };
        }
        """,
        handle,
    )
    return {
        "post_text": meta.get("post_text") if isinstance(meta, dict) else None,
        "posted_at": meta.get("posted_at") if isinstance(meta, dict) else None,
        "posted_at_label": meta.get("posted_at_label") if isinstance(meta, dict) else None,
    }

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
        _dismiss_threads_overlays(page)
        page.wait_for_timeout(500)
        metadata = _extract_post_metadata(page, handle)
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
            "post_text": metadata.get("post_text"),
            "posted_at": metadata.get("posted_at"),
            "posted_at_label": metadata.get("posted_at_label"),
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
                        _notify_new_post(
                            handle,
                            pid,
                            {"post_url": f"https://www.threads.com/@{handle_no_at}/post/{pid}"},
                        )
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
        if handle in WEB_SNAPSHOT_HANDLES:
            _write_web_snapshot_from_db(conn)
        conn.close()

    print(f"[done] {handle} found={found_count} new_saved_to_db={new_count} at={checked_at}")
    return new_count


WATCH_MIN_INTERVAL_S = 60


def clamp_watch_interval(interval_s: int) -> int:
    """Floor the watch interval at WATCH_MIN_INTERVAL_S. Threads is rate-
    sensitive and a sub-minute loop adds no value — the profile barely
    changes that fast. Pure so the clamp is unit-testable."""
    if interval_s < WATCH_MIN_INTERVAL_S:
        print("[warn] interval below 60s is not allowed; clamping to 60s", file=sys.stderr)
        return WATCH_MIN_INTERVAL_S
    return interval_s


def run_watch_tick(handles: list[str], *, baseline_lookback_days: int | None = None) -> None:
    """One pass over every watched handle.

    A failure on one handle is logged and MUST NOT abort the others or
    the surrounding loop — a transient error on @a (network blip, DOM
    hiccup) should never starve @b of monitoring. KeyboardInterrupt is
    the one exception that propagates, so Ctrl-C / SIGINT still stops
    the watcher.

    Extracted from run_watch's `while True` body so this resilience
    contract is unit-testable without an infinite loop.
    """
    for h in handles:
        try:
            run_once(h, baseline_lookback_days=baseline_lookback_days)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"[watch] iteration failed for {h}: {e}", file=sys.stderr)


def _sigterm_to_keyboard_interrupt(signum: int, frame: Any) -> None:
    """SIGTERM handler: log the signal, then raise KeyboardInterrupt so
    the watch loop unwinds through its context managers — run_once's
    `finally: browser.close()` and `with sync_playwright()` exit — for
    a clean shutdown instead of the default abrupt terminate that
    orphans the Chromium / Playwright-driver child processes.

    The log line also makes a death diagnosable: restart-watcher.sh
    stops the watcher with SIGTERM, so a crash WITH a
    `[watch] received SIGTERM` line was an expected restart, while a
    crash WITHOUT one was a SIGKILL (OOM, `kill -9`) — which narrows
    root-cause analysis of the recurring crash loop.
    """
    _ = frame
    print(f"[watch] received signal {signum} (SIGTERM) at {_now_iso()} — shutting down", file=sys.stderr)
    raise KeyboardInterrupt


def install_watch_signal_handler() -> None:
    """Route SIGTERM through the same clean-shutdown path as SIGINT.
    Separated from run_watch so the registration is unit-testable."""
    signal.signal(signal.SIGTERM, _sigterm_to_keyboard_interrupt)


def run_watch(handle: str, interval_s: int, *, baseline_lookback_days: int | None = None) -> None:
    interval_s = clamp_watch_interval(interval_s)
    install_watch_signal_handler()
    handles = _parse_handles(handle)
    print(f"[watch] handles={handles} interval={interval_s}s lookback_days={baseline_lookback_days}")
    while True:
        try:
            run_watch_tick(handles, baseline_lookback_days=baseline_lookback_days)
        except KeyboardInterrupt:
            print("[watch] interrupted")
            return
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


def _latest_check_iso(conn, handle: str) -> str | None:
    """Newest `checks.checked_at` for `handle`, or None when the handle
    has no checks yet. This is the watcher's heartbeat — the loop writes
    one check row per handle per iteration."""
    row = conn.execute(
        "SELECT checked_at FROM checks WHERE handle = ? ORDER BY checked_at DESC LIMIT 1",
        (handle,),
    ).fetchone()
    return str(row["checked_at"]) if row and row["checked_at"] else None


def _heartbeat_health_report(conn, handle: str) -> tuple[HealthReport, bool]:
    """Run judge_heartbeat_alert against the newest check and adapt the
    result into a HealthReport so it joins the other health checks.

    Returns (report, should_alert). The bool is the Discord gate — kept
    separate from report.is_healthy because a None/corrupt heartbeat is
    'not healthy to reason about' but explicitly NOT an alert."""
    # process_start_iso lets judge_heartbeat_alert apply its restart
    # grace period: a watcher restarted seconds ago has no fresh check
    # yet, and flagging that as "hung" would make auto-restart kill it
    # in a loop.
    alert = judge_heartbeat_alert(
        last_check_iso=_latest_check_iso(conn, handle),
        now_iso=_now_iso(),
        process_start_iso=_find_watcher_process_start_iso(),
    )
    report = HealthReport(
        handle=handle,
        is_healthy=not alert.is_stale,
        reason=alert.reason,
        recent_checks=[],
    )
    return report, alert.should_alert


def _notify_stale_heartbeat(handle: str, reason: str) -> None:
    """Best-effort Discord anomaly report for a stale watcher heartbeat.

    Opt-in via THREADS_WATCHER_NOTIFY_TARGET — identical gating to
    _notify_new_post, so a normal local `--health-check` stays
    side-effect-free. Only ever called when judge_heartbeat_alert
    returned should_alert=True."""
    target = os.environ.get("THREADS_WATCHER_NOTIFY_TARGET", "").strip()
    if not target:
        return
    message = "\n".join([
        f"⚠️ threads-watcher heartbeat 異常 ({handle})",
        reason,
        "対応: ./restart-watcher.sh で watcher ループを再起動してください",
    ])
    try:
        subprocess.run(
            [
                "openclaw", "message", "send",
                "--channel", os.environ.get("THREADS_WATCHER_NOTIFY_CHANNEL", "discord"),
                "--target", target,
                "--message", message,
            ],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
    except Exception as exc:
        print(f"[notify-warn] failed to send heartbeat alert for {handle}: {exc}", file=sys.stderr)


# State file recording when the last heartbeat Discord alert was sent.
# Each --health-check run is a fresh process (cron / launchd), so the
# de-dupe cooldown can't live in memory — it persists here, mirroring
# sync.py's logs/dry-run-state.json approach.
HEARTBEAT_ALERT_STATE_FILE = PROJECT_ROOT / "logs" / "heartbeat-alert-state.json"


def _load_heartbeat_alert_iso() -> str | None:
    """ISO timestamp of the last sent heartbeat alert, or None when no
    alert has been sent (file missing) or the file is unreadable /
    corrupt. None makes should_resend_heartbeat_alert treat the next
    stale tick as the first alert of a fresh outage."""
    try:
        data = json.loads(HEARTBEAT_ALERT_STATE_FILE.read_text(encoding="utf-8"))
        value = data.get("last_alert_iso")
        return str(value) if value else None
    except (FileNotFoundError, ValueError, OSError, AttributeError):
        return None


def _save_heartbeat_alert_iso(iso: str) -> None:
    """Record that an alert was just sent. Best-effort: a write failure
    only means the next tick may re-alert sooner than the cooldown — far
    less bad than crashing the health check."""
    try:
        HEARTBEAT_ALERT_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT_ALERT_STATE_FILE.write_text(
            json.dumps({"last_alert_iso": iso}), encoding="utf-8"
        )
    except OSError as exc:
        print(f"[heartbeat-warn] could not persist alert state: {exc}", file=sys.stderr)


def _clear_heartbeat_alert_state() -> None:
    """Drop the state file once the heartbeat is healthy again, so the
    NEXT outage alerts immediately instead of waiting out a cooldown
    left over from the previous one."""
    try:
        HEARTBEAT_ALERT_STATE_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def run_health_check(handle: str, threshold: int = 3) -> int:
    """Run audit-log-based health checks. Returns 0 if healthy, 1 if any regression.

    Cron-friendly: reads the SQLite audit log plus the process table (for
    staleness). The only outbound call is the opt-in Discord heartbeat
    alert, which fires exclusively when the heartbeat is genuinely stale.
    """
    conn = connect(DB_FILE)
    init_db(conn)
    try:
        heartbeat_report, heartbeat_should_alert = _heartbeat_health_report(conn, handle)
        reports = [
            check_dom_regression(conn, handle, threshold=threshold),
            check_recent_errors(conn, handle, threshold=threshold),
            check_process_staleness(
                process_start_iso=_find_watcher_process_start_iso(),
                source_files=_collect_source_mtimes(),
            ),
            heartbeat_report,
        ]
    finally:
        conn.close()

    # Discord anomaly report fires ONLY for a stale heartbeat — the
    # judge_heartbeat_alert gate guarantees fresh / cold-start / corrupt
    # / clock-skew cases never reach here. The cooldown gate then
    # suppresses re-sends within the same ongoing outage so a watcher
    # that stays dead across many cron ticks pages hourly, not per tick.
    if heartbeat_should_alert:
        now = _now_iso()
        if should_resend_heartbeat_alert(
            is_stale=True,
            last_alert_iso=_load_heartbeat_alert_iso(),
            now_iso=now,
        ):
            _notify_stale_heartbeat(handle, heartbeat_report.reason)
            _save_heartbeat_alert_iso(now)
    else:
        # Heartbeat is fresh (or cold-start / corrupt / skew). Reset the
        # de-dupe state so a genuine outage later alerts immediately.
        _clear_heartbeat_alert_state()

    exit_code = 0 if all(r.is_healthy for r in reports) else 1
    for r in reports:
        print(r.to_text())
        print()
    print(f"[health] handle={handle} exit_code={exit_code}")
    return exit_code



def recapture_existing(handle: str, *, limit: int | None = None) -> int:
    """Re-shoot already-known posts, replacing DB screenshots in-place."""
    handle = _normalize_handle(handle)
    conn = connect(DB_FILE)
    init_db(conn)
    rows = conn.execute(
        """
        SELECT post_id FROM posts
        WHERE handle = ?
        ORDER BY captured_at DESC
        """,
        (handle,),
    ).fetchall()
    if limit is not None:
        rows = rows[:limit]

    updated = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for row in rows:
                pid = str(row["post_id"])
                captured = _screenshot_post(browser, handle, pid, SCREENSHOTS_DIR / handle.lstrip("@"))
                local_rel_path = str(Path(captured["path"]).relative_to(PROJECT_ROOT))
                if update_post_screenshot(
                    conn,
                    handle=handle,
                    post_id=pid,
                    captured_at=_now_iso(),
                    screenshot_png=captured["png"],
                    width=captured["width"],
                    height=captured["height"],
                    local_path=local_rel_path,
                    post_text=captured.get("post_text"),
                    posted_at=captured.get("posted_at"),
                ):
                    updated += 1
                    print(f"[recaptured] {pid} bytes={len(captured['png'])} local={local_rel_path}")
        finally:
            browser.close()

    _write_web_snapshot_from_db(conn, handle)
    conn.close()
    print(f"[recapture-done] {handle} updated={updated}")
    return updated

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Threads public-profile new-post watcher")
    parser.add_argument("--handle", default=DEFAULT_HANDLE, help="Target handle, with or without leading @")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run a single check and exit (default)")
    mode.add_argument("--watch", action="store_true", help="Loop forever at --interval seconds")
    mode.add_argument("--health-check", action="store_true", help="Audit-log-only health check (no network)")
    mode.add_argument("--recapture-existing", action="store_true", help="Re-shoot already-known posts and replace DB screenshots")
    parser.add_argument("--interval", type=int, default=600, help="Polling interval in seconds when --watch (min 60)")
    parser.add_argument("--threshold", type=int, default=3, help="Consecutive-failure threshold for --health-check")
    parser.add_argument("--limit", type=int, default=None, help="Limit rows for --recapture-existing")
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

    handles = _parse_handles(args.handle)
    handle = handles[0]
    if args.health_check:
        return run_health_check(handle, threshold=args.threshold)
    if args.recapture_existing:
        for h in handles:
            recapture_existing(h, limit=args.limit)
        return 0
    if args.watch:
        run_watch(args.handle, args.interval, baseline_lookback_days=args.baseline_lookback_days)
        return 0
    for h in handles:
        run_once(h, baseline_lookback_days=args.baseline_lookback_days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
