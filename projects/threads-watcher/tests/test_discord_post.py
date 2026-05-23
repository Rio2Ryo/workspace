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
