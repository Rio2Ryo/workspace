#!/usr/bin/env python3
"""
mail-manager CLI

Usage:
  python main.py sync [--max N] [--no-summary]
  python main.py search <query> [--limit N]
  python main.py show <thread_id>
  python main.py list [--limit N]
  python main.py summarize-pending
"""

import argparse
import json
import sys
from pathlib import Path

# Allow running as `python main.py` from project root
sys.path.insert(0, str(Path(__file__).parent))

from src import db as db_module
from src.sync import run_sync, run_summarize_pending


def cmd_sync(args):
    run_sync(max_threads=args.max, skip_summary=args.no_summary)


def cmd_search(args):
    db_module.init_db()
    with db_module.db_conn() as conn:
        results = db_module.search_threads(conn, args.query, limit=args.limit)

    if not results:
        print(f"「{args.query}」に一致するスレッドは見つかりませんでした。")
        return

    print(f"\n検索結果: 「{args.query}」 — {len(results)} 件\n")
    for r in results:
        print(f"{'─'*60}")
        print(f"件名  : {r['subject']}")
        print(f"最終日: {r['last_date'][:10] if r['last_date'] else '-'}")
        print(f"通数  : {r['message_count']}")
        if r['summary']:
            # Show first 200 chars of summary
            print(f"要約  : {r['summary'][:200]}...")
        print(f"ID    : {r['thread_id']}")
    print(f"\n詳細: python main.py show <thread_id>")


def cmd_show(args):
    db_module.init_db()
    with db_module.db_conn() as conn:
        thread = db_module.get_thread(conn, args.thread_id)
        if not thread:
            print(f"スレッドが見つかりません: {args.thread_id}")
            return
        messages = db_module.get_messages_for_thread(conn, args.thread_id)
        all_atts = []
        for m in messages:
            atts = db_module.get_attachments_for_message(conn, m["message_id"])
            all_atts.extend(atts)

    print(f"\n{'='*60}")
    print(f"件名: {thread['subject']}")
    print(f"期間: {thread['first_date'][:10] if thread['first_date'] else '-'} ～ {thread['last_date'][:10] if thread['last_date'] else '-'}")
    print(f"通数: {thread['message_count']}")
    try:
        participants = json.loads(thread['participants'] or '[]')
        print(f"参加者: {', '.join(participants[:5])}")
    except Exception:
        pass
    print(f"\n【スレッド要約】")
    print(thread['summary'] or "(未要約)")

    if all_atts:
        print(f"\n【添付ファイル ({len(all_atts)}件)】")
        for att in all_atts:
            size_kb = (att['size_bytes'] or 0) // 1024
            print(f"  - {att['filename']}  ({att['mime_type']}, {size_kb}KB)")

    print(f"\n{'─'*60}")
    print(f"メッセージ一覧:")
    for i, m in enumerate(messages, 1):
        direction = "↑送信" if m['is_sent'] else "↓受信"
        print(f"\n  [{i}] {direction} {m['date'][:16] if m['date'] else '-'} / {m['sender'][:40]}")
        if m['summary']:
            print(f"       {m['summary'][:150]}")


def cmd_list(args):
    db_module.init_db()
    with db_module.db_conn() as conn:
        threads = db_module.list_threads(conn, limit=args.limit)

    print(f"\nスレッド一覧 (新しい順, {len(threads)}件)\n")
    for t in threads:
        summary_flag = "✓" if t['summary'] else "○"
        print(f"{summary_flag} {t['last_date'][:10] if t['last_date'] else '-':10}  "
              f"{t['message_count']:3}通  {t['subject'][:50]}")
        print(f"    ID: {t['thread_id']}")


def cmd_summarize_pending(args):
    run_summarize_pending()


def main():
    parser = argparse.ArgumentParser(description="mail-manager CLI")
    subs = parser.add_subparsers(dest="command", required=True)

    # sync
    p_sync = subs.add_parser("sync", help="Gmail からメールを同期")
    p_sync.add_argument("--max", type=int, default=100, metavar="N", help="取得スレッド数上限 (default: 100)")
    p_sync.add_argument("--no-summary", action="store_true", help="Gemini 要約をスキップ")
    p_sync.set_defaults(func=cmd_sync)

    # search
    p_search = subs.add_parser("search", help="キーワード検索")
    p_search.add_argument("query", help="検索ワード")
    p_search.add_argument("--limit", type=int, default=20)
    p_search.set_defaults(func=cmd_search)

    # show
    p_show = subs.add_parser("show", help="スレッド詳細表示")
    p_show.add_argument("thread_id")
    p_show.set_defaults(func=cmd_show)

    # list
    p_list = subs.add_parser("list", help="スレッド一覧")
    p_list.add_argument("--limit", type=int, default=30)
    p_list.set_defaults(func=cmd_list)

    # summarize-pending
    p_sum = subs.add_parser("summarize-pending", help="未要約スレッドをまとめて要約")
    p_sum.set_defaults(func=cmd_summarize_pending)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
