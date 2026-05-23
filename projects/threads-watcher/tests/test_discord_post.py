"""Tests for discord_post.py — Discord webhook poster.

Covers:
  - request building (URL, method, headers, body shape)
  - dry-run mode (no URL set + explicit --dry-run + --json variant)
  - successful POST mock (200 + 204)
  - 4xx error surfacing
  - network error handling
  - URL token redaction in error messages
  - CLI conventions parity with mttr.py / cron-latency.mjs /
    discord_payload.py
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from discord_post import (  # noqa: E402
    DISCORD_OK_STATUS,
    ENV_WEBHOOK_URL,
    _cli_main,
    _redact_url,
    build_request,
    post_payload,
)


# ── build_request: pure, deterministic ─────────────────────────────────


class TestBuildRequest:
    URL = "https://discord.com/api/webhooks/123/abctoken"
    PAYLOAD = {"username": "x", "embeds": [{"title": "t"}]}

    def test_url_carried(self):
        r = build_request(self.URL, self.PAYLOAD)
        assert r.full_url == self.URL

    def test_method_is_post(self):
        r = build_request(self.URL, self.PAYLOAD)
        assert r.get_method() == "POST"

    def test_content_type_header(self):
        r = build_request(self.URL, self.PAYLOAD)
        # urllib normalises header names to lowercase first letter via
        # capitalize() — match what get_header expects.
        assert r.get_header("Content-type") == "application/json"

    def test_user_agent_identifies_tool(self):
        # Pin: identifying UA so operators triaging Discord-side
        # reject logs can grep for our tag. Discord defaults to
        # rejecting unidentified urllib UAs.
        r = build_request(self.URL, self.PAYLOAD)
        ua = r.get_header("User-agent") or ""
        assert "threads-watcher" in ua

    def test_body_is_json_encoded_payload(self):
        r = build_request(self.URL, self.PAYLOAD)
        assert json.loads(r.data.decode("utf-8")) == self.PAYLOAD


# ── post_payload: mocked urlopen for network behaviour ─────────────────


class _FakeResponse:
    """Minimal urlopen() response — supports context manager + .status
    + .read(). Stand-in for http.client.HTTPResponse."""
    def __init__(self, status: int, body: str = ""):
        self.status = status
        self._body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self._body


class TestPostPayload:
    URL = "https://discord.com/api/webhooks/999/secretsecretsecret"

    @patch("discord_post.urllib.request.urlopen")
    def test_204_success_returned_as_tuple(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(204, "")
        status, body = post_payload(self.URL, {"ping": 1})
        assert status == 204
        assert body == ""

    @patch("discord_post.urllib.request.urlopen")
    def test_200_also_treated_as_success(self, mock_urlopen):
        # Belt-and-braces: Discord today returns 204, but the contract
        # in DISCORD_OK_STATUS includes 200 for forward-compat.
        mock_urlopen.return_value = _FakeResponse(200, "ok")
        status, body = post_payload(self.URL, {"ping": 1})
        assert status == 200

    @patch("discord_post.urllib.request.urlopen")
    def test_4xx_returns_body_not_raises(self, mock_urlopen):
        # post_payload deliberately does NOT raise on HTTPError so the
        # CLI can print Discord's actual error message (e.g.,
        # "Invalid Webhook Token") instead of stack-tracing.
        err_body = '{"message": "Invalid Webhook Token", "code": 50027}'
        mock_urlopen.side_effect = urllib.error.HTTPError(
            self.URL, 401, "Unauthorized", {},
            io.BytesIO(err_body.encode("utf-8")),
        )
        status, body = post_payload(self.URL, {"ping": 1})
        assert status == 401
        assert "Invalid Webhook Token" in body

    @patch("discord_post.urllib.request.urlopen")
    def test_url_error_propagates(self, mock_urlopen):
        # Transport-layer failures (DNS, refused, timeout) must
        # propagate so the CLI can render a redacted error line.
        mock_urlopen.side_effect = urllib.error.URLError("connection refused")
        with pytest.raises(urllib.error.URLError):
            post_payload(self.URL, {"ping": 1})


# ── _redact_url: never leak the bearer token ───────────────────────────


class TestRedactUrl:
    def test_token_redacted_in_full_webhook(self):
        out = _redact_url("https://discord.com/api/webhooks/123/abcXYZ123secret")
        assert "abcXYZ" not in out
        assert "secret" not in out
        assert "redacted" in out

    def test_token_length_preserved_for_operator_signal(self):
        # Length matters: a 4-char token reveals "you set a typo
        # placeholder" vs. 60+ char = "this looks like a real
        # Discord token". Length is non-secret.
        out = _redact_url("https://discord.com/api/webhooks/123/abcdefghijklmnop")
        assert "16-char" in out

    def test_short_path_falls_back_to_generic_redacted(self):
        out = _redact_url("http://localhost:8080/")
        assert out == "<redacted>"


# ── _cli_main: dry-run + --json + missing-state-file + missing-URL ────


class TestCliDryRun:
    def _write_state(self, tmp_path):
        state = {
            "snapshot_generated_at": "2026-05-23T06:00:00Z",
            "open_incidents": [],
            "mttr_summary": [],
        }
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    def test_no_url_triggers_dry_run_implicitly(self, tmp_path, capsys, monkeypatch):
        # Operator-developing path: no URL set, tool still works,
        # prints what would be posted. Pin: exit 0 even without URL.
        monkeypatch.delenv(ENV_WEBHOOK_URL, raising=False)
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path)])
        assert rc == 0
        out = capsys.readouterr().out
        assert "DRY RUN" in out
        assert "curl" in out
        assert "$WEBHOOK_URL" in out  # placeholder, not a real URL

    def test_explicit_dry_run_with_url_set(self, tmp_path, capsys, monkeypatch):
        # Even when URL is set, --dry-run honors operator intent so
        # they can preview without firing.
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path), "--dry-run"])
        assert rc == 0
        out = capsys.readouterr().out
        assert "DRY RUN" in out
        # Real URL appears in the curl, not the placeholder — operator
        # gets a paste-ready command.
        assert "https://discord.com/api/webhooks/1/2" in out

    def test_json_flag_emits_parseable_json_in_dry_run(self, tmp_path, capsys, monkeypatch):
        # Pinned by the cross-tool meta-test convention.
        monkeypatch.delenv(ENV_WEBHOOK_URL, raising=False)
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path), "--json"])
        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["dry_run"] is True
        assert parsed["url_set"] is False
        assert "payload" in parsed
        assert parsed["payload"]["username"] == "threads-watcher"

    def test_missing_state_file_exits_one(self, tmp_path, capsys, monkeypatch):
        monkeypatch.delenv(ENV_WEBHOOK_URL, raising=False)
        rc = _cli_main([str(tmp_path / "nope.json")])
        assert rc == 1
        err = capsys.readouterr().err
        assert "not found" in err.lower()

    def test_empty_string_url_falls_back_to_dry_run(self, tmp_path, capsys, monkeypatch):
        # 🔒 Regression: ENV=`` (exported but empty) used to crash
        # with `ValueError: unknown url type: ''` from urllib.
        # Caught by the cross-tool meta-test (CLI conventions) when
        # the test harness explicitly sets the env to ''. The fix is
        # to treat empty-string as "not set" so the tool dry-runs
        # safely. Pin so a future refactor can't regress.
        monkeypatch.setenv(ENV_WEBHOOK_URL, "")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path), "--json"])
        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["dry_run"] is True
        assert parsed["url_set"] is False


class TestCliPost:
    """Real POST path — mocks urlopen at the discord_post layer so
    no socket actually opens."""

    def _write_state(self, tmp_path):
        state = {"snapshot_generated_at": "ts", "open_incidents": [], "mttr_summary": []}
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    @patch("discord_post.urllib.request.urlopen")
    def test_successful_post_exits_zero(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path)])
        assert rc == 0
        assert "OK status=204" in capsys.readouterr().out

    @patch("discord_post.urllib.request.urlopen")
    def test_4xx_exits_one_with_body_in_stderr(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        err_body = '{"message": "Invalid Webhook Token"}'
        mock_urlopen.side_effect = urllib.error.HTTPError(
            "u", 401, "Unauthorized", {},
            io.BytesIO(err_body.encode("utf-8")),
        )
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path)])
        assert rc == 1
        err = capsys.readouterr().err
        assert "Invalid Webhook Token" in err
        assert "401" in err

    @patch("discord_post.urllib.request.urlopen")
    def test_url_error_redacted_in_stderr(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        mock_urlopen.side_effect = urllib.error.URLError("name resolution failed")
        secret = "verylongsecrettoken123456789"
        monkeypatch.setenv(ENV_WEBHOOK_URL, f"https://discord.com/api/webhooks/1/{secret}")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path)])
        assert rc == 1
        err = capsys.readouterr().err
        # 🔒 The actual token MUST NOT appear in the error message.
        # The webhook token is bearer-equivalent and a leaked
        # error line in operator logs would mean key rotation.
        assert secret not in err
        assert "redacted" in err

    @patch("discord_post.urllib.request.urlopen")
    def test_json_post_success(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        state_path = self._write_state(tmp_path)
        rc = _cli_main([str(state_path), "--json"])
        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["posted"] is True
        assert parsed["status"] == 204


# ── CLI subprocess (proves the if __name__ == '__main__' path) ────────


class TestCliSubprocess:
    def test_help_exits_zero(self, tmp_path):
        r = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "discord_post.py"), "--help"],
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert r.returncode == 0
        assert "usage" in r.stdout.lower()

    def test_missing_state_file_subprocess_exits_one(self, tmp_path):
        r = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "discord_post.py"),
             str(tmp_path / "no-such.json")],
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
            timeout=10,
            env={"PATH": "/usr/bin:/bin"},  # explicitly DROP webhook URL
        )
        assert r.returncode == 1
        assert "not found" in r.stderr.lower()


# ── Sanity: DISCORD_OK_STATUS contract ─────────────────────────────────


def test_discord_ok_status_includes_204():
    # Discord's actual success status; if a future refactor removes it
    # silently, successful posts would surface as errors.
    assert 204 in DISCORD_OK_STATUS


def test_discord_ok_status_includes_200_for_backcompat():
    # Defensive against Discord changing the response.
    assert 200 in DISCORD_OK_STATUS


# ── severity-filter (--min-severity) ──────────────────────────────────


from discord_post import (  # noqa: E402
    SEVERITY_ERR, SEVERITY_NONE, SEVERITY_ORDER, SEVERITY_WARN,
    severity_at_or_above, severity_of_payload,
)
from discord_payload import COLOR_GREEN, COLOR_RED, COLOR_YELLOW  # noqa: E402


class TestSeverityLadder:
    """Pure helpers — pin the ordering + ladder semantics so future
    palette additions don't accidentally invert the comparison."""

    def test_severity_order_is_ascending(self):
        # Documented contract: SEVERITY_ORDER goes LEAST-severe → MOST.
        # The CLI filter uses "at or above" which assumes this ordering.
        assert SEVERITY_ORDER == (SEVERITY_NONE, SEVERITY_WARN, SEVERITY_ERR)

    def test_at_or_above_includes_equal(self):
        # warn at threshold warn → posts. The boundary is INCLUSIVE
        # (operator intuition: "min warn" means "warn AND above").
        assert severity_at_or_above(SEVERITY_WARN, SEVERITY_WARN)
        assert severity_at_or_above(SEVERITY_ERR, SEVERITY_ERR)
        assert severity_at_or_above(SEVERITY_NONE, SEVERITY_NONE)

    def test_at_or_above_filters_lower(self):
        # green vs warn-threshold → suppress.
        assert not severity_at_or_above(SEVERITY_NONE, SEVERITY_WARN)
        # warn vs err-threshold → suppress.
        assert not severity_at_or_above(SEVERITY_WARN, SEVERITY_ERR)

    def test_at_or_above_passes_higher(self):
        # err vs warn-threshold → post (always alert on more-severe).
        assert severity_at_or_above(SEVERITY_ERR, SEVERITY_WARN)
        assert severity_at_or_above(SEVERITY_WARN, SEVERITY_NONE)


