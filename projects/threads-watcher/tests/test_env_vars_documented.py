"""README ↔ source consistency pin for THREADS_WATCHER_* env vars.

Why this exists
---------------
Operator-facing env vars accumulated across recent commits without
landing in a discoverable spot:
  - THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA (2ce832b)
  - THREADS_WATCHER_HEARTBEAT_SEC (b8424f0)
  - THREADS_WATCHER_DISCORD_WEBHOOK_URL (785a75d)
  - 3 NOTIFY_* env vars (older, also undocumented in README)
  - THREADS_WATCHER_INTERVAL / BASELINE_LOOKBACK_DAYS (shell side)

Pre-this-commit README only mentioned INTERVAL. Operator running
`grep THREADS_WATCHER_ projects/threads-watcher/README.md` got 1
hit out of 8. Runbook-driven incident response had no central
reference — operator had to grep the source themselves.

This test pins the bidirectional contract:
  - Every THREADS_WATCHER_* env var read by code MUST appear in
    the README env vars table (else operator can't discover it).
  - Every env var listed in the README MUST exist in code (else
    operator runbook hallucinates a knob that does nothing).

Catches drift in both directions at PR time, so the README stays
trustworthy as the operator runbook.
"""

from __future__ import annotations

import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
README = PROJECT_ROOT / "README.md"


# ── Source scan ────────────────────────────────────────────────────────


# Match any reference to a THREADS_WATCHER_* var:
#   - Python: "THREADS_WATCHER_HEARTBEAT_SEC" string literal
#     (covers ENV_HEARTBEAT_SEC = "..." pattern + direct
#      os.environ.get("...") calls)
#   - Shell: ${THREADS_WATCHER_INTERVAL:-60} / -n "${THREADS_WATCHER_*}"
_ENV_NAME_RE = re.compile(r"THREADS_WATCHER_[A-Z_]+")

# Files NOT to scan — test fixtures, output logs, this test itself.
_SKIP_PATH_PARTS = {
    "tests",         # test files mention env vars in assertions
    ".venv", "venv", # virtualenvs
    "logs",          # runtime output
    "node_modules",
    ".pytest_cache",
    "__pycache__",
    "threads-watcher-status",  # static dashboard / state files
}


def _is_source_file(path: Path) -> bool:
    """Production source: top-level .py + launchd-managed shell.
    Exclude tests, output, vendor. Matches the same scope as the
    pre-commit hook's threads-watcher pattern."""
    if any(part in _SKIP_PATH_PARTS for part in path.parts):
        return False
    return path.suffix in {".py", ".sh"}


