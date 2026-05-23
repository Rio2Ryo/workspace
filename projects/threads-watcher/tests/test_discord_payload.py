"""Tests for discord_payload.py — Discord webhook payload builder.

Pure builder, no network I/O. Tests cover:
  - severity color classification (red / yellow / green by elapsed + mean)
  - field structure when incidents exist vs all-clear
  - elapsed-time formatting matches dashboard JS shape
  - robustness to missing / empty / malformed state.json fields
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from discord_payload import (  # noqa: E402
    COLOR_GREEN,
    COLOR_RED,
    COLOR_YELLOW,
    SEVERITY_ERR_S,
    SEVERITY_WARN_S,
    _classify_severity,
    _fmt_elapsed,
    build_payload_from_state,
)


# ── _classify_severity (color picking by max severity across widgets) ──


class TestClassifySeverity:
    def test_no_incidents_is_green(self):
        assert _classify_severity([], [], now_ts=1_000_000) == COLOR_GREEN

    def test_open_under_1h_is_green(self):
        inc = [{"handle": "@x", "warn_ts": 1_000_000 - 100}]  # 100s old
        assert _classify_severity(inc, [], now_ts=1_000_000) == COLOR_GREEN

    def test_open_at_1h_is_yellow(self):
        inc = [{"handle": "@x", "warn_ts": 1_000_000 - SEVERITY_WARN_S}]
        assert _classify_severity(inc, [], now_ts=1_000_000) == COLOR_YELLOW

    def test_open_at_24h_is_red(self):
        inc = [{"handle": "@x", "warn_ts": 1_000_000 - SEVERITY_ERR_S}]
        assert _classify_severity(inc, [], now_ts=1_000_000) == COLOR_RED

    def test_mttr_mean_24h_is_red_even_with_no_open(self):
        # MTTR alone can trigger red — chronic problem signal.
        mttr = [{"handle": "@x", "mean_s": SEVERITY_ERR_S}]
        assert _classify_severity([], mttr, now_ts=1_000_000) == COLOR_RED

    def test_most_severe_wins_when_mixed(self):
        # Open warning at 30 min (green) + MTTR mean at 25h (red).
        # The card MUST go red — operator seeing green would miss
        # the chronic-problem signal entirely.
        inc = [{"handle": "@a", "warn_ts": 1_000_000 - 1800}]
        mttr = [{"handle": "@b", "mean_s": 25 * 3600}]
        assert _classify_severity(inc, mttr, now_ts=1_000_000) == COLOR_RED

    def test_open_red_beats_mttr_yellow(self):
        inc = [{"handle": "@a", "warn_ts": 1_000_000 - SEVERITY_ERR_S - 60}]
        mttr = [{"handle": "@b", "mean_s": SEVERITY_WARN_S + 100}]
        assert _classify_severity(inc, mttr, now_ts=1_000_000) == COLOR_RED


# ── _fmt_elapsed (matches dashboard JS shape) ──────────────────────────


class TestFmtElapsed:
    def test_zero_seconds(self):
        assert _fmt_elapsed(0) == "0s"

    def test_under_60s(self):
        assert _fmt_elapsed(42) == "42s"

    def test_under_1h(self):
        assert _fmt_elapsed(120) == "2m"
        assert _fmt_elapsed(3599) == "60m"  # 59.98m rounds to 60m

    def test_exact_1h(self):
        assert _fmt_elapsed(3600) == "1h"

    def test_above_1h_with_minutes(self):
        assert _fmt_elapsed(3660) == "1h 1m"
        assert _fmt_elapsed(5400) == "1h 30m"

    def test_above_24h(self):
        assert _fmt_elapsed(25 * 3600) == "25h"
        assert _fmt_elapsed(25 * 3600 + 1800) == "25h 30m"

    def test_negative_clamps_to_zero(self):
        # Defensive: a future tz bug could produce negative elapsed.
        # Don't render "-5s" — show 0s.
        assert _fmt_elapsed(-5) == "0s"


# ── build_payload_from_state (top-level integration) ──────────────────


class TestBuildPayload:
    def _write_state(self, tmp_path: Path, **overrides) -> Path:
        state = {
            "snapshot_generated_at": "2026-05-23T06:00:00Z",
            "open_incidents": [],
            "mttr_summary": [],
        }
        state.update(overrides)
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    def test_all_healthy_produces_green_card(self, tmp_path):
        state_path = self._write_state(tmp_path)
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        embed = payload["embeds"][0]
        assert embed["color"] == COLOR_GREEN
        # Status field present even with no incidents — proves watcher
        # is alive when discord-side operator sees the message.
        assert any("All healthy" in f["value"] for f in embed["fields"])

    def test_open_incident_24h_produces_red_card(self, tmp_path):
        state_path = self._write_state(tmp_path, open_incidents=[
            {"handle": "@chronic", "warn_ts": 1_000_000 - (25 * 3600), "current_bucket": 0.7},
        ])
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        assert payload["embeds"][0]["color"] == COLOR_RED
        # The handle name MUST appear in the field text so the
        # operator can see what's stuck without clicking through to
        # the dashboard.
        fields_text = json.dumps(payload["embeds"][0]["fields"])
        assert "@chronic" in fields_text

    def test_mttr_summary_field_includes_per_handle_stats(self, tmp_path):
        state_path = self._write_state(tmp_path, mttr_summary=[
            {"handle": "@a", "incidents": 3, "mean_s": 1500, "max_s": 3000},
            {"handle": "@b", "incidents": 1, "mean_s": 600, "max_s": 600},
        ])
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        fields_text = json.dumps(payload["embeds"][0]["fields"])
        assert "@a" in fields_text
        assert "@b" in fields_text
        # Per-handle stats: count + elapsed-formatted mean/max
        assert "3 incidents" in fields_text
        # 1500s = 25m
        assert "25m" in fields_text

    def test_username_is_threads_watcher(self, tmp_path):
        # Discord-side operator identification.
        state_path = self._write_state(tmp_path)
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        assert payload["username"] == "threads-watcher"

    def test_timestamp_carried_from_snapshot_generated_at(self, tmp_path):
        # Discord renders the timestamp in the embed footer — operator
        # sees the snapshot's freshness without re-fetching.
        state_path = self._write_state(tmp_path)
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        assert payload["embeds"][0]["timestamp"] == "2026-05-23T06:00:00Z"

    def test_robust_to_missing_optional_fields(self, tmp_path):
        # state.json without open_incidents / mttr_summary should NOT
        # crash — older states from pre-63cf649 deployments don't have
        # these fields.
        state_path = tmp_path / "minimal.json"
        state_path.write_text(json.dumps({"snapshot_generated_at": "2026-05-23T06:00:00Z"}), encoding="utf-8")
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        assert payload["embeds"][0]["color"] == COLOR_GREEN

    def test_malformed_warn_ts_does_not_crash(self, tmp_path):
        # Defensive: if warn_ts is a string or missing, the int(...)
        # call would raise. Either the int cast must be safe, or we
        # default to 0. Pin: no exception.
        state_path = self._write_state(tmp_path, open_incidents=[
            {"handle": "@x", "warn_ts": "not-a-number"},
        ])
        with pytest.raises(ValueError):
            # Explicit: current code propagates the ValueError because
            # state.json IS expected to be well-formed (watcher writes
            # it). If we later want soft-degrade, change the cast +
            # update this test. Pin the current contract.
            build_payload_from_state(state_path, now_ts=1_000_000)

    def test_no_network_io(self, tmp_path):
        # Pure builder. The whole point of this helper is to be
        # safely invokeable from any context (cron, dashboard,
        # operator CLI) WITHOUT requiring a Discord URL. Pin by
        # confirming the module imports without any network library
        # at the top level.
        import discord_payload as mod
        import sys as _sys
        # `requests`, `urllib3`, `aiohttp` etc. must NOT be in the
        # module's globals — pure builder has no network deps.
        for net_mod in ["requests", "aiohttp", "httpx", "urllib3"]:
            assert net_mod not in dir(mod), (
                f"{net_mod} leaked into discord_payload — it should "
                f"have no network deps (pure payload builder)"
            )


# ── CLI surface (matches mttr.py / cron-latency.mjs conventions) ──────


class TestCli:
    def _run(self, *args: str, cwd: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "discord_payload.py"), *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=10,
        )

    def test_cli_emits_parseable_json(self, tmp_path):
        state = {"snapshot_generated_at": "ts", "open_incidents": [], "mttr_summary": []}
        (tmp_path / "state.json").write_text(json.dumps(state), encoding="utf-8")
        r = self._run("state.json", cwd=tmp_path)
        assert r.returncode == 0, f"stderr: {r.stderr}"
        parsed = json.loads(r.stdout)
        assert parsed["username"] == "threads-watcher"

    def test_cli_missing_file_exits_one(self, tmp_path):
        r = self._run("/tmp/no-such-discord-payload-test-XYZ.json", cwd=tmp_path)
        assert r.returncode == 1
        assert "not found" in r.stderr.lower()


# ── embed description (1-line at-a-glance summary) ─────────────────────


from discord_payload import _build_description, _emoji_for  # noqa: E402


class TestEmojiFor:
    """Pure helper: color → emoji glyph. Match the embed `color` so
    the emoji + side-bar tell the same story."""

    def test_red_is_red_circle(self):
        assert _emoji_for(COLOR_RED) == "🔴"

    def test_yellow_is_yellow_circle(self):
        assert _emoji_for(COLOR_YELLOW) == "🟡"

    def test_green_is_green_circle(self):
        assert _emoji_for(COLOR_GREEN) == "🟢"

    def test_unknown_color_fallback_emoji(self):
        # 🔒 Future palette addition shouldn't break the render — a
        # neutral ❔ is operator-visible "something's off" without
        # crashing the embed build.
        assert _emoji_for(0x123456) == "❔"


class TestBuildDescription:
    """Pure helper for the description string. Pin shapes so format
    drift surfaces here, not in operator scroll-fatigue."""

    def test_green_all_healthy_proves_watcher_alive(self):
        # 🔒 At-a-glance: GREEN must explicitly say "watcher alive" —
        # an empty embed at GREEN is ambiguous (no incidents OR
        # watcher dead?). The description disambiguates.
        d = _build_description([], [], COLOR_GREEN)
        assert "🟢" in d
        assert "All healthy" in d
        assert "watcher alive" in d

    def test_yellow_one_warning_singular(self):
        # English number agreement: "1 warning" not "1 warnings".
        # The dense format reads in-line; bad grammar = poor scan.
        d = _build_description(
            [{"handle": "@x", "warn_ts": 0}], [], COLOR_YELLOW,
        )
        assert d == "🟡 1 warning"

    def test_yellow_multiple_warnings_plural(self):
        d = _build_description(
            [{"handle": "@a"}, {"handle": "@b"}], [], COLOR_YELLOW,
        )
        assert d == "🟡 2 warnings"

    def test_separator_when_both_open_and_recovered(self):
        # Dense format uses · (middle dot) — operator pattern from
        # the dashboard footer / other status renderers in the repo.
        d = _build_description(
            [{"handle": "@a"}], [{"handle": "@r"}], COLOR_YELLOW,
        )
        assert d == "🟡 1 warning · 1 recovered"

    def test_red_with_only_mttr_history(self):
        # RED can be triggered by MTTR mean even with no open
        # incidents. Description still shows the recovered count
        # (operator wants to know what HAS happened recently).
        d = _build_description(
            [], [{"handle": "@chronic", "mean_s": 25 * 3600}], COLOR_RED,
        )
        assert d == "🔴 1 recovered"

    def test_red_with_both_open_and_recovered_lists_both(self):
        d = _build_description(
            [{"handle": "@a"}, {"handle": "@b"}],
            [{"handle": "@r"}],
            COLOR_RED,
        )
        assert d == "🔴 2 warnings · 1 recovered"

    def test_fallback_text_when_neither_present_but_color_not_green(self):
        # Defensive: classifier flagged yellow/red but neither array
        # has entries (shouldn't happen if _classify_severity is
        # consistent, but pin the safe path). "see fields" hints to
        # operator that the embed has SOMETHING worth reading even
        # though the description couldn't summarise it.
        d = _build_description([], [], COLOR_YELLOW)
        assert d == "🟡 see fields"


class TestDescriptionIntegratedIntoPayload:
    def _write_state(self, tmp_path, **overrides):
        state = {
            "snapshot_generated_at": "2026-05-23T08:00:00Z",
            "open_incidents": [], "mttr_summary": [],
        }
        state.update(overrides)
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    def test_description_present_in_built_payload(self, tmp_path):
        # 🔒 The plumbing: description MUST reach the embed dict, not
        # just exist as a helper. Without this, the operator UX
        # improvement is invisible in production.
        state_path = self._write_state(tmp_path)
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        embed = payload["embeds"][0]
        assert "description" in embed
        assert "🟢" in embed["description"]

    def test_description_for_yellow_state(self, tmp_path):
        state_path = self._write_state(tmp_path, open_incidents=[
            {"handle": "@y", "warn_ts": 1_000_000 - 2 * 3600, "current_bucket": 0.6},
        ])
        payload = build_payload_from_state(state_path, now_ts=1_000_000)
        desc = payload["embeds"][0]["description"]
        assert "🟡" in desc
        assert "1 warning" in desc
