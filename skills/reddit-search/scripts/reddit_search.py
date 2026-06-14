#!/usr/bin/env python3
"""Lightweight Reddit public JSON search.

Examples:
  python3 reddit_search.py "openclaw" --limit 10
  python3 reddit_search.py "claude code" --subreddit LocalLLaMA --sort new --time month --json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

USER_AGENT = "OpenClawRedditSearch/0.1 (research utility; contact: local-user)"


def build_url(query: str, subreddit: str | None, sort: str, time_filter: str, limit: int) -> str:
    base = "https://www.reddit.com"
    path = f"/r/{subreddit.strip('/').replace('r/', '')}/search.json" if subreddit else "/search.json"
    params = {
        "q": query,
        "sort": sort,
        "t": time_filter,
        "limit": str(max(1, min(limit, 100))),
        "raw_json": "1",
    }
    if subreddit:
        params["restrict_sr"] = "1"
    return f"{base}{path}?{urllib.parse.urlencode(params)}"


def fetch_json(url: str, timeout: int) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return json.loads(resp.read().decode(charset, errors="replace"))
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read(500).decode("utf-8", errors="replace")
        if status == 429:
            raise SystemExit(json.dumps({"status": "rate_limited", "http_status": status, "message": body}, ensure_ascii=False))
        if status in (401, 403, 451):
            raise SystemExit(json.dumps({"status": "blocked", "http_status": status, "message": body}, ensure_ascii=False))
        raise SystemExit(json.dumps({"status": "error", "http_status": status, "message": body}, ensure_ascii=False))
    except Exception as e:
        raise SystemExit(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def normalize_listing(data: dict[str, Any]) -> list[dict[str, Any]]:
    children = data.get("data", {}).get("children", [])
    results = []
    for child in children:
        p = child.get("data", {})
        if not p or p.get("stickied"):
            continue
        permalink = p.get("permalink") or ""
        results.append({
            "title": p.get("title"),
            "subreddit": p.get("subreddit_name_prefixed") or ("r/" + p.get("subreddit", "")),
            "author": p.get("author"),
            "score": p.get("score"),
            "comments": p.get("num_comments"),
            "created_utc": p.get("created_utc"),
            "created_iso": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(p.get("created_utc", 0))) if p.get("created_utc") else None,
            "url": "https://www.reddit.com" + permalink if permalink.startswith("/") else p.get("url"),
            "selftext_preview": (p.get("selftext") or "").replace("\n", " ")[:280],
        })
    return results


def print_markdown(results: list[dict[str, Any]], meta: dict[str, Any]) -> None:
    print(f"Reddit search: `{meta['query']}`")
    if meta.get("subreddit"):
        print(f"Subreddit: r/{meta['subreddit']}")
    print(f"Sort/time: {meta['sort']} / {meta['time']}")
    print(f"Results: {len(results)}\n")
    for i, r in enumerate(results, 1):
        print(f"{i}. [{r['title']}]({r['url']})")
        print(f"   {r['subreddit']} · score {r['score']} · comments {r['comments']} · {r['created_iso']}")
        if r.get("selftext_preview"):
            print(f"   {r['selftext_preview']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Search Reddit public JSON endpoints")
    parser.add_argument("query")
    parser.add_argument("--subreddit", "-r")
    parser.add_argument("--sort", choices=["relevance", "new", "top", "comments"], default="relevance")
    parser.add_argument("--time", choices=["hour", "day", "week", "month", "year", "all"], default="month")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of markdown")
    args = parser.parse_args()

    url = build_url(args.query, args.subreddit, args.sort, args.time, args.limit)
    data = fetch_json(url, args.timeout)
    results = normalize_listing(data)
    payload = {
        "status": "ok",
        "query": args.query,
        "subreddit": args.subreddit,
        "sort": args.sort,
        "time": args.time,
        "url": url,
        "count": len(results),
        "results": results,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print_markdown(results, payload)


if __name__ == "__main__":
    main()
