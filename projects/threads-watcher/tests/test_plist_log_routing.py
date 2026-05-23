"""Regression guard: launchd plist log-routing assumptions.

Pre-fix `com.shiro.threads-watcher-sync.plist` declared
StandardOutPath → logs/sync.out.log, but sync.py writes nothing to
stdout (all logging flows through TeeLogger to stderr + the --log
file). Result: sync.out.log sat at 0 bytes for the whole install
lifetime — pure operational noise that misled grep/tail attempts.

This test pins two invariants so a future agent re-adding the dead
key surfaces immediately:

  1. com.shiro.threads-watcher-sync.plist MUST NOT carry
     StandardOutPath. If a real stdout consumer ever lands in
     publish-if-delta.sh, this test should be updated alongside the code change
     (intentional, not silent).

  2. com.shiro.threads-watcher-auto-restart.plist MUST keep
     StandardOutPath set to logs/auto-restart.out.log — that
     script's ts_log() helper writes via printf to stdout, and the
     ~11KB on-disk log proves operators rely on the capture.
     Asymmetric on purpose.

  3. Both plists MUST keep StandardErrorPath (catches uncaught
     Python tracebacks / shell errors that bypass the in-script
     loggers). Don't generalise either edit.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SYNC_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-sync.plist"
AUTO_RESTART_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-auto-restart.plist"

# Apple's plutil tolerates `--` inside XML comments (the existing
# plists contain `<!-- ... --confirm ... -->` patterns); Python's
# strict expat parser does not. Use the platform plutil to convert
# to JSON exactly as launchd reads it.
_PLUTIL = shutil.which("plutil")
pytestmark = pytest.mark.skipif(
    _PLUTIL is None,
    reason="plutil unavailable — Linux CI / non-macOS dev box. plist invariants only checked on macOS.",
)


def _load(path: Path) -> dict:
    res = subprocess.run(
        [_PLUTIL, "-convert", "json", "-o", "-", "--", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(res.stdout)


def test_sync_plist_does_not_declare_stdout_path():
    plist = _load(SYNC_PLIST)
    assert "StandardOutPath" not in plist, (
        "sync.py writes nothing to stdout — re-adding StandardOutPath "
        "creates a permanently-empty logs/sync.out.log. If you have a "
        "real stdout consumer, update this test alongside the code."
    )


def test_sync_plist_keeps_stderr_path_for_python_tracebacks():
    plist = _load(SYNC_PLIST)
    err_path = plist.get("StandardErrorPath", "")
    assert err_path.endswith("/logs/publish.err.log"), (
        "Uncaught shell/Python failures may bypass the in-script loggers. "
        "Removing this key "
        "loses crash visibility. Post-TeeLogger-double-write-fix the "
        "stream is now mostly empty in healthy operation — that's "
        "expected and intentional."
    )


def test_auto_restart_plist_keeps_stdout_path():
    # Mirror image: auto-restart-if-stale.sh's ts_log() writes via
    # printf to stdout. Dropping StandardOutPath here would silently
    # discard ~11KB/install of operational logs.
    plist = _load(AUTO_RESTART_PLIST)
    out_path = plist.get("StandardOutPath", "")
    assert out_path.endswith("/logs/auto-restart.out.log")


def test_auto_restart_plist_keeps_stderr_path():
    # Symmetric with the sync plist: uncaught shell/Python failures
    # bypass ts_log(). Without StandardErrorPath a crash that kills the
    # launchd tick leaves no trace at all.
    plist = _load(AUTO_RESTART_PLIST)
    err_path = plist.get("StandardErrorPath", "")
    assert err_path.endswith("/logs/auto-restart.err.log")


def test_auto_restart_plist_invokes_the_self_heal_script():
    # Pin the invocation: a single ProgramArgument, the self-heal
    # script. A refactor that renames the script or points the plist
    # elsewhere fails here, not silently at the next launchd tick.
    plist = _load(AUTO_RESTART_PLIST)
    args = plist.get("ProgramArguments", [])
    assert len(args) == 1, f"expected exactly one ProgramArgument, got {args}"
    assert args[0].endswith("/auto-restart-if-stale.sh"), (
        f"auto-restart plist must invoke auto-restart-if-stale.sh; got {args[0]}"
    )


def test_auto_restart_plist_target_exists_and_is_executable():
    # The plist references the script by ABSOLUTE path. launchd execs
    # it directly, so it must exist AND carry the exec bit — a rename,
    # a move, or a lost chmod +x makes every 5-min tick fail silently,
    # which is exactly the silent-breakage class this subsystem exists
    # to prevent. Also pin that the absolute path matches where the
    # script actually lives in the repo.
    plist = _load(AUTO_RESTART_PLIST)
    target = Path(plist["ProgramArguments"][0])
    assert target == PROJECT_ROOT / "auto-restart-if-stale.sh", (
        f"plist path {target} does not match the script's repo location"
    )
    assert target.is_file(), f"{target} does not exist"
    assert os.access(target, os.X_OK), f"{target} is not executable (launchd cannot run it)"


def test_auto_restart_plist_uses_five_minute_interval():
    # 5-min cadence: fast enough that a dead/hung watcher is revived
    # within ~5 min, matched to restart-if-stale.sh's own 5-min
    # cooldown so consecutive ticks don't fight.
    plist = _load(AUTO_RESTART_PLIST)
    assert plist.get("StartInterval") == 300


def test_auto_restart_plist_working_directory_is_the_project_root():
    # auto-restart-if-stale.sh self-anchors via `cd "$(dirname "$0")"`,
    # but the plist's WorkingDirectory must still resolve to a real
    # directory or launchd refuses to spawn the job.
    plist = _load(AUTO_RESTART_PLIST)
    wd = Path(plist.get("WorkingDirectory", ""))
    assert wd == PROJECT_ROOT, f"WorkingDirectory {wd} is not the threads-watcher dir"
    assert wd.is_dir()


def test_auto_restart_plist_does_not_run_at_load():
    # RunAtLoad=false is the documented default — installing the plist
    # should not fire an immediate restart, just wait for the first
    # scheduled tick.
    plist = _load(AUTO_RESTART_PLIST)
    assert plist.get("RunAtLoad") is False


def test_both_plists_validate_as_well_formed_xml():
    # plistlib.load itself raises on malformed XML, so passing the
    # _load() calls above is most of the check. This test makes the
    # invariant explicit so a regression is easy to spot in the
    # test report.
    _load(SYNC_PLIST)  # raises if malformed
    _load(AUTO_RESTART_PLIST)  # raises if malformed


def test_sync_plist_program_arguments_invoke_publish_if_delta():
    # Pin the basic invocation shape so a refactor that drops the
    # publish wrapper (or accidentally swaps to watcher.py) fails
    # immediately rather than at the next launchd tick.
    plist = _load(SYNC_PLIST)
    args = plist.get("ProgramArguments", [])
    assert any(a.endswith("publish-if-delta.sh") for a in args), (
        f"sync plist must invoke publish-if-delta.sh; got args={args}"
    )


def test_sync_plist_target_exists_and_is_executable():
    # Same guard as the auto-restart plist: launchd execs the script by
    # absolute path, so a rename / move / lost exec bit makes every
    # tick fail silently. Pin existence, the exec bit, and that the
    # path matches the script's real repo location.
    plist = _load(SYNC_PLIST)
    target = Path(plist["ProgramArguments"][0])
    assert target == PROJECT_ROOT / "publish-if-delta.sh", (
        f"plist path {target} does not match the script's repo location"
    )
    assert target.is_file(), f"{target} does not exist"
    assert os.access(target, os.X_OK), f"{target} is not executable (launchd cannot run it)"


def test_sync_plist_runs_live_publish_wrapper_only():
    # The wrapper is the safety boundary: it checks DB delta first, then
    # runs sync.py --confirm --enable-push and deploy.sh only when needed.
    # Keep raw sync.py flags out of the plist so launchd has one clear
    # operational path.
    plist = _load(SYNC_PLIST)
    args = plist.get("ProgramArguments", [])
    assert len(args) == 1
    assert args[0].endswith("publish-if-delta.sh")
    assert "--confirm" not in args
    assert "--enable-push" not in args


def test_sync_plist_uses_five_minute_run_at_load_publish_cycle():
    # Public status should not wait 30 minutes or stay stale until manual
    # intervention. The wrapper exits quickly when there is no DB delta,
    # so a 5-minute cadence is cheap and keeps operator UI fresh.
    plist = _load(SYNC_PLIST)
    assert plist.get("StartInterval") == 300
    assert plist.get("RunAtLoad") is True


# ── discord-post .example template ─────────────────────────────────────
#
# Template (not a live plist) for operator-time install once a Discord
# webhook URL is provisioned. Tests pin shape + paths so a future
# refactor to discord_post.py (renamed flags, moved file, etc.) trips
# here before operator copies a broken template to LaunchAgents.


DISCORD_POST_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-discord-post.plist.example"


def test_discord_post_plist_example_validates_as_well_formed_xml():
    # _load raises on malformed plist — operator launchctl-load of a
    # broken file would silently no-op. Pin at test time.
    _load(DISCORD_POST_PLIST)


def test_discord_post_plist_targets_discord_post_py():
    plist = _load(DISCORD_POST_PLIST)
    args = plist.get("ProgramArguments", [])
    assert any(a.endswith("discord_post.py") for a in args), (
        f"plist must invoke discord_post.py; got {args}"
    )


def test_discord_post_plist_script_path_exists():
    # 🔒 launchd execs by absolute path. A typo / repo move would
    # make every cron tick fail silently with "no such file". Pin
    # the path resolves to a real file in the repo.
    plist = _load(DISCORD_POST_PLIST)
    args = plist["ProgramArguments"]
    py_path = Path(args[0])
    script_path = Path(args[1])
    assert script_path.is_file(), (
        f"discord_post.py path {script_path} doesn't exist. Plist will "
        f"fail at every cron tick — fix the path or restore the file."
    )
    # The Python interpreter is the .venv interpreter — same one
    # the pre-commit hook uses; operator must `python -m venv .venv`
    # at the documented location before loading the plist.
    assert ".venv" in str(py_path), (
        f"plist should use the .venv interpreter for consistency with "
        f"the pre-commit hook + dev workflow; got {py_path}"
    )


def test_discord_post_plist_includes_safety_flags():
    # 🔒 The whole point of this template: ship safety flags by
    # default so operator doesn't have to remember them.
    plist = _load(DISCORD_POST_PLIST)
    args = plist["ProgramArguments"]
    # --min-severity warn → no GREEN spam (ce5ca04)
    assert "--min-severity" in args
    assert args[args.index("--min-severity") + 1] == "warn"
    # --cooldown 21600 → 6h sticky-regime dedup (23ef7fc)
    assert "--cooldown" in args
    assert args[args.index("--cooldown") + 1] == "21600"
    # --max-retries 1 → 429 retry (334c6cb)
    assert "--max-retries" in args
    assert args[args.index("--max-retries") + 1] == "1"


def test_discord_post_plist_declares_webhook_url_env():
    # 🔒 Operator runbook contract: the env var MUST be declared in
    # EnvironmentVariables (even as placeholder) so operator knows
    # where to paste the URL. Missing key = operator has to read
    # discord_post.py source to learn the env name.
    plist = _load(DISCORD_POST_PLIST)
    env = plist.get("EnvironmentVariables", {})
    assert "THREADS_WATCHER_DISCORD_WEBHOOK_URL" in env, (
        f"plist EnvironmentVariables must declare "
        f"THREADS_WATCHER_DISCORD_WEBHOOK_URL (even as placeholder) "
        f"so operator sees where to paste their URL. Got keys: "
        f"{list(env.keys())}"
    )
    # 🔒 The committed value MUST be a placeholder, NEVER a real URL.
    # Catches the operational hazard of accidentally committing a
    # real webhook (which would leak in git history → token rotation).
    placeholder = env["THREADS_WATCHER_DISCORD_WEBHOOK_URL"]
    assert "__SET_BY_OPERATOR__" in placeholder or "placeholder" in placeholder.lower(), (
        f"The committed plist value must be an obvious placeholder, "
        f"not a real webhook URL. Got: {placeholder!r}. If this is "
        f"a real URL the channel was JUST exposed in git history — "
        f"rotate the webhook immediately + redact this value."
    )
    assert "discord.com" not in placeholder, (
        f"🚨 REAL DISCORD WEBHOOK URL committed: {placeholder!r}. "
        f"Rotate it NOW (delete + recreate in Discord channel "
        f"settings) — git history retains it forever."
    )


def test_discord_post_plist_does_not_run_at_load():
    # RunAtLoad=true would fire one post at operator install time,
    # which is surprising (test post lands in channel without
    # explicit operator intent). Pin RunAtLoad=false so the first
    # post waits for a deliberate operator action OR the next
    # natural hour tick.
    plist = _load(DISCORD_POST_PLIST)
    assert plist.get("RunAtLoad") is False, (
        f"discord-post should NOT fire on launchctl load — operator "
        f"first invocation should be deliberate (manually run + verify "
        f"the post landed) before the cron takes over. Got "
        f"RunAtLoad={plist.get('RunAtLoad')!r}"
    )


def test_discord_post_plist_uses_hourly_cadence():
    # 3600s matches the default cron operator expectation + pairs
    # naturally with --cooldown 21600 (6h = 6 ticks → 1 post / 6h
    # for sticky regime).
    plist = _load(DISCORD_POST_PLIST)
    interval = plist.get("StartInterval")
    assert interval == 3600, (
        f"discord-post cadence should be hourly (3600s); got {interval}. "
        f"If tuning, also reconsider --cooldown value in ProgramArguments "
        f"so the two stay coherent."
    )


def test_discord_post_plist_keeps_stderr_path():
    # urllib transport failures / unexpected Python tracebacks land
    # in stderr. Operator triages via tail -f logs/discord-post.err.log.
    plist = _load(DISCORD_POST_PLIST)
    err = plist.get("StandardErrorPath", "")
    assert err.endswith("logs/discord-post.err.log"), (
        f"plist must route stderr to logs/discord-post.err.log; got {err!r}"
    )


def test_discord_post_plist_working_directory_is_project_root():
    # state.json default path is relative to cwd. Without an explicit
    # WorkingDirectory, launchd defaults to "/" and discord_post.py
    # fails with "state.json not found".
    plist = _load(DISCORD_POST_PLIST)
    wd = Path(plist.get("WorkingDirectory", ""))
    assert wd == PROJECT_ROOT, (
        f"plist WorkingDirectory must be the project root so state.json "
        f"default path resolves; got {wd}"
    )


# ── sticky-regime-alert .example template (commit de9369a) ─────────────


STICKY_REGIME_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-sticky-regime-alert.plist.example"


def test_sticky_regime_plist_example_validates_as_well_formed_xml():
    _load(STICKY_REGIME_PLIST)


def test_sticky_regime_plist_targets_sticky_regime_diagnosis_py():
    plist = _load(STICKY_REGIME_PLIST)
    args = plist.get("ProgramArguments", [])
    assert any(a.endswith("sticky_regime_diagnosis.py") for a in args), (
        f"plist must invoke sticky_regime_diagnosis.py; got {args}"
    )


def test_sticky_regime_plist_includes_alert_on_transition_flag():
    # 🔒 The whole point: cron-friendly silent-on-no-change mode.
    # Without --alert-on-transition, each tick would dump the full
    # recommendation block, spamming the log file 24x/day.
    plist = _load(STICKY_REGIME_PLIST)
    args = plist["ProgramArguments"]
    assert "--alert-on-transition" in args, (
        f"plist must pass --alert-on-transition; got {args}"
    )


def test_sticky_regime_plist_script_path_exists():
    plist = _load(STICKY_REGIME_PLIST)
    args = plist["ProgramArguments"]
    script_path = Path(args[1])
    assert script_path.is_file(), (
        f"sticky_regime_diagnosis.py path {script_path} doesn't exist"
    )


def test_sticky_regime_plist_does_not_run_at_load():
    # RunAtLoad=true would fire an alert at operator install time —
    # but the check_transition first-run no-alert guard would suppress
    # it. Pinning RunAtLoad=false documents the intended cron-only
    # cadence regardless.
    plist = _load(STICKY_REGIME_PLIST)
    assert plist.get("RunAtLoad") is False


def test_sticky_regime_plist_uses_hourly_cadence():
    # 3600s pairs with sync.plist's 5-min publish cadence: by the time
    # 12 publish ticks accumulate, recommendation has fresh signal
    # without sub-hour churn on the alert state file.
    plist = _load(STICKY_REGIME_PLIST)
    assert plist.get("StartInterval") == 3600


def test_sticky_regime_plist_routes_stdout_to_alert_log():
    # 🔒 Operator triage workflow: tail -f logs/sticky-regime-alert.out.log
    # gives 1 line per transition. Mis-routing to stderr would mix
    # transition signal with Python tracebacks.
    plist = _load(STICKY_REGIME_PLIST)
    out = plist.get("StandardOutPath", "")
    assert out.endswith("logs/sticky-regime-alert.out.log"), (
        f"stdout should route to logs/sticky-regime-alert.out.log; got {out!r}"
    )


def test_sticky_regime_plist_working_directory_is_project_root():
    # State file path (threads-watcher-status/sticky-regime-last-
    # recommendation.json) is relative; needs cwd at project root
    # to resolve.
    plist = _load(STICKY_REGIME_PLIST)
    wd = Path(plist.get("WorkingDirectory", ""))
    assert wd == PROJECT_ROOT


# ── Sticky-regime plist mutual exclusion (bidirectional lint) ─────────


STICKY_ALERT_DISCORD_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-sticky-alert-discord.plist.example"


class TestStickyRegimePlistsMutualExclusion:
    """Bidirectional pin: each sticky-regime plist's docstring must
    reference the OTHER by name, warning operator that enabling both
    causes double-fire on every transition.

    Why this exists
    ---------------
    sticky-regime-alert.plist (commit 5f0a412 — log-only) and
    sticky-alert-discord.plist (commit ff8b2f2 — chain to Discord)
    both run sticky_regime_diagnosis.py --alert-on-transition
    hourly. If operator enables BOTH:
      - sticky-regime-alert writes "TRANSITION:" to its log
      - sticky-alert-discord also writes TRANSITION + POSTs to Discord
      → operator sees 2 entries per transition in logs + 1 Discord
        post per transition (no DUPLICATE Discord post, but the log
        side is double-recorded, AND the state file is updated twice
        per tick which can mask whether a recently-cleared transition
        was alerted on by both)

    Operator needs an explicit "pick one" note in EACH plist's
    docstring so the warning is visible regardless of which plist
    the operator reads first.

    Drift caught at this commit (in the audit that produced this
    test): only sticky-alert-discord mentioned the mutual exclusion.
    sticky-regime-alert (older, pre-chain-wrapper) was silent —
    operator reading it first would not be warned.
    """

    def _read_header(self, path: Path) -> str:
        """Get the first 50 lines of the plist (covers the docstring
        comment block before the <plist> element)."""
        return "\n".join(
            path.read_text(encoding="utf-8").split("\n")[:50]
        )

    def test_sticky_regime_alert_plist_references_chain_plist(self):
        # 🔒 Operator reading sticky-regime-alert.plist.example MUST
        # see a warning naming the conflicting plist by name. Without
        # this, they install both not knowing the conflict exists.
        header = self._read_header(STICKY_REGIME_PLIST)
        assert "sticky-alert-discord" in header, (
            "sticky-regime-alert plist docstring must reference "
            "sticky-alert-discord plist by name to warn operator "
            "about mutual exclusion (double-fire on transition). "
            "Add a paragraph naming the conflicting plist."
        )

    def test_chain_plist_references_sticky_regime_alert_plist(self):
        # 🔒 Inverse direction: sticky-alert-discord.plist.example
        # MUST reference sticky-regime-alert plist by name.
        header = self._read_header(STICKY_ALERT_DISCORD_PLIST)
        assert "sticky-regime-alert" in header, (
            "sticky-alert-discord plist docstring must reference "
            "sticky-regime-alert plist by name to warn operator "
            "about mutual exclusion."
        )

    def test_both_plists_use_consistent_mutex_keyword(self):
        # Operator searching for "exclude" / "mutual" / "択一" / etc.
        # across plist docstrings should find consistent terminology.
        # Pin the Japanese keyword "択一" since both docstrings already
        # use it — switching would silently fragment the operator
        # search experience.
        for path in (STICKY_REGIME_PLIST, STICKY_ALERT_DISCORD_PLIST):
            header = self._read_header(path)
            assert "択一" in header, (
                f"{path.name}: mutual-exclusion docstring should "
                f"include 「択一」 keyword for consistent operator-"
                f"search across both plists. Pin so future rewording "
                f"of one side doesn't fragment the language."
            )

    def test_both_plists_warn_about_double_fire(self):
        # Specifically the "double-fire" / "2 重" warning — operator
        # needs to know WHY mutex matters, not just THAT it matters.
        for path in (STICKY_REGIME_PLIST, STICKY_ALERT_DISCORD_PLIST):
            header = self._read_header(path)
            assert "2 重" in header or "2-fire" in header or "double-fire" in header.lower(), (
                f"{path.name}: docstring must explain the double-fire "
                f"hazard (2 重 fire on transition), not just declare "
                f"mutex. Operator needs to see the rationale."
            )
