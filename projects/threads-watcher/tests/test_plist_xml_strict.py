"""Strict-XML lint over every .plist / .plist.example in the project.

macOS `plutil -lint` is permissive — it accepts XML comments
containing `--` (illegal per XML §2.5) and a few other malformations
that strict parsers reject. Python's `plistlib.loads` (using expat)
is strict. The two-parser asymmetry is precisely how
`com.shiro.threads-watcher-auto-restart.plist` shipped with a
silent latent bug: plutil approved it for ~6 weeks, but any
operator tool (a Python config validator, an editor's plist
preview, a future python-based plist diff) would have crashed on
load.

This lint asserts every plist file parses under the strict parser.
Catches the next time someone adds a CLI flag like `--health-check`
to a header comment — common because operators document the script
behavior right next to the launchd entry that runs it.

Sister contracts in test_backup_plist_template.py pin the per-key
shape of the backup-specific entry. This file is per-file structural
only: parses-as-XML and is a dict at the top level. The two are
intentionally split so a per-key contract failure can't crowd out
the simpler "is this even XML" signal.
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _discover_plists() -> list[Path]:
    """Both real plists and .example templates count — the templates
    are operator-facing source that gets `cp`-ed into LaunchAgents/."""
    return sorted(
        list(PROJECT_ROOT.glob("*.plist"))
        + list(PROJECT_ROOT.glob("*.plist.example"))
    )


PLIST_FILES = _discover_plists()


def test_plist_inventory_is_non_empty() -> None:
    # Catches a refactor that moves the plists into a subdirectory
    # without updating this lint — would silently pass with no files
    # to check otherwise.
    assert len(PLIST_FILES) > 0, (
        f"No .plist files found at {PROJECT_ROOT}. Did the layout change?"
    )


@pytest.mark.parametrize("path", PLIST_FILES, ids=lambda p: p.name)
def test_parses_under_strict_xml_expat(path: Path) -> None:
    # The actual lint. If this raises ExpatError, the message points
    # at line:column of the offense (typically `--` in a comment, but
    # also catches unclosed tags, wrong entity escapes, etc. that
    # plutil sometimes silently fixes).
    try:
        data = plistlib.loads(path.read_bytes())
    except Exception as e:  # noqa: BLE001 — surfacing parser detail is the point
        raise AssertionError(
            f"{path.name} fails strict XML parsing: {type(e).__name__}: {e}\n"
            f"Common cause: a CLI flag like `--health-check` inside an XML "
            f"header comment. Per XML §2.5, the byte sequence '--' is illegal "
            f"inside `<!-- -->`. Convention in this project: write it spaced "
            f"as `- -health-check` in comments (the active <string>--flag</string> "
            f"in ProgramArguments is fine — XML only restricts comments)."
        ) from e
    # Plist root must be a dict (launchd contract).
    assert isinstance(data, dict), (
        f"{path.name} parsed as {type(data).__name__}, expected dict (launchd plist top-level)"
    )


@pytest.mark.parametrize("path", PLIST_FILES, ids=lambda p: p.name)
def test_has_label_key_matching_filename(path: Path) -> None:
    # launchd convention: the Label string is what `launchctl list`
    # shows. Pinning Label == filename-stem catches the copy-paste
    # regression where someone duplicates one plist into another and
    # forgets to update Label, which would silently shadow the
    # original in launchctl's per-Label state table.
    data = plistlib.loads(path.read_bytes())
    assert "Label" in data, f"{path.name} missing Label key"
    expected = path.name.removesuffix(".example").removesuffix(".plist")
    assert data["Label"] == expected, (
        f"{path.name}: Label='{data['Label']}' but filename stem is '{expected}'"
    )
