"""Atomic snapshot write contract for watcher._atomic_write_json.

The web snapshot (threads-watcher-status/state.json) is read by both
the public status page and sync.py. watcher.py used a plain
Path.write_text, so a hard kill mid-write (watchdog SIGKILL, OOM) left
it truncated. _atomic_write_json writes a temp file then os.replace()s
it in — a reader always sees a complete file. These tests pin that.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402


def test_atomic_write_json_produces_valid_readable_json(tmp_path):
    path = tmp_path / "state.json"
    payload = {"posts": [{"id": "a"}], "handle": "@x", "n": 3}
    watcher._atomic_write_json(path, payload)
    assert json.loads(path.read_text(encoding="utf-8")) == payload


def test_atomic_write_json_leaves_no_temp_file(tmp_path):
    path = tmp_path / "state.json"
    watcher._atomic_write_json(path, {"ok": True})
    # The temp file must have been renamed away, not left as litter.
    assert list(tmp_path.glob("*.tmp")) == []


def test_atomic_write_json_overwrites_existing(tmp_path):
    path = tmp_path / "state.json"
    watcher._atomic_write_json(path, {"v": 1})
    watcher._atomic_write_json(path, {"v": 2})
    assert json.loads(path.read_text(encoding="utf-8")) == {"v": 2}


def test_atomic_write_json_keeps_original_intact_on_serialize_failure(tmp_path):
    """The core property: a failure mid-write must not corrupt or remove
    the previous snapshot — the replace only happens after the temp file
    is fully written."""
    path = tmp_path / "state.json"
    path.write_text('{"original": true}', encoding="utf-8")

    # object() is not JSON-serializable → json.dumps raises before any
    # os.replace, so the live file must be untouched.
    with pytest.raises(TypeError):
        watcher._atomic_write_json(path, {"bad": object()})

    assert json.loads(path.read_text(encoding="utf-8")) == {"original": True}
    assert list(tmp_path.glob("*.tmp")) == []


def test_atomic_write_json_creates_parent_directory(tmp_path):
    path = tmp_path / "nested" / "dir" / "state.json"
    watcher._atomic_write_json(path, {"created": True})
    assert json.loads(path.read_text(encoding="utf-8")) == {"created": True}
