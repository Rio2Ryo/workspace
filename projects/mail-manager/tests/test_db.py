"""Tests for src/db.py — no credentials or network required."""

import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

# Run from project root: python -m unittest tests.test_db
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from src import db as db_module


def _make_db() -> Path:
    """Return a fresh temp DB path (caller must unlink)."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    p = Path(path)
    db_module.init_db(db_path=p)
    return p


def _thread(thread_id="t1", subject="Test thread") -> dict:
    return {
        "thread_id": thread_id,
        "subject": subject,
        "participants": json.dumps(["a@example.com", "b@example.com"]),
        "first_date": "2026-01-01T00:00:00+00:00",
        "last_date": "2026-01-02T00:00:00+00:00",
        "message_count": 2,
        "summary": None,
        "theme": None,
        "importance": None,
        "labels": json.dumps([]),
        "synced_at": "2026-01-02T00:00:00+00:00",
    }


def _message(message_id="m1", thread_id="t1", body_text="Hello world") -> dict:
    return {
        "message_id": message_id,
        "thread_id": thread_id,
        "subject": "Test thread",
        "sender": "a@example.com",
        "recipients": json.dumps(["b@example.com"]),
        "date": "2026-01-01T10:00:00+00:00",
        "body_text": body_text,
        "body_html": "",
        "summary": None,
        "is_sent": 0,
        "synced_at": "2026-01-02T00:00:00+00:00",
    }


class TestDbInit(unittest.TestCase):
    def test_tables_created(self):
        db = _make_db()
        try:
            with db_module.db_conn(db) as conn:
                rows = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
                names = {r["name"] for r in rows}
            self.assertIn("threads", names)
            self.assertIn("messages", names)
            self.assertIn("attachments", names)
            self.assertIn("messages_fts", names)
        finally:
            db.unlink()

    def test_init_idempotent(self):
        db = _make_db()
        try:
            db_module.init_db(db_path=db)  # second call must not raise
        finally:
            db.unlink()


class TestThreadCrud(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()

    def tearDown(self):
        self.db.unlink()

    def test_upsert_and_get(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread())
        with db_module.db_conn(self.db) as conn:
            row = db_module.get_thread(conn, "t1")
        self.assertIsNotNone(row)
        self.assertEqual(row["subject"], "Test thread")

    def test_get_missing_returns_none(self):
        with db_module.db_conn(self.db) as conn:
            row = db_module.get_thread(conn, "nonexistent")
        self.assertIsNone(row)

    def test_upsert_updates_last_date(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread())
        updated = _thread()
        updated["last_date"] = "2026-06-01T00:00:00+00:00"
        updated["message_count"] = 5
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, updated)
        with db_module.db_conn(self.db) as conn:
            row = db_module.get_thread(conn, "t1")
        self.assertEqual(row["last_date"], "2026-06-01T00:00:00+00:00")
        self.assertEqual(row["message_count"], 5)

    def test_update_summary(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread())
            db_module.update_thread_summary(conn, "t1", "summary text")
        with db_module.db_conn(self.db) as conn:
            row = db_module.get_thread(conn, "t1")
        self.assertEqual(row["summary"], "summary text")

    def test_list_threads_order(self):
        with db_module.db_conn(self.db) as conn:
            t_old = _thread("t_old", "Old")
            t_old["last_date"] = "2026-01-01T00:00:00+00:00"
            db_module.upsert_thread(conn, t_old)
            t_new = _thread("t_new", "New")
            t_new["last_date"] = "2026-06-01T00:00:00+00:00"
            db_module.upsert_thread(conn, t_new)
        with db_module.db_conn(self.db) as conn:
            rows = db_module.list_threads(conn, limit=10)
        self.assertEqual(rows[0]["thread_id"], "t_new")
        self.assertEqual(rows[1]["thread_id"], "t_old")

    def test_list_threads_limit(self):
        with db_module.db_conn(self.db) as conn:
            for i in range(5):
                db_module.upsert_thread(conn, _thread(f"t{i}", f"Subject {i}"))
        with db_module.db_conn(self.db) as conn:
            rows = db_module.list_threads(conn, limit=3)
        self.assertEqual(len(rows), 3)


class TestMessageCrud(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread())

    def tearDown(self):
        self.db.unlink()

    def test_upsert_and_get(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_message(conn, _message())
        with db_module.db_conn(self.db) as conn:
            msgs = db_module.get_messages_for_thread(conn, "t1")
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["sender"], "a@example.com")

    def test_upsert_message_deduplication(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_message(conn, _message())
            db_module.upsert_message(conn, _message())  # duplicate
        with db_module.db_conn(self.db) as conn:
            msgs = db_module.get_messages_for_thread(conn, "t1")
        self.assertEqual(len(msgs), 1)

    def test_update_message_summary(self):
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_message(conn, _message())
            db_module.update_message_summary(conn, "m1", "msg summary")
        with db_module.db_conn(self.db) as conn:
            msgs = db_module.get_messages_for_thread(conn, "t1")
        self.assertEqual(msgs[0]["summary"], "msg summary")

    def test_messages_ordered_by_date(self):
        with db_module.db_conn(self.db) as conn:
            m2 = _message("m2", body_text="Second")
            m2["date"] = "2026-01-02T10:00:00+00:00"
            db_module.upsert_message(conn, _message())
            db_module.upsert_message(conn, m2)
        with db_module.db_conn(self.db) as conn:
            msgs = db_module.get_messages_for_thread(conn, "t1")
        self.assertEqual(msgs[0]["message_id"], "m1")
        self.assertEqual(msgs[1]["message_id"], "m2")


class TestAttachments(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread())
            db_module.upsert_message(conn, _message())

    def tearDown(self):
        self.db.unlink()

    def test_insert_and_get(self):
        att = {
            "message_id": "m1",
            "filename": "report.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 12345,
            "saved_path": None,
        }
        with db_module.db_conn(self.db) as conn:
            db_module.insert_attachment(conn, att)
        with db_module.db_conn(self.db) as conn:
            atts = db_module.get_attachments_for_message(conn, "m1")
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0]["filename"], "report.pdf")
        self.assertEqual(atts[0]["size_bytes"], 12345)

    def test_no_attachments_returns_empty(self):
        with db_module.db_conn(self.db) as conn:
            atts = db_module.get_attachments_for_message(conn, "m1")
        self.assertEqual(list(atts), [])


class TestFtsSearch(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        with db_module.db_conn(self.db) as conn:
            db_module.upsert_thread(conn, _thread("t1", "契約書について"))
            db_module.upsert_message(conn, _message("m1", "t1", "先日の契約書を確認しました"))
            db_module.upsert_thread(conn, _thread("t2", "無関係なスレッド"))
            db_module.upsert_message(conn, _message("m2", "t2", "全然関係ない内容です"))

    def tearDown(self):
        self.db.unlink()

    def test_search_threads_hit(self):
        with db_module.db_conn(self.db) as conn:
            results = db_module.search_threads(conn, "契約書")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["thread_id"], "t1")

    def test_search_threads_no_hit(self):
        with db_module.db_conn(self.db) as conn:
            results = db_module.search_threads(conn, "存在しないキーワード")
        self.assertEqual(len(results), 0)

    def test_search_messages_hit(self):
        with db_module.db_conn(self.db) as conn:
            results = db_module.search_messages(conn, "契約書")
        self.assertGreater(len(results), 0)
        thread_ids = {r["thread_id"] for r in results}
        self.assertIn("t1", thread_ids)


if __name__ == "__main__":
    unittest.main()
