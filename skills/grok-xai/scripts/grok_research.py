#!/usr/bin/env python3
"""Minimal xAI Grok research helper.

Reads XAI_API_KEY from the environment and sends a single chat completion
request to xAI's OpenAI-compatible API.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API_URL = os.environ.get("XAI_API_URL", "https://api.x.ai/v1/chat/completions")
MODEL = os.environ.get("XAI_MODEL", "grok-4")

SYSTEM_PROMPT = """You are Grok, used for X/Twitter-oriented research.
Focus on public discourse, narratives, keywords, useful source leads, and uncertainty.
Distinguish verified facts from impressions. Do not invent citations.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Ask xAI Grok for a concise research brief.")
    parser.add_argument("prompt", nargs="+", help="Research question / topic")
    parser.add_argument("--model", default=MODEL, help="xAI model name; default from XAI_MODEL or grok-4")
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--max-tokens", type=int, default=1600)
    args = parser.parse_args()

    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        print("ERROR: XAI_API_KEY is not set. Set it in the environment; do not paste it into chat.", file=sys.stderr)
        return 2

    user_prompt = " ".join(args.prompt)
    payload = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
    }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {body}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    try:
        print(data["choices"][0]["message"]["content"].strip())
    except Exception:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
