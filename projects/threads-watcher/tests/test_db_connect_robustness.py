"""Pin db.connect() against the str-vs-Path AttributeError class.

Background: production callers all pass `Path`, but `connect("foo.db")`
(a plain str) used to raise `AttributeError: 'str' object has no
attribute 'parent'`. Caught during interactive debugging on
2026-05-18. The fix is a one-line coerce; these tests lock that the
function accepts EITHER type and produces an equivalent connection
state."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db  # noqa: E402


class TestConnectAcceptsBothTypes:
    def test_path_input_still_works(self, tmp_path: Path):
        """Existing-behaviour pin: Path input must keep working."""
        db_path = tmp_path / "subdir" / "from_path.db"
        conn = connect(db_path)
        try:
            init_db(conn)
            assert (tmp_path / "subdir").is_dir()  # parent created
            assert db_path.exists()
        finally:
            conn.close()

    def test_str_input_no_longer_raises(self, tmp_path: Path):
        """REGRESSION GUARD: str input previously raised AttributeError
        on `.parent`. Must now succeed equivalently to Path."""
        db_path_str = str(tmp_path / "from_str.db")
        conn = connect(db_path_str)
        try:
            init_db(conn)
            assert Path(db_path_str).exists()
            # And it's a real sqlite conn with our schema.
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='checks'"
            ).fetchone()
            assert row is not None
        finally:
            conn.close()

    def test_str_input_creates_parent_directory(self, tmp_path: Path):
        """The parent-mkdir branch must fire for str too — caller
        shouldn't have to mkdir manually for nested paths."""
        nested = str(tmp_path / "deep" / "nested" / "db.sqlite")
        conn = connect(nested)
        try:
            assert (tmp_path / "deep" / "nested").is_dir()
        finally:
            conn.close()

    def test_str_and_path_produce_equivalent_state(self, tmp_path: Path):
        """Two connections from the same path opened with different
        types should see the same data — proves coercion is total."""
        p = tmp_path / "equiv.db"
        conn_path = connect(p)
        try:
            init_db(conn_path)
            conn_path.execute(
                "INSERT INTO checks (handle, checked_at, found_count, new_count, status) "
                "VALUES (?, ?, ?, ?, ?)",
                ("@a", "2026-05-18T00:00:00Z", 1, 1, "ok"),
            )
            conn_path.commit()
        finally:
            conn_path.close()

        conn_str = connect(str(p))
        try:
            count = conn_str.execute("SELECT COUNT(*) FROM checks").fetchone()[0]
            assert count == 1
        finally:
            conn_str.close()