class TestSeverityOfPayload:
    def _embed(self, color):
        return {"embeds": [{"color": color}]}

    def test_red_is_err(self):
        assert severity_of_payload(self._embed(COLOR_RED)) == SEVERITY_ERR

    def test_yellow_is_warn(self):
        assert severity_of_payload(self._embed(COLOR_YELLOW)) == SEVERITY_WARN

    def test_green_is_none(self):
        assert severity_of_payload(self._embed(COLOR_GREEN)) == SEVERITY_NONE

    def test_unknown_color_degrades_safely_to_none(self):
        # 🔒 Defensive: future palette drift (e.g., a new ORANGE) must
        # NOT silently suppress alerts. Map unknowns to least-severe
        # so the worst case is one extra POST, not a missed alert.
        assert severity_of_payload(self._embed(0x000000)) == SEVERITY_NONE

    def test_missing_color_field_degrades_safely(self):
        # State.json without an embed (e.g., upstream builder bug)
        # falls back to least-severe → still posts → operator sees
        # the malformed payload + can debug.
        assert severity_of_payload({"embeds": [{}]}) == SEVERITY_NONE
        assert severity_of_payload({}) == SEVERITY_NONE


class TestCliMinSeverityFilter:
    def _write_state_with_incidents(self, tmp_path, *, count_open=0, mttr_mean_s=0, now_warn_age_s=0):
        """Generate a state.json that maps to a specific severity:
        - 0 open + 0 mttr → GREEN (none)
        - open age 2h → YELLOW (warn)
        - mttr mean 25h → RED (err)
        Lets each test pick the exact severity it wants to exercise."""
        state = {
            "snapshot_generated_at": "2026-05-23T08:00:00Z",
            "open_incidents": [
                {"handle": f"@h{i}", "warn_ts": 1_700_000_000 - now_warn_age_s, "current_bucket": 0.6}
                for i in range(count_open)
            ],
            "mttr_summary": (
                [{"handle": "@chronic", "incidents": 3, "mean_s": mttr_mean_s, "max_s": mttr_mean_s}]
                if mttr_mean_s > 0 else []
            ),
        }
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    @patch("discord_post.urllib.request.urlopen")
    def test_green_state_skipped_when_min_warn(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        # The headline operator win: GREEN noise is suppressed at warn.
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        state_path = self._write_state_with_incidents(tmp_path)  # all-healthy
        rc = _cli_main([str(state_path), "--min-severity", "warn"])
        assert rc == 0
        assert "SKIPPED" in capsys.readouterr().out
        # 🔒 The crucial pin: HTTP was NEVER called. If urlopen was
        # invoked, the filter ran AFTER the network attempt — wrong order.
        mock_urlopen.assert_not_called()

    @patch("discord_post.urllib.request.urlopen")
    def test_yellow_state_posted_when_min_warn(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        # current_bucket value isn't what triggers severity — only the
        # warn_ts elapsed (>= 3600) does. Use a 2h-old incident.
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        # Use real time math so the helper hits the WARN threshold.
        import time
        warn_age = 2 * 3600  # 2h ago
        state = {
            "snapshot_generated_at": "ts",
            "open_incidents": [{"handle": "@y", "warn_ts": int(time.time()) - warn_age, "current_bucket": 0.6}],
            "mttr_summary": [],
        }
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        rc = _cli_main([str(path), "--min-severity", "warn"])
        assert rc == 0
        # Real POST happened — filter let it through.
        mock_urlopen.assert_called_once()

    @patch("discord_post.urllib.request.urlopen")
    def test_yellow_state_skipped_when_min_err(self, mock_urlopen, tmp_path, capsys, monkeypatch):
        # Operator who only wants 24h+ chronic alerts.
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        import time
        state = {
            "snapshot_generated_at": "ts",
            "open_incidents": [{"handle": "@y", "warn_ts": int(time.time()) - 2 * 3600, "current_bucket": 0.6}],
            "mttr_summary": [],
        }
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        rc = _cli_main([str(path), "--min-severity", "err"])
        assert rc == 0
        mock_urlopen.assert_not_called()

    @patch("discord_post.urllib.request.urlopen")
    def test_default_min_severity_none_posts_everything(self, mock_urlopen, tmp_path, monkeypatch):
        # Backward compat: omitting --min-severity must post even GREEN
        # (current behaviour). Operators not opting in see no change.
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        state_path = self._write_state_with_incidents(tmp_path)  # GREEN
        rc = _cli_main([str(state_path)])  # no --min-severity
        assert rc == 0
        mock_urlopen.assert_called_once()

    def test_skipped_json_output_is_parseable(self, tmp_path, capsys, monkeypatch):
        # --json + skipped = structured signal so a cron-watcher can
        # `jq .skipped` to distinguish "no post needed" vs "network fail".
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2tok")
        state_path = self._write_state_with_incidents(tmp_path)  # GREEN
        rc = _cli_main([str(state_path), "--min-severity", "warn", "--json"])
        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["skipped"] is True
        assert parsed["reason"] == "min_severity_filter"
        assert parsed["observed_severity"] == "none"
        assert parsed["min_severity"] == "warn"

    def test_bad_severity_arg_exits_two(self, tmp_path, capsys, monkeypatch):
        # argparse choices → bad value = exit 2 (CLI convention).
        monkeypatch.delenv(ENV_WEBHOOK_URL, raising=False)
        state_path = self._write_state_with_incidents(tmp_path)
        with pytest.raises(SystemExit) as exc:
            _cli_main([str(state_path), "--min-severity", "critical"])
        assert exc.value.code == 2


# ── cooldown (--cooldown SECONDS) ──────────────────────────────────────


from discord_post import (  # noqa: E402
    _load_cooldown_state, _save_cooldown_state, should_skip_for_cooldown,
)


class TestShouldSkipForCooldown:
    """Pure helper — pin the decision matrix:
       cooldown=0  → never skip (feature disabled)
       no state    → never skip (first post)
       transition  → never skip (severity change worth surfacing)
       in-window   → skip
       past-window → don't skip"""

    def test_zero_cooldown_never_skips(self):
        # Backward-compat sentinel.
        state = {"last_severity": "warn", "last_posted_at": 1000}
        assert not should_skip_for_cooldown(
            "warn", state, cooldown_sec=0, now_ts=1100,
        )

    def test_no_prior_state_never_skips(self):
        assert not should_skip_for_cooldown(
            "warn", None, cooldown_sec=3600, now_ts=1000,
        )

    def test_severity_transition_never_skips(self):
        # 🔒 The critical safety pin: warn→err escalation must NEVER
        # be muted by cooldown, no matter how recent the last post.
        state = {"last_severity": "warn", "last_posted_at": 1000}
        assert not should_skip_for_cooldown(
            "err", state, cooldown_sec=3600, now_ts=1001,  # 1s ago
        )
        # And recovery direction (err → warn → none) also surfaces.
        state2 = {"last_severity": "err", "last_posted_at": 1000}
        assert not should_skip_for_cooldown(
            "warn", state2, cooldown_sec=3600, now_ts=1001,
        )
        assert not should_skip_for_cooldown(
            "none", state2, cooldown_sec=3600, now_ts=1001,
        )

    def test_same_severity_in_window_skips(self):
        state = {"last_severity": "warn", "last_posted_at": 1000}
        # 500s elapsed, cooldown 3600 → still in window
        assert should_skip_for_cooldown(
            "warn", state, cooldown_sec=3600, now_ts=1500,
        )

    def test_same_severity_past_window_does_not_skip(self):
        state = {"last_severity": "warn", "last_posted_at": 1000}
        # 3601s elapsed, cooldown 3600 → just past window
        assert not should_skip_for_cooldown(
            "warn", state, cooldown_sec=3600, now_ts=4601,
        )

    def test_boundary_at_exactly_cooldown_does_not_skip(self):
        # Inclusive at the boundary: elapsed == cooldown → DON'T skip.
        # Operator setting cooldown=3600 with hourly cron expects the
        # 1h tick to fire, not be off-by-one.
        state = {"last_severity": "warn", "last_posted_at": 1000}
        assert not should_skip_for_cooldown(
            "warn", state, cooldown_sec=3600, now_ts=4600,
        )

    def test_malformed_state_treats_as_no_state(self):
        # Future state-file corruption (partial write etc.) shouldn't
        # cause infinite skip — treat as fresh, post + recreate.
        assert not should_skip_for_cooldown(
            "warn", {"last_severity": "warn", "last_posted_at": "garbage"},
            cooldown_sec=3600, now_ts=1500,
        )
        assert not should_skip_for_cooldown(
            "warn", {"last_severity": "warn"},  # missing posted_at
            cooldown_sec=3600, now_ts=1500,
        )


class TestCooldownStateIO:
    def test_load_returns_none_for_missing_file(self, tmp_path):
        assert _load_cooldown_state(tmp_path / "nope.json") is None

    def test_load_returns_none_for_malformed_json(self, tmp_path):
        path = tmp_path / "broken.json"
        path.write_text("not json {{{", encoding="utf-8")
        assert _load_cooldown_state(path) is None

    def test_load_returns_none_for_non_dict_top(self, tmp_path):
        # Defensive: a future migration that wrote a list at the top
        # shouldn't crash the loader.
        path = tmp_path / "list.json"
        path.write_text("[]", encoding="utf-8")
        assert _load_cooldown_state(path) is None

    def test_save_then_load_roundtrip(self, tmp_path):
        path = tmp_path / "state.json"
        _save_cooldown_state(path, "warn", 12345)
        state = _load_cooldown_state(path)
        assert state == {"last_severity": "warn", "last_posted_at": 12345}

    def test_save_creates_parent_dir(self, tmp_path):
        # State file lives under threads-watcher-status/ by default;
        # the dir might not exist in fresh checkout / test sandbox.
        path = tmp_path / "nested" / "deeper" / "state.json"
        _save_cooldown_state(path, "warn", 1)
        assert path.exists()


class TestCliCooldownEndToEnd:
    def _write_yellow_state(self, tmp_path, name="state.json"):
        import time
        state = {
            "snapshot_generated_at": "ts",
            "open_incidents": [{
                "handle": "@y", "warn_ts": int(time.time()) - 2 * 3600,
                "current_bucket": 0.6,
            }],
            "mttr_summary": [],
        }
        path = tmp_path / name
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    @patch("discord_post.urllib.request.urlopen")
    def test_default_cooldown_zero_preserves_existing_behaviour(
        self, mock_urlopen, tmp_path, monkeypatch,
    ):
        # Backward-compat: no --cooldown arg → always post.
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        state_path = self._write_yellow_state(tmp_path)
        cd_state = tmp_path / "cd.json"
        for _ in range(3):
            rc = _cli_main([str(state_path), "--cooldown-state", str(cd_state)])
            assert rc == 0
        assert mock_urlopen.call_count == 3
        # 🔒 State file MUST NOT have been created when cooldown=0;
        # we don't want to scatter state files for opted-out operators.
        assert not cd_state.exists()

    @patch("discord_post.urllib.request.urlopen")
    def test_cooldown_suppresses_repeat_same_severity(
        self, mock_urlopen, tmp_path, monkeypatch,
    ):
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        state_path = self._write_yellow_state(tmp_path)
        cd_state = tmp_path / "cd.json"
        # First call: posts + saves state.
        rc1 = _cli_main([
            str(state_path), "--cooldown", "3600",
            "--cooldown-state", str(cd_state),
        ])
        assert rc1 == 0
        # Second call (same severity, within window): skipped, no
        # additional POST.
        rc2 = _cli_main([
            str(state_path), "--cooldown", "3600",
            "--cooldown-state", str(cd_state),
        ])
        assert rc2 == 0
        assert mock_urlopen.call_count == 1, (
            f"Cooldown should have skipped the second post; got "
            f"{mock_urlopen.call_count} POSTs"
        )

    @patch("discord_post.urllib.request.urlopen")
    def test_severity_transition_overrides_cooldown(
        self, mock_urlopen, tmp_path, monkeypatch,
    ):
        # 🔒 The headline safety: a warn→err escalation 1s after a
        # warn post MUST fire. Operators can't afford to miss this.
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        cd_state = tmp_path / "cd.json"
        # Seed prior state: warn posted 1 second ago.
        import time
        _save_cooldown_state(cd_state, "warn", int(time.time()) - 1)
        # Build a RED state.json (mttr_summary mean >= 24h → red).
        red_state = tmp_path / "red.json"
        red_state.write_text(json.dumps({
            "snapshot_generated_at": "ts",
            "open_incidents": [],
            "mttr_summary": [{"handle": "@x", "incidents": 1,
                              "mean_s": 25 * 3600, "max_s": 25 * 3600}],
        }), encoding="utf-8")
        rc = _cli_main([
            str(red_state), "--cooldown", "3600",
            "--cooldown-state", str(cd_state),
        ])
        assert rc == 0
        mock_urlopen.assert_called_once()  # escalation posted

    def test_cooldown_skip_json_output(self, tmp_path, capsys, monkeypatch):
        # Test the structured-output contract without needing a mock.
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        state_path = self._write_yellow_state(tmp_path)
        cd_state = tmp_path / "cd.json"
        import time
        _save_cooldown_state(cd_state, "warn", int(time.time()) - 100)
        rc = _cli_main([
            str(state_path), "--cooldown", "3600",
            "--cooldown-state", str(cd_state), "--json",
        ])
        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["skipped"] is True
        assert parsed["reason"] == "cooldown_active"
        assert parsed["observed_severity"] == "warn"
        assert parsed["cooldown_sec"] == 3600
        assert 3400 <= parsed["remaining_sec"] <= 3500  # ~3500s remaining

    @patch("discord_post.urllib.request.urlopen")
    def test_filter_and_cooldown_compose(
        self, mock_urlopen, tmp_path, monkeypatch,
    ):
        # When --min-severity skips, cooldown state must NOT be
        # written (otherwise a tomorrow's warn would be incorrectly
        # gated against a "green posted yesterday" entry that never
        # actually posted).
        mock_urlopen.return_value = _FakeResponse(204, "")
        monkeypatch.setenv(ENV_WEBHOOK_URL, "https://discord.com/api/webhooks/1/2")
        green_state = tmp_path / "g.json"
        green_state.write_text(json.dumps({
            "snapshot_generated_at": "ts",
            "open_incidents": [], "mttr_summary": [],
        }), encoding="utf-8")
        cd_state = tmp_path / "cd.json"
        rc = _cli_main([
            str(green_state), "--min-severity", "warn",
            "--cooldown", "3600", "--cooldown-state", str(cd_state),
        ])
        assert rc == 0
        mock_urlopen.assert_not_called()
        assert not cd_state.exists(), (
            "min-severity-filter skip should NOT create cooldown state; "
            "doing so would corrupt the dedup signal for future calls"
        )


# ── End-to-end against a real local HTTP listener ──────────────────────
#
# All other discord_post tests mock urlopen. That covers logic
# correctness but doesn't prove the wire-level chain:
#   build_request → urllib socket → real HTTP POST → server reads bytes
# A future change that breaks header serialization, body encoding, or
# the User-Agent expectation would slip past the mocks. This class
# stands up a stdlib http.server mock-Discord and asserts on what
# ACTUALLY reaches the wire.


import http.server  # noqa: E402
import socketserver  # noqa: E402
import threading  # noqa: E402
import contextlib  # noqa: E402


# Captures (path, body_bytes, headers, status_to_return) per request.
# Module-level mutable so the handler class can write into it without
# constructor plumbing. Each test reads + clears before/after.
_CAPTURED_REQUESTS: list[dict] = []
_RETURN_STATUS = [204]  # mutable so a test can set 4xx before requesting


class _MockDiscordHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (BaseHTTPRequestHandler convention)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        _CAPTURED_REQUESTS.append({
            "path": self.path,
            "body": body,
            "content_type": self.headers.get("Content-Type"),
            "user_agent": self.headers.get("User-Agent"),
        })
        status = _RETURN_STATUS[0]
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args, **kwargs):
        # Silence the per-request stderr noise. Tests check
        # _CAPTURED_REQUESTS, not the server log.
        pass


@contextlib.contextmanager
def _mock_discord_server():
    """Spin up a localhost http.server on a free port, yield (host, port).
    Cleans up the thread on exit."""

    class _Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    httpd = _Server(("127.0.0.1", 0), _MockDiscordHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield ("127.0.0.1", port)
    finally:
        httpd.shutdown()
        thread.join(timeout=5)


class TestEndToEndAgainstMockDiscord:
    """No urlopen mocks — real socket I/O against an in-process HTTP
    server. Catches wire-level regressions the unit tests can't see."""

    def _write_state(self, tmp_path, **overrides):
        state = {
            "snapshot_generated_at": "ts",
            "open_incidents": [], "mttr_summary": [],
        }
        state.update(overrides)
        import time
        if "open_incidents" not in overrides:
            state["open_incidents"] = [{
                "handle": "@y",
                "warn_ts": int(time.time()) - 2 * 3600,
                "current_bucket": 0.6,
            }]
        path = tmp_path / "state.json"
        path.write_text(json.dumps(state), encoding="utf-8")
        return path

    def setup_method(self):
        _CAPTURED_REQUESTS.clear()
        _RETURN_STATUS[0] = 204  # Discord's documented success

    def test_real_post_succeeds_and_carries_full_payload(self, tmp_path, monkeypatch):
        # 🔒 Headline e2e: socket-level chain produces a valid
        # Discord-shaped POST and exit 0. The unit tests pin the
        # behaviour against a mock; this pins it against bytes
        # actually traveling over a TCP connection.
        state_path = self._write_state(tmp_path)
        with _mock_discord_server() as (host, port):
            url = f"http://{host}:{port}/api/webhooks/1234567890/abctok"
            monkeypatch.setenv(ENV_WEBHOOK_URL, url)
            rc = _cli_main([str(state_path)])
        assert rc == 0
        assert len(_CAPTURED_REQUESTS) == 1
        req = _CAPTURED_REQUESTS[0]
        # The URL path the server saw must be Discord's webhook
        # shape, not anything mangled by url-building.
        assert req["path"] == "/api/webhooks/1234567890/abctok"
        # Content-Type pinned by build_request — header parsing on
        # Discord's side is strict; a missing charset hint or a
        # `application/x-www-form-urlencoded` slip would 4xx.
        assert req["content_type"] == "application/json"
        # User-Agent identifies the tool to Discord-side log triage.
        assert "threads-watcher" in (req["user_agent"] or "")
        # Body must parse as JSON + carry the expected embed shape.
        body = json.loads(req["body"])
        assert body["username"] == "threads-watcher"
        assert len(body["embeds"]) == 1
        embed = body["embeds"][0]
        assert embed["title"] == "threads-watcher status"
        # Severity-driven color (yellow for 2h-old incident).
        assert embed["color"] in (0xB86B00, 0xCC3333)
        # description was added in commit 831705e — must reach wire.
        assert "🟡" in embed["description"] or "🔴" in embed["description"]

    def test_4xx_response_exits_one_with_body_in_stderr(
        self, tmp_path, monkeypatch, capsys,
    ):
        # 🔒 Pins the error-surfacing contract: 4xx response is
        # treated as failure, body is shown to the operator so
        # they can read Discord's actual reason without strace.
        state_path = self._write_state(tmp_path)
        _RETURN_STATUS[0] = 401
        with _mock_discord_server() as (host, port):
            url = f"http://{host}:{port}/api/webhooks/1/abctoken"
            monkeypatch.setenv(ENV_WEBHOOK_URL, url)
            rc = _cli_main([str(state_path)])
        assert rc == 1
        err = capsys.readouterr().err
        # The status code lands in stderr — operator's primary
        # signal that the webhook was rejected.
        assert "401" in err

    def test_dry_run_does_not_actually_post(
        self, tmp_path, monkeypatch, capsys,
    ):
        # Defensive belt-and-braces: --dry-run + URL set must NOT
        # touch the wire. The unit tests assert via mock; this
        # pins via "the mock server never saw a request".
        state_path = self._write_state(tmp_path)
        with _mock_discord_server() as (host, port):
            url = f"http://{host}:{port}/api/webhooks/1/tok"
            monkeypatch.setenv(ENV_WEBHOOK_URL, url)
            rc = _cli_main([str(state_path), "--dry-run"])
        assert rc == 0
        assert len(_CAPTURED_REQUESTS) == 0, (
            f"--dry-run must NOT hit the wire, but mock server "
            f"captured {len(_CAPTURED_REQUESTS)} request(s)"
        )
        assert "DRY RUN" in capsys.readouterr().out

    def test_severity_filter_skips_before_hitting_wire(
        self, tmp_path, monkeypatch,
    ):
        # 🔒 Same property as the mock-based test, now proven at
        # the socket level: --min-severity warn with a GREEN state
        # must not POST. If the filter ran AFTER urlopen by accident
        # (refactor regression), the mock server would catch it.
        green_state = tmp_path / "g.json"
        green_state.write_text(json.dumps({
            "snapshot_generated_at": "ts",
            "open_incidents": [], "mttr_summary": [],
        }), encoding="utf-8")
        with _mock_discord_server() as (host, port):
            url = f"http://{host}:{port}/api/webhooks/1/tok"
            monkeypatch.setenv(ENV_WEBHOOK_URL, url)
            rc = _cli_main([str(green_state), "--min-severity", "warn"])
        assert rc == 0
        assert len(_CAPTURED_REQUESTS) == 0


# ── 429 rate-limit retry (uses the e2e harness above) ──────────────────


from discord_post import (  # noqa: E402
    RETRY_AFTER_CAP_S, RETRY_AFTER_DEFAULT_S,
    _parse_retry_after, post_payload,
)


class TestParseRetryAfter:
    """Pure helper — pin the parse + clamp + fallback matrix."""

    def _hdr(self, value):
        # Mimic the email.message.Message interface used by HTTPError.headers
        class _H:
            def __init__(self, v): self._v = v
            def get(self, _k, _d=None): return self._v
        return _H(value)

    def test_integer_string(self):
        assert _parse_retry_after(self._hdr("5")) == 5.0

    def test_fractional_string(self):
        # Discord docs say fractional sub-second is possible.
        assert _parse_retry_after(self._hdr("0.5")) == 0.5

    def test_missing_header_uses_default(self):
        assert _parse_retry_after(self._hdr(None)) == RETRY_AFTER_DEFAULT_S

    def test_empty_string_uses_default(self):
        assert _parse_retry_after(self._hdr("")) == RETRY_AFTER_DEFAULT_S

    def test_garbage_uses_default(self):
        # 🔒 Defensive: a malformed Retry-After (HTTP-date format, etc.)
        # must NOT raise. Falling back to default is safer than blowing
        # up the entire retry loop on a server-side oddity.
        assert _parse_retry_after(self._hdr("Mon, 1 Jan 2026 00:00:00 GMT")) == RETRY_AFTER_DEFAULT_S

    def test_negative_uses_default(self):
        # Spec says non-negative; a buggy server returning -1 must
        # not become sleep(-1) which raises.
        assert _parse_retry_after(self._hdr("-1")) == RETRY_AFTER_DEFAULT_S

    def test_clamped_at_cap(self):
        # 🔒 Operator UX: a server quirk returning 600s shouldn't
        # leave the poster blocked for 10 minutes. Cap is documented
        # and pinned.
        assert _parse_retry_after(self._hdr("600")) == RETRY_AFTER_CAP_S

    def test_none_headers_uses_default(self):
        # If HTTPError.headers is None (older urllib path), fall through.
        assert _parse_retry_after(None) == RETRY_AFTER_DEFAULT_S


class TestPostPayloadRetry:
    """Unit tests via mock urlopen — pin the retry-loop semantics
    without spinning up a server. End-to-end socket-level retry
    is verified separately in TestEndToEndAgainstMockDiscord."""

    URL = "https://discord.com/api/webhooks/1/token"

    def _http_error_429(self, retry_after="1"):
        class _Hdr:
            def __init__(self, v): self._v = v
            def get(self, k, d=None): return self._v if k == "Retry-After" else d
        return urllib.error.HTTPError(
            self.URL, 429, "Too Many Requests", _Hdr(retry_after),
            io.BytesIO(b'{"message": "Rate limited"}'),
        )

    @patch("discord_post.urllib.request.urlopen")
    def test_no_retry_by_default(self, mock_urlopen):
        # Backward-compat: max_retries=0 (default) → 429 returns
        # immediately, no sleep, no retry.
        mock_urlopen.side_effect = self._http_error_429("5")
        sleep_calls = []
        status, body = post_payload(
            self.URL, {"ping": 1},
            sleep_fn=lambda s: sleep_calls.append(s),
        )
        assert status == 429
        assert "Rate limited" in body
        assert sleep_calls == [], (
            f"Default max_retries=0 must not sleep; got {sleep_calls}"
        )

    @patch("discord_post.urllib.request.urlopen")
    def test_one_retry_sleeps_then_succeeds(self, mock_urlopen):
        # First call 429, retry succeeds → ends in 204.
        mock_urlopen.side_effect = [
            self._http_error_429("2"),
            _FakeResponse(204, ""),
        ]
        sleep_calls = []
        status, body = post_payload(
            self.URL, {"ping": 1}, max_retries=1,
            sleep_fn=lambda s: sleep_calls.append(s),
        )
        assert status == 204
        assert sleep_calls == [2.0]

    @patch("discord_post.urllib.request.urlopen")
    def test_retries_exhausted_returns_last_429(self, mock_urlopen):
        # 3 sequential 429s with max_retries=2 → 1 initial + 2
        # retries = 3 attempts total, all 429.
        mock_urlopen.side_effect = [
            self._http_error_429("1"),
            self._http_error_429("1"),
            self._http_error_429("1"),
        ]
        sleep_calls = []
        status, body = post_payload(
            self.URL, {"ping": 1}, max_retries=2,
            sleep_fn=lambda s: sleep_calls.append(s),
        )
        assert status == 429
        assert sleep_calls == [1.0, 1.0]

    @patch("discord_post.urllib.request.urlopen")
    def test_4xx_other_than_429_does_not_retry(self, mock_urlopen):
        # 🔒 401 (bad webhook token) must NOT retry — retrying a
        # bad token spams the same failure. Only 429 retries.
        not_429 = urllib.error.HTTPError(
            self.URL, 401, "Unauthorized", {},
            io.BytesIO(b'{"message": "Invalid Webhook Token"}'),
        )
        mock_urlopen.side_effect = not_429
        sleep_calls = []
        status, body = post_payload(
            self.URL, {"ping": 1}, max_retries=5,
            sleep_fn=lambda s: sleep_calls.append(s),
        )
        assert status == 401
        assert sleep_calls == [], "401 must NOT trigger retry"


# ── 429 retry, end-to-end against the mock server ──────────────────────


class TestRetryEndToEnd:
    """Real socket — uses the same mock-server harness as
    TestEndToEndAgainstMockDiscord above. Proves the retry loop
    actually re-sends the request, not just re-calls a mock."""

    def _write_yellow_state(self, tmp_path):
        import time
        path = tmp_path / "state.json"
        path.write_text(json.dumps({
            "snapshot_generated_at": "ts",
            "open_incidents": [{
                "handle": "@y",
                "warn_ts": int(time.time()) - 2 * 3600,
                "current_bucket": 0.6,
            }],
            "mttr_summary": [],
        }), encoding="utf-8")
        return path

    def setup_method(self):
        _CAPTURED_REQUESTS.clear()
        _RETURN_STATUS[0] = 204

    def test_cli_max_retries_zero_429_exits_one(
        self, tmp_path, monkeypatch, capsys,
    ):
        # Without --max-retries, a 429 exits 1 (current behaviour).
        _RETURN_STATUS[0] = 429
        state_path = self._write_yellow_state(tmp_path)
        with _mock_discord_server() as (host, port):
            url = f"http://{host}:{port}/api/webhooks/1/tok"
            monkeypatch.setenv(ENV_WEBHOOK_URL, url)
            rc = _cli_main([str(state_path)])
        assert rc == 1
        # Mock server should have received exactly 1 request — no retry.
        assert len(_CAPTURED_REQUESTS) == 1
        assert "429" in capsys.readouterr().err