def _scan_source_for_env_names() -> set[str]:
    """Walk every production source file, regex-extract all
    THREADS_WATCHER_* names. Returns the unique set."""
    found: set[str] = set()
    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file() or not _is_source_file(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for match in _ENV_NAME_RE.findall(text):
            found.add(match)
    return found


# ── README scan ────────────────────────────────────────────────────────


def _scan_readme_for_env_names() -> set[str]:
    """Extract every THREADS_WATCHER_* mentioned in the README.
    Markdown table cells, code blocks, prose — all sources count
    (the operator might find the var in any of those)."""
    text = README.read_text(encoding="utf-8")
    return set(_ENV_NAME_RE.findall(text))


# ── Tests ──────────────────────────────────────────────────────────────


def test_every_code_referenced_env_var_is_documented_in_readme():
    # 🔒 The headline pin: a new env var lands in code → must also
    # land in README before commit. Caught at PR time, before
    # operator hits the undocumented knob.
    in_code = _scan_source_for_env_names()
    in_readme = _scan_readme_for_env_names()
    missing = in_code - in_readme
    assert not missing, (
        f"{len(missing)} env var(s) read by code but not documented "
        f"in README.md:\n  " + "\n  ".join(sorted(missing)) + "\n\n"
        f"Add a row to the 'env vars' table in README.md describing "
        f"each one (default, range, what it controls, source file). "
        f"This test pins the operator-runbook discoverability contract."
    )


def test_every_readme_env_var_is_actually_used_in_code():
    # 🔒 Inverse direction: README hallucination. If the README
    # promises a knob that no code actually reads, the operator
    # sets it, expects behaviour, gets nothing.
    in_code = _scan_source_for_env_names()
    in_readme = _scan_readme_for_env_names()
    stale = in_readme - in_code
    assert not stale, (
        f"{len(stale)} env var(s) documented in README.md but no "
        f"longer referenced in code:\n  " + "\n  ".join(sorted(stale)) + "\n\n"
        f"Either restore the code reference (the env was supposed "
        f"to do something) or remove the row from README.md (the "
        f"env was renamed/removed). README must not promise dead knobs."
    )


def test_minimum_known_env_set_present():
    # Sanity: belt-and-braces that the scan isn't broken. We KNOW
    # at least these 4 should exist at the time this test ships —
    # if zero of them surface, _scan_source_for_env_names is broken.
    in_code = _scan_source_for_env_names()
    known = {
        "THREADS_WATCHER_INTERVAL",
        "THREADS_WATCHER_HEARTBEAT_SEC",
        "THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA",
        "THREADS_WATCHER_DISCORD_WEBHOOK_URL",
    }
    missing_from_scan = known - in_code
    assert not missing_from_scan, (
        f"Source-scan helper is broken — known env vars not found:\n  "
        + "\n  ".join(sorted(missing_from_scan))
    )


def test_readme_env_table_exists_with_anchor():
    # Cheap doc-shape sanity: the section header survives. Catches
    # a refactor that accidentally splits the table apart so
    # operators can't find it via Ctrl-F on "環境変数".
    text = README.read_text(encoding="utf-8")
    assert "## 環境変数" in text, (
        "README.md missing the '## 環境変数' section header. "
        "Operators discover the env-var table by scanning section "
        "headings — this is the entry point."
    )


# ── CLI tool documentation parity ──────────────────────────────────────


# Match `prog="<name>.py"` in argparse.ArgumentParser declarations.
# We anchor on .py specifically so unrelated `prog=` strings (e.g.,
# nested helper functions) don't trip the scan.
_PROG_NAME_RE = re.compile(r'prog\s*=\s*"([a-z_]+\.py)"')


def _scan_source_for_prog_names() -> set[str]:
    """Walk every top-level *.py in the project and extract any
    argparse.ArgumentParser `prog=` declarations. Returns the set
    of CLI tool names operator-facing today."""
    found: set[str] = set()
    for path in PROJECT_ROOT.glob("*.py"):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for match in _PROG_NAME_RE.findall(text):
            found.add(match)
    return found


class TestCliToolsDocumented:
    """README ↔ source consistency for operator-facing CLI tools.
    Each *.py with an explicit argparse `prog="<name>.py"` declaration
    MUST be mentioned in README.md so operators can discover it via
    a Ctrl-F scan. Same bidirectional shape as env-var docs (commit
    99d373f)."""

    def test_every_cli_tool_with_prog_is_documented_in_readme(self):
        # 🔒 Headline pin: new operator CLI lands in code → must be
        # named in README before commit. Catches "shipped a tool
        # but operator can't find it" hazard at PR time.
        in_code = _scan_source_for_prog_names()
        readme_text = README.read_text(encoding="utf-8")
        missing = [name for name in in_code if name not in readme_text]
        assert not missing, (
            f"{len(missing)} CLI tool(s) declared via argparse prog= "
            f"but not mentioned in README.md:\n  " +
            "\n  ".join(sorted(missing)) + "\n\n"
            f"Add a row to the 'オペレーター CLI ツール' table in "
            f"README.md describing each one (one-line description, "
            f"key flags, commit-of-origin). This test pins the "
            f"operator-runbook discoverability contract."
        )

    def test_cli_tools_section_anchor_exists(self):
        # Operator entry point — Ctrl-F on "CLI ツール" must land.
        text = README.read_text(encoding="utf-8")
        assert "## オペレーター CLI ツール" in text, (
            "README.md missing the '## オペレーター CLI ツール' "
            "section header. Without it, operators can't navigate "
            "from a vague 'what CLI tools are available?' question "
            "to the actual inventory."
        )

    def test_minimum_known_cli_set_present(self):
        # Sanity: catch a regression that makes _scan_source_for_prog_names
        # return empty (e.g., regex breakage). The 5 tools below all
        # ship today; if any disappears from the scan, fix the
        # scanner OR remove the tool deliberately.
        in_code = _scan_source_for_prog_names()
        known = {
            "discord_payload.py", "discord_post.py", "mttr.py",
            "status.py", "sticky_regime_diagnosis.py",
        }
        missing_from_scan = known - in_code
        assert not missing_from_scan, (
            f"Source scanner is broken — known CLI tools not "
            f"detected:\n  " + "\n  ".join(sorted(missing_from_scan))
        )


# ── plist template documentation parity ──────────────────────────────


def _scan_for_plist_templates() -> set[str]:
    """Return the set of `.plist.example` filenames in the project root.
    These are operator-install templates that ship with the repo and
    require Yakon approval before going live in ~/Library/LaunchAgents."""
    return {p.name for p in PROJECT_ROOT.glob("*.plist.example")}


class TestPlistTemplatesDocumented:
    """README ↔ source consistency for operator-install plist templates.
    Each `.plist.example` MUST be mentioned in README.md so operators
    can discover via Ctrl-F. Same bidirectional shape as env-var docs
    (commit 99d373f) and CLI tool docs (commit 833c094)."""

    def test_every_plist_template_is_mentioned_in_readme(self):
        # 🔒 Headline: new plist template lands → must be named in
        # README before commit. Caught at PR time vs operator
        # tribal-knowledge discovery later.
        in_repo = _scan_for_plist_templates()
        readme_text = README.read_text(encoding="utf-8")
        # Look for the template stem WITHOUT `.example` (operator
        # workflow refers to the live plist name, e.g.,
        # "com.shiro.threads-watcher-backup.plist", not ".plist.example").
        missing = [
            tmpl for tmpl in in_repo
            if tmpl not in readme_text and tmpl.replace(".example", "") not in readme_text
        ]
        assert not missing, (
            f"{len(missing)} plist template(s) ship in repo but not "
            f"mentioned in README.md:\n  " +
            "\n  ".join(sorted(missing)) + "\n\n"
            f"Add an install workflow section (cp → preflight → "
            f"launchctl load → verify) for each, matching the pattern "
            f"in the 'Discord webhook 自動 POST セットアップ' section. "
            f"Operator runbook discoverability — operator can't install "
            f"a template they can't find in README."
        )

    def test_minimum_known_plist_templates_present(self):
        # Sanity: catch regression in glob scan (e.g., template renamed
        # and we lose track of all installers).
        in_repo = _scan_for_plist_templates()
        known = {
            "com.shiro.threads-watcher-backup.plist.example",
            "com.shiro.threads-watcher-discord-post.plist.example",
            "com.shiro.threads-watcher-sticky-regime-alert.plist.example",
            "com.shiro.threads-watcher-sticky-alert-discord.plist.example",
            "com.shiro.threads-watcher-sync.plist.example",
        }
        missing_from_scan = known - in_repo
        assert not missing_from_scan, (
            f"Scanner missing known plist templates:\n  " +
            "\n  ".join(sorted(missing_from_scan))
        )


# ── threads-watcher shell helper documentation parity ─────────────────


# Shell helpers in qa-reports/ that are specifically threads-watcher
# operator workflow. Pinned list (not auto-scan) because qa-reports/
# also hosts workspace-wide helpers (install-hook.sh, ops-monitor.sh)
# that aren't this project's responsibility to document.
THREADS_WATCHER_SHELL_HELPERS = [
    "qa-reports/preflight-plist.sh",
    "qa-reports/sticky-alert-to-discord.sh",
]


class TestThreadsWatcherShellHelpersDocumented:
    """README ↔ source consistency for the qa-reports/ shell helpers
    that operator runs as part of the threads-watcher install /
    operation workflow. Closes the third-dimension discoverability
    gap (env vars + CLI tools + plist templates were covered, shell
    helpers were not).

    Pinned list (not auto-scan) so workspace-level helpers irrelevant
    to threads-watcher (install-hook.sh, ops-monitor.sh) don't
    falsely require documentation here. Adding a new threads-watcher-
    relevant helper to qa-reports/ requires extending this list +
    adding a README mention — that's the deliberate gating intent."""

    def test_every_pinned_shell_helper_exists(self):
        # 🔒 Typo guard for the pinned list. If a helper got renamed
        # or removed, fix the list deliberately rather than letting
        # the documentation check silently false-positive.
        REPO_ROOT = README.resolve().parent.parent.parent
        for relpath in THREADS_WATCHER_SHELL_HELPERS:
            path = REPO_ROOT / relpath
            assert path.is_file(), (
                f"Pinned shell helper {relpath} doesn't exist at {path}. "
                f"Either fix the list in this test OR restore the file."
            )

    def test_every_pinned_shell_helper_mentioned_in_readme(self):
        # 🔒 Headline: shell helper exists in repo → must appear in
        # threads-watcher README so operator can discover via Ctrl-F.
        readme_text = README.read_text(encoding="utf-8")
        missing = [
            relpath for relpath in THREADS_WATCHER_SHELL_HELPERS
            if relpath not in readme_text
        ]
        assert not missing, (
            f"{len(missing)} threads-watcher shell helper(s) ship in "
            f"qa-reports/ but not mentioned in README.md:\n  " +
            "\n  ".join(sorted(missing)) + "\n\n"
            f"Add a usage example to the relevant install runbook "
            f"section in README.md (matching the discord-post / "
            f"sticky-regime-alert preflight pattern). Without this, "
            f"operator can't discover the helper from README alone."
        )