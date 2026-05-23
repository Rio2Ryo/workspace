"""End-to-end Playwright test for the dashboard auto-refresh +
severity-color rendering.

The HTML contract tests in test_status_html_observability_fields.py
pin the JS *structure* (setInterval present, className assignments,
threshold constants). This test pins the OBSERVABLE BEHAVIOR — that
the DOM actually updates when state.json changes, and that the
severity class lands on the right row based on elapsed time.

Without this, a future refactor could keep all the static-string
contracts green while breaking the actual rendering (e.g., a JS
error mid-tick that prevents the renderer from completing).

Skip-when-missing
-----------------
Requires playwright (heavy install, only present in `venv/` not
`.venv/`). Skip cleanly with a non-fatal reason so the test
remains visible in pytest collection but doesn't block CI runs in
the lightweight environment.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import socketserver
import threading
import time
from pathlib import Path

import pytest


pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _baseline_state(open_warn_ts: int) -> dict:
    """A minimal state.json the dashboard JS will render without
    crashing. Carries one open_incidents entry whose `warn_ts` the
    caller controls — varies elapsed-time across test cases."""
    return {
        "handle": "@test_handle",
        "handles": ["@test_handle"],
        "last_check": {
            "checked_at": "2026-05-23T06:00:00Z",
            "status": "ok",
            "found_count": 10,
            "new_count": 0,
        },
        "saved_count": 10,
        "posts": [],
        "recent_stats": {
            "window_hours": 24, "total": 100, "ok": 50,
            "partial_error": 50, "error": 0, "other": 0,
            "success_rate": 0.5, "partial_error_rate": 0.5,
            "top_partial_error_reason": None,
        },
        "recent_stats_by_window": {},
        "sync_state": {"db_max": 10, "cursor": 10, "delta": 0, "cursor_file_exists": True},
        "dry_run_alert": None,
        "mttr_summary": [],
        "open_incidents": [
            {"handle": "@warming", "warn_ts": open_warn_ts, "current_bucket": 0.6},
        ],
        "snapshot_generated_at": "2026-05-23T06:00:00Z",
    }


@contextlib.contextmanager
def _serve_dir(directory: Path, port: int = 0):
    """Spin up http.server in a thread serving `directory`. Yields the
    bound port. Shuts down + joins the thread on exit so the test
    doesn't leak sockets between cases."""
    handler = http.server.SimpleHTTPRequestHandler
    # threading=True so the JS's parallel fetch + asset loads don't
    # deadlock against the single-thread default.

    class _Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        # Bind handler to the right cwd via a partial.

    saved_cwd = Path.cwd()
    try:
        # http.server resolves relative to cwd. chdir into the temp
        # directory for the duration of the server.
        import os
        os.chdir(directory)
        with _Server(("127.0.0.1", port), handler) as httpd:
            actual_port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                yield actual_port
            finally:
                httpd.shutdown()
                thread.join(timeout=5)
    finally:
        os.chdir(saved_cwd)


def _setup_tmp_dashboard(tmp_path: Path, state: dict) -> Path:
    """Copy index.html + write state.json to a tmpdir. Returns the
    directory the server should serve."""
    import shutil
    src_html = PROJECT_ROOT / "threads-watcher-status" / "index.html"
    shutil.copy(src_html, tmp_path / "index.html")
    (tmp_path / "state.json").write_text(json.dumps(state), encoding="utf-8")
    return tmp_path


def test_dashboard_renders_initial_state(tmp_path):
    # 🔒 Baseline: the dashboard JS executes without error against the
    # current state.json shape. Pin so a future refactor that
    # breaks the rendering (JS exception mid-IIFE) trips here even
    # before the auto-refresh tests below.
    state = _baseline_state(open_warn_ts=int(time.time()) - 60)  # 1 min old
    _setup_tmp_dashboard(tmp_path, state)

    with _serve_dir(tmp_path) as port:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(f"http://127.0.0.1:{port}/index.html?refresh=0")
                # Wait for the first render to complete — open-incidents
                # widget appears only when array is non-empty.
                page.wait_for_selector("#open-incidents", state="visible", timeout=5000)
                # Handle column populated.
                row_text = page.locator("#open-incidents-tbody tr").first.text_content()
                assert "@warming" in row_text, f"row text: {row_text!r}"
            finally:
                browser.close()


