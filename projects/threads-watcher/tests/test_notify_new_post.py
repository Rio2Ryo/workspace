"""Unit tests for watcher._notify_new_post.

Zero pre-existing coverage despite being the production live-Mac-mini
notification path for new posts on @bmw_intokyo. A regression here
silently breaks Discord notifications without a single error log on
the watcher side (subprocess errors are swallowed by design).

Pinned behavior:
  - Opt-out: empty THREADS_WATCHER_NOTIFY_TARGET skips subprocess entirely
  - Handle filter: notify_handles list excludes non-matching handles
  - Case-insensitive filter match (relies on commit 3e08eaa fix)
  - Default channel "discord" when env not set
  - Custom channel honored via THREADS_WATCHER_NOTIFY_CHANNEL
  - URL fallback when captured.post_url missing
  - posted_at line only when present
  - 本文 snippet:
      * newlines collapsed to spaces (Discord renders better)
      * truncated to <= 280 chars when text is longer (Twitter-echo cap)
      * **ellipsis marker appended when truncated** (regression-fixed
        in this commit — pre-fix truncation was silent, operators
        couldn't tell whether a post had been cut)
  - Subprocess exception swallowed (notification is best-effort)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402
from watcher import _notify_new_post  # noqa: E402


@pytest.fixture
def capture_subprocess(monkeypatch):
    """Replace subprocess.run inside watcher with a recorder. Returns a
    list that subsequent assertions inspect. Empty list ⇒ no call was
    made (which is the correct behavior for the skip branches)."""
    calls: list[dict[str, Any]] = []

    def fake_run(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        # Return a CompletedProcess-shaped object even though the
        # caller passes check=False — defensive.
        return subprocess.CompletedProcess(args=args[0] if args else [], returncode=0)

    monkeypatch.setattr(watcher.subprocess, "run", fake_run)
    return calls


@pytest.fixture
def clear_notify_env(monkeypatch):
    """Each test starts with no notify env so the test body declares
    exactly the env shape it needs."""
    for k in (
        "THREADS_WATCHER_NOTIFY_TARGET",
        "THREADS_WATCHER_NOTIFY_HANDLES",
        "THREADS_WATCHER_NOTIFY_CHANNEL",
    ):
        monkeypatch.delenv(k, raising=False)


def cmd_arg(call: dict[str, Any], flag: str) -> str:
    """Pull the value of `--flag` from a recorded subprocess argv."""
    argv = call["args"][0]
    idx = argv.index(flag)
    return argv[idx + 1]


# ── Skip branches ────────────────────────────────────────────────────


def test_no_target_env_means_no_subprocess(
    capture_subprocess, clear_notify_env
) -> None:
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert capture_subprocess == []


def test_empty_target_env_value_means_no_subprocess(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    # The .strip() check means an env with only whitespace also skips.
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "   ")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert capture_subprocess == []


def test_handle_not_in_filter_list_means_no_subprocess(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_HANDLES", "@bmw_intokyo")
    # Different handle — must NOT notify.
    _notify_new_post("@hal.lifedesign", "abc", {"post_text": "hi"})
    assert capture_subprocess == []


# ── Notify branches ──────────────────────────────────────────────────


def test_empty_filter_list_permissive_notifies_for_any_handle(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    # No NOTIFY_HANDLES → permissive — notify for any handle that has
    # a target set. Used by the dev/test environment where one notifier
    # subscribes to everything.
    _notify_new_post("@hal.lifedesign", "abc", {"post_text": "hi"})
    assert len(capture_subprocess) == 1


def test_handle_in_filter_list_notifies(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_HANDLES", "@bmw_intokyo")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert len(capture_subprocess) == 1


def test_filter_match_is_case_insensitive_end_to_end(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    # End-to-end regression for the case-sensitivity bug fixed in
    # commit 3e08eaa — env var with uppercase, incoming handle with
    # lowercase must still notify. This is the exact silent-skip path
    # operators hit before the fix.
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_HANDLES", "BMW_intokyo")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert len(capture_subprocess) == 1


# ── Subprocess args ──────────────────────────────────────────────────


def test_default_channel_is_discord_when_env_not_set(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert cmd_arg(capture_subprocess[0], "--channel") == "discord"


def test_custom_channel_env_is_honored(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_CHANNEL", "slack")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert cmd_arg(capture_subprocess[0], "--channel") == "slack"


def test_target_arg_passed_verbatim(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "my-thread-id-123")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    assert cmd_arg(capture_subprocess[0], "--target") == "my-thread-id-123"


# ── Message construction ─────────────────────────────────────────────


def test_url_fallback_when_captured_post_url_missing(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc123", {})  # no post_url
    msg = cmd_arg(capture_subprocess[0], "--message")
    # Fallback URL uses handle + post_id.
    assert "https://www.threads.com/@bmw_intokyo/post/abc123" in msg


def test_url_from_captured_when_present(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {
        "post_url": "https://www.threads.com/@bmw_intokyo/post/CUSTOM",
    })
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "https://www.threads.com/@bmw_intokyo/post/CUSTOM" in msg


def test_posted_at_line_included_when_present(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {
        "posted_at": "2026-05-23T12:00:00Z",
    })
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "posted_at: 2026-05-23T12:00:00Z" in msg


def test_posted_at_line_omitted_when_missing(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "posted_at:" not in msg


def test_text_snippet_included_when_post_text_present(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "Hello world"})
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "本文: Hello world" in msg


def test_text_snippet_omitted_when_post_text_empty(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "   "})
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "本文:" not in msg


def test_text_newlines_replaced_with_spaces(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    _notify_new_post("@bmw_intokyo", "abc", {
        "post_text": "line1\nline2\nline3",
    })
    msg = cmd_arg(capture_subprocess[0], "--message")
    assert "本文: line1 line2 line3" in msg
    # The Discord message's "本文:" line is single-line; the only \n
    # in the message should be the separator between header / url /
    # posted_at / 本文 lines, NOT inside the snippet.
    body_line = [l for l in msg.split("\n") if l.startswith("本文:")][0]
    assert "\n" not in body_line


def test_text_under_280_chars_not_truncated_or_marked(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    text = "x" * 280
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": text})
    msg = cmd_arg(capture_subprocess[0], "--message")
    body_line = [l for l in msg.split("\n") if l.startswith("本文:")][0]
    # 280-char text fits exactly — no ellipsis, no truncation.
    assert body_line == f"本文: {text}"
    assert "…" not in body_line


def test_text_over_280_chars_truncated_AND_marked_with_ellipsis(
    capture_subprocess, clear_notify_env, monkeypatch
) -> None:
    # The bug fix: pre-commit the snippet was silently sliced to [:280]
    # with no marker, so operators couldn't tell from the notification
    # whether they were reading the full post or only the head.
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")
    text = "x" * 500
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": text})
    msg = cmd_arg(capture_subprocess[0], "--message")
    body_line = [l for l in msg.split("\n") if l.startswith("本文:")][0]
    # Snippet portion = body_line without "本文: " prefix.
    snippet = body_line[len("本文: "):]
    # Must end with ellipsis to signal truncation.
    assert snippet.endswith("…"), f"missing ellipsis on truncated snippet: {snippet!r}"
    # Total snippet length stays bounded (≤ 281 = 280 + ellipsis).
    assert len(snippet) <= 281


# ── Error handling ───────────────────────────────────────────────────


def test_subprocess_exception_is_swallowed(
    clear_notify_env, monkeypatch, capsys
) -> None:
    # If openclaw is missing or hangs, the notification path must NOT
    # propagate the exception (the watcher loop continues on every
    # post regardless).
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "discord-target")

    def boom(*args, **kwargs):
        raise FileNotFoundError("openclaw not on PATH")

    monkeypatch.setattr(watcher.subprocess, "run", boom)
    # Must not raise.
    _notify_new_post("@bmw_intokyo", "abc", {"post_text": "hi"})
    # And the failure mode logs to stderr for ops visibility.
    err = capsys.readouterr().err
    assert "notify-warn" in err
    assert "@bmw_intokyo/abc" in err
