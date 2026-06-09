"""Sync Gmail → SQLite pipeline."""

import json
import sys
from pathlib import Path

from . import db as db_module
from .gmail_client import build_service, iter_threads
from .summarizer import summarize_thread, summarize_message


def run_sync(max_threads: int = 100, skip_summary: bool = False, db_path: Path = None):
    """
    Main sync pipeline:
    1. Fetch threads from Gmail
    2. Save to SQLite
    3. Generate Gemini summaries (unless skip_summary)
    """
    if db_path is None:
        db_path = db_module.DB_PATH

    db_module.init_db(db_path)

    print(f"Gmail に接続中...")
    service = build_service()

    print(f"最大 {max_threads} スレッドを取得します...")
    saved_threads = 0
    saved_messages = 0

    for i, data in enumerate(iter_threads(service, max_results=max_threads)):
        thread = data["thread"]
        messages = data["messages"]

        if thread is None:
            continue

        with db_module.db_conn(db_path) as conn:
            # Check if already synced with summary
            existing = db_module.get_thread(conn, thread["thread_id"])
            if existing and existing["summary"]:
                print(f"  [{i+1}] スキップ (既存): {thread['subject'][:50]}")
                continue

            # Save thread
            db_module.upsert_thread(conn, thread)

            # Save messages and attachments
            for msg in messages:
                atts = msg.pop("_attachments", [])
                db_module.upsert_message(conn, msg)
                for att in atts:
                    db_module.insert_attachment(conn, {
                        "message_id": msg["message_id"],
                        "filename": att["filename"],
                        "mime_type": att["mime_type"],
                        "size_bytes": att["size_bytes"],
                        "saved_path": None,
                    })

            saved_threads += 1
            saved_messages += len(messages)

        print(f"  [{i+1}] 保存: {thread['subject'][:50]} ({len(messages)}通)")

        if not skip_summary:
            _summarize_and_save(thread, messages, db_path)

    print(f"\n完了: {saved_threads} スレッド, {saved_messages} メッセージを保存しました。")


def _summarize_and_save(thread: dict, messages: list[dict], db_path: Path):
    thread_summary = summarize_thread(messages, subject=thread.get("subject", ""))
    with db_module.db_conn(db_path) as conn:
        db_module.update_thread_summary(conn, thread["thread_id"], thread_summary)
        for msg in messages:
            if msg.get("body_text") and not msg.get("summary"):
                summary = summarize_message(
                    msg["body_text"],
                    subject=msg.get("subject", ""),
                    sender=msg.get("sender", ""),
                )
                db_module.update_message_summary(conn, msg["message_id"], summary)
    print(f"    → 要約完了")


def run_summarize_pending(db_path: Path = None):
    """Re-run summarization for threads that have no summary yet."""
    if db_path is None:
        db_path = db_module.DB_PATH

    with db_module.db_conn(db_path) as conn:
        threads = conn.execute(
            "SELECT * FROM threads WHERE summary IS NULL ORDER BY last_date DESC"
        ).fetchall()

    print(f"要約未完了のスレッド: {len(threads)} 件")
    for t in threads:
        with db_module.db_conn(db_path) as conn:
            messages = db_module.get_messages_for_thread(conn, t["thread_id"])
        _summarize_and_save(dict(t), [dict(m) for m in messages], db_path)