def test_severity_class_oi_warn_applied_at_1h_elapsed(tmp_path):
    # 🔒 The core severity-styling contract: warn_ts of 1h+ ago gets
    # the .oi-warn class. Use 1h + a few seconds buffer to avoid
    # boundary timing races (browser load takes a moment).
    state = _baseline_state(open_warn_ts=int(time.time()) - (3700))  # 1h 1m 40s
    _setup_tmp_dashboard(tmp_path, state)

    with _serve_dir(tmp_path) as port:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(f"http://127.0.0.1:{port}/index.html?refresh=0")
                page.wait_for_selector("#open-incidents tr.oi-warn", timeout=5000)
                # Pin: the row has the warn class, NOT the err class
                row = page.locator("#open-incidents-tbody tr").first
                cls = row.get_attribute("class") or ""
                assert "oi-warn" in cls, f"class={cls!r}"
                assert "oi-err" not in cls, f"1h+ should be warn, not err. class={cls!r}"
            finally:
                browser.close()


def test_severity_class_oi_err_applied_at_24h_elapsed(tmp_path):
    # 🔒 24h+ stuck regime gets the red bold .oi-err class. This is
    # the headline operator-triage signal — pin it end-to-end.
    state = _baseline_state(open_warn_ts=int(time.time()) - (24 * 3600 + 60))  # 24h 1m
    _setup_tmp_dashboard(tmp_path, state)

    with _serve_dir(tmp_path) as port:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(f"http://127.0.0.1:{port}/index.html?refresh=0")
                page.wait_for_selector("#open-incidents tr.oi-err", timeout=5000)
                row = page.locator("#open-incidents-tbody tr").first
                cls = row.get_attribute("class") or ""
                assert "oi-err" in cls, f"class={cls!r}"
                assert "oi-warn" not in cls, (
                    f"24h+ must be err, not warn (branch-order bug). class={cls!r}"
                )
            finally:
                browser.close()


def test_auto_refresh_re_fetches_state_json_when_modified(tmp_path):
    # 🔒 The headline auto-refresh contract: page modifies state.json
    # mid-flight, dashboard picks it up within the refresh cycle
    # WITHOUT operator hitting reload.
    state = _baseline_state(open_warn_ts=int(time.time()) - 60)
    state["handle"] = "@initial_handle"
    _setup_tmp_dashboard(tmp_path, state)

    with _serve_dir(tmp_path) as port:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                # Use ?refresh=2 for 2s cadence (faster than default
                # 60s — test completes in seconds, not minutes).
                page.goto(f"http://127.0.0.1:{port}/index.html?refresh=2")
                page.wait_for_function(
                    "document.getElementById('handle').textContent === '@initial_handle'",
                    timeout=5000,
                )

                # Modify state.json on disk (server reads it fresh on
                # each fetch — no caching at this layer).
                state["handle"] = "@updated_handle"
                (tmp_path / "state.json").write_text(json.dumps(state), encoding="utf-8")

                # Within 1 refresh cycle (2s) + parse + render lag,
                # the DOM should reflect the new value.
                page.wait_for_function(
                    "document.getElementById('handle').textContent === '@updated_handle'",
                    timeout=8000,
                )
            finally:
                browser.close()


def test_refresh_zero_disables_auto_refresh(tmp_path):
    # 🔒 ?refresh=0 must freeze the dashboard (operator screenshot /
    # debug mode). Pin: after modifying state.json + waiting, the
    # DOM does NOT update.
    state = _baseline_state(open_warn_ts=int(time.time()) - 60)
    state["handle"] = "@initial_handle"
    _setup_tmp_dashboard(tmp_path, state)

    with _serve_dir(tmp_path) as port:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(f"http://127.0.0.1:{port}/index.html?refresh=0")
                page.wait_for_function(
                    "document.getElementById('handle').textContent === '@initial_handle'",
                    timeout=5000,
                )

                # Modify + wait. Since refresh=0, the dashboard MUST NOT
                # re-fetch, so the initial value persists.
                state["handle"] = "@updated_handle"
                (tmp_path / "state.json").write_text(json.dumps(state), encoding="utf-8")

                # 3s wait — well past any reasonable accidental tick.
                time.sleep(3)
                # The DOM is still showing the initial value.
                current = page.evaluate(
                    "document.getElementById('handle').textContent"
                )
                assert current == "@initial_handle", (
                    f"?refresh=0 should freeze the dashboard, but handle "
                    f"changed to {current!r}"
                )
            finally:
                browser.close()
