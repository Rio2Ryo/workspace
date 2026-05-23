"""Meta-test: pin the conftest.py shim that hides
watcher.py-importing test files when playwright is missing.

Without this meta-test, a future refactor that:
  - splits a NEW test file out of test_cli_args.py without adding
    it to _WATCHER_IMPORTING_TESTS would silently fail collection
    in the .venv workflow
  - adds playwright to .venv but forgets to delete the shim — would
    silently SKIP files that should now run
  - mistypes a filename in _WATCHER_IMPORTING_TESTS — would silently
    NOT skip a file that needs skipping

would slip past the basic `pytest` run and be invisible until the
specific file was targeted manually.
"""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _read_skiplist() -> list[str]:
    """Read `_WATCHER_IMPORTING_TESTS` from conftest.py without
    importing the module (pytest's conftest auto-load doesn't make
    it accessible as a plain `import conftest`, and the import
    chain would re-trigger the playwright check we're testing
    around). Parses the literal list via AST so the test stays
    valid regardless of import semantics."""
    import ast

    src = (PROJECT_ROOT / "tests" / "conftest.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "_WATCHER_IMPORTING_TESTS":
                    if isinstance(node.value, ast.List):
                        return [
                            elt.value
                            for elt in node.value.elts
                            if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                        ]
    raise AssertionError(
        "_WATCHER_IMPORTING_TESTS literal list not found in conftest.py"
    )


def _is_watcher_importing(test_path: Path) -> bool:
    """A test file is "watcher-importing" iff it imports the
    heavyweight `watcher` module (which transitively imports
    playwright). MUST NOT match `watcher_pure`, `watcher_pure.X`,
    or any other watcher_* sibling — those don't depend on
    playwright. The word-boundary regex distinguishes them."""
    import re

    # Match: `import watcher` / `from watcher import` / `from watcher.X`.
    # The `\b` after `watcher` requires a non-word char (space, dot,
    # comma, end-of-line), so `watcher_pure` doesn't trip.
    pattern = re.compile(r"^\s*(?:import|from)\s+watcher\b(?!_)")
    src = test_path.read_text(encoding="utf-8")
    for line in src.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if pattern.match(line):
            return True
    return False


def test_skiplist_matches_actual_watcher_importers():
    # Walk every test file and check whether it imports watcher.
    # _WATCHER_IMPORTING_TESTS in conftest.py MUST equal that set.
    _WATCHER_IMPORTING_TESTS = _read_skiplist()

    tests_dir = PROJECT_ROOT / "tests"
    actual_importers = {
        p.name
        for p in tests_dir.glob("test_*.py")
        if _is_watcher_importing(p)
    }
    declared = set(_WATCHER_IMPORTING_TESTS)

    missing = actual_importers - declared
    extra = declared - actual_importers

    assert not missing, (
        f"Test file(s) {sorted(missing)} import watcher but are NOT in "
        f"_WATCHER_IMPORTING_TESTS. The .venv workflow would error at "
        f"collection. Add the filename(s) to conftest.py."
    )
    assert not extra, (
        f"_WATCHER_IMPORTING_TESTS contains {sorted(extra)} but no "
        f"such file imports watcher. The skiplist hides files that "
        f"should run — remove from conftest.py."
    )


def test_skiplist_is_non_empty_sanity():
    # Pin: today there are 10 watcher-importing test files (one for
    # each user-visible watcher.py code path). The skiplist must
    # never accidentally drop to empty (which would mean the shim
    # has no effect AND would mask any future incomplete refactor).
    _WATCHER_IMPORTING_TESTS = _read_skiplist()
    assert len(_WATCHER_IMPORTING_TESTS) >= 10, (
        f"_WATCHER_IMPORTING_TESTS has {len(_WATCHER_IMPORTING_TESTS)} "
        f"entries; expected >=10. If watcher.py was refactored to no "
        f"longer use playwright, delete conftest.py entirely instead "
        f"of leaving a hollow shim."
    )


def test_skiplist_entries_all_exist_on_disk():
    # Catches a typo (e.g., 'test_cli_arg.py' missing the 's').
    # A typo entry doesn't crash; it just doesn't skip what it
    # should — silent degradation.
    _WATCHER_IMPORTING_TESTS = _read_skiplist()
    tests_dir = PROJECT_ROOT / "tests"
    missing_on_disk = [
        name for name in _WATCHER_IMPORTING_TESTS
        if not (tests_dir / name).is_file()
    ]
    assert not missing_on_disk, (
        f"_WATCHER_IMPORTING_TESTS references files that don't exist: "
        f"{missing_on_disk}. Either fix the typo or remove the entry."
    )
