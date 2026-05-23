"""Tests for status.py — operator-facing CLI status surface.

Headline pin: the `description` line emitted by status.py MUST be
byte-identical to the Discord embed description for the same
state.json. The shared `_build_description` helper enforces this
at the call-site level; these tests prove the integration plumbing
keeps it true.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from status import _render_json, _render_text  # noqa: E402
from discord_payload import (  # noqa: E402
    build_payload_from_state,
)


# ── Shared state fixtures ──────────────────────────────────────────────


def _write_state(tmp_path: Path, **overrides) -> Path:
    state = {
        "snapshot_generated_at": "2026-05-23T08:00:00Z",
        "open_incidents": [], "mttr_summary": [],
    }
    state.update(overrides)
    path = tmp_path / "state.json"
    path.write_text(json.dumps(state), encoding="utf-8")
    return path


# ── Cross-surface byte-identity pin ────────────────────────────────────


class TestDescriptionMatchesDiscordEmbed:
    """The CLI description line MUST be byte-identical to what the
    Discord embed description carries for the SAME state.json. If
    they ever diverge, an operator triaging from SSH sees different
    wording than the operator triaging from Discord — surface
    inconsistency the whole cross-tool pin infrastructure exists
    to prevent."""

    def test_green_state_identical_descriptions(self, tmp_path):
        path = _write_state(tmp_path)
        state = json.loads(path.read_text(encoding="utf-8"))
        now_ts = 1_000_000
        cli_desc = _render_json(state, now_ts=now_ts)["description"]
        embed_desc = build_payload_from_state(
            path, now_ts=now_ts,
        )["embeds"][0]["description"]
        assert cli_desc == embed_desc, (
            f"CLI description {cli_desc!r} != Discord embed description "
            f"{embed_desc!r} for GREEN state. Cross-surface drift — "
            f"operator sees different wording on SSH vs Discord."
        )

    def test_yellow_state_identical_descriptions(self, tmp_path):
        path = _write_state(tmp_path, open_incidents=[
            {"handle": "@y", "warn_ts": 1_000_000 - 2 * 3600, "current_bucket": 0.6},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        now_ts = 1_000_000
        cli_desc = _render_json(state, now_ts=now_ts)["description"]
        embed_desc = build_payload_from_state(
            path, now_ts=now_ts,
        )["embeds"][0]["description"]
        assert cli_desc == embed_desc

    def test_red_state_identical_descriptions(self, tmp_path):
        # RED triggered by MTTR mean >= 24h.
        path = _write_state(tmp_path, mttr_summary=[
            {"handle": "@chronic", "incidents": 5, "mean_s": 25 * 3600, "max_s": 30 * 3600},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        now_ts = 1_000_000
        cli_desc = _render_json(state, now_ts=now_ts)["description"]
        embed_desc = build_payload_from_state(
            path, now_ts=now_ts,
        )["embeds"][0]["description"]
        assert cli_desc == embed_desc

    def test_text_first_line_matches_json_description(self, tmp_path):
        # The TEXT rendering's first line is the description. Pin
        # that both modes show the SAME header so operator switching
        # between `status.py` and `status.py --json` sees consistent
        # severity signal.
        path = _write_state(tmp_path, open_incidents=[
            {"handle": "@a"}, {"handle": "@b"},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        now_ts = 1_000_000
        text_first_line = _render_text(state, now_ts=now_ts).split("\n", 1)[0]
        json_desc = _render_json(state, now_ts=now_ts)["description"]
        assert text_first_line == json_desc


# ── Text rendering ─────────────────────────────────────────────────────


class TestRenderText:
    def test_green_minimal_output(self, tmp_path):
        path = _write_state(tmp_path)
        state = json.loads(path.read_text(encoding="utf-8"))
        out = _render_text(state, now_ts=1_000_000)
        assert "🟢 All healthy" in out
        # Snapshot timestamp surfaced — operator visual aliveness signal.
        assert "snapshot:" in out
        assert "2026-05-23T08:00:00Z" in out

    def test_yellow_lists_open_incidents(self, tmp_path):
        path = _write_state(tmp_path, open_incidents=[
            {"handle": "@bmw", "warn_ts": 1_000_000 - 2 * 3600, "current_bucket": 0.7},
            {"handle": "@hal", "warn_ts": 1_000_000 - 2 * 3600, "current_bucket": 0.5},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        out = _render_text(state, now_ts=1_000_000)
        assert "🟡 2 warnings" in out
        assert "Open incidents (2):" in out
        assert "@bmw — open 2h @ 70%" in out
        assert "@hal — open 2h @ 50%" in out

    def test_mttr_section_when_present(self, tmp_path):
        path = _write_state(tmp_path, mttr_summary=[
            {"handle": "@r", "incidents": 3, "mean_s": 1800, "max_s": 5400},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        out = _render_text(state, now_ts=1_000_000)
        assert "Recent recoveries (1):" in out
        assert "@r — 3 incidents · mean 30m · max 1h 30m" in out


# ── JSON rendering ─────────────────────────────────────────────────────


class TestRenderJson:
    def test_structured_fields_present(self, tmp_path):
        path = _write_state(tmp_path, open_incidents=[
            {"handle": "@x", "warn_ts": 1_000_000 - 2 * 3600},
        ])
        state = json.loads(path.read_text(encoding="utf-8"))
        out = _render_json(state, now_ts=1_000_000)
        assert out["description"] == "🟡 1 warning"
        assert out["emoji"] == "🟡"
        assert out["color"] == 0xB86B00
        assert out["open_incidents_count"] == 1
        assert out["mttr_summary_count"] == 0
        assert out["snapshot_generated_at"] == "2026-05-23T08:00:00Z"


# ── CLI integration ────────────────────────────────────────────────────


class TestCli:
    def _run(self, *args, cwd):
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "status.py"), *args],
            cwd=str(cwd), capture_output=True, text=True, timeout=10,
        )

    def test_help_exits_zero(self, tmp_path):
        r = self._run("--help", cwd=tmp_path)
        assert r.returncode == 0
        assert "usage" in r.stdout.lower()

    def test_missing_file_exits_one(self, tmp_path):
        r = self._run(str(tmp_path / "nope.json"), cwd=tmp_path)
        assert r.returncode == 1
        assert "not found" in r.stderr.lower()

    def test_default_path_works(self, tmp_path):
        # Mimics the default DEFAULT_STATE_PATH inside an empty dir.
        # File doesn't exist → exit 1 with the path mentioned.
        r = self._run(cwd=tmp_path)
        assert r.returncode == 1
        assert "threads-watcher-status/state.json" in r.stderr

    def test_text_default_succeeds(self, tmp_path):
        path = _write_state(tmp_path)
        r = self._run(str(path), cwd=tmp_path)
        assert r.returncode == 0
        assert "🟢" in r.stdout

    def test_json_emits_parseable(self, tmp_path):
        path = _write_state(tmp_path)
        r = self._run(str(path), "--json", cwd=tmp_path)
        assert r.returncode == 0
        parsed = json.loads(r.stdout)
        assert "description" in parsed
        assert parsed["open_incidents_count"] == 0

    def test_malformed_state_exits_one(self, tmp_path):
        # Defensive: corrupted state.json from a partial write must
        # surface as exit 1 + actionable stderr, not stack-trace.
        path = tmp_path / "broken.json"
        path.write_text("not json {{{", encoding="utf-8")
        r = self._run(str(path), cwd=tmp_path)
        assert r.returncode == 1
        assert "failed to parse" in r.stderr.lower()
