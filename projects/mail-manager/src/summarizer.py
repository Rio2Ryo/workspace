"""Gemini-based summarizer for emails and threads."""

import os
import textwrap
import time

from google import genai

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
MAX_BODY_CHARS = 8000   # truncate long bodies before sending to Gemini
MAX_THREAD_CHARS = 20000


def _get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY 環境変数が設定されていません。\n"
            "export GEMINI_API_KEY=your_key_here"
        )
    return genai.Client(api_key=api_key)


def summarize_message(body_text: str, subject: str = "", sender: str = "") -> str:
    """Summarize a single email body in Japanese."""
    if not body_text.strip():
        return "(本文なし)"

    client = _get_client()
    prompt = textwrap.dedent(f"""
        以下のメールを日本語で3〜5文に要約してください。
        要点・決定事項・アクションアイテムがあれば優先して含めてください。

        件名: {subject}
        送信者: {sender}

        本文:
        {body_text[:MAX_BODY_CHARS]}
    """).strip()

    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        return response.text.strip()
    except Exception as e:
        return f"[要約エラー: {e}]"


def summarize_thread(messages: list[dict], subject: str = "") -> str:
    """Summarize an entire thread in Japanese."""
    if not messages:
        return "(メッセージなし)"

    # Build a condensed transcript
    transcript_parts = []
    total = 0
    for m in messages:
        direction = "送信" if m.get("is_sent") else "受信"
        snippet = m.get("body_text", "")[:2000]
        part = f"[{m.get('date', '')[:10]} / {direction} / {m.get('sender', '')}]\n{snippet}"
        transcript_parts.append(part)
        total += len(part)
        if total > MAX_THREAD_CHARS:
            transcript_parts.append("...(省略)")
            break

    transcript = "\n\n---\n\n".join(transcript_parts)

    client = _get_client()
    prompt = textwrap.dedent(f"""
        以下はメールスレッドの会話記録です。日本語で以下の形式でまとめてください。

        【スレッド件名】{subject}

        出力形式:
        ## 概要（2〜3文）
        ## 主なやり取りの流れ
        ## 決定事項・アクションアイテム
        ## キーワード（3〜5個、カンマ区切り）

        スレッド:
        {transcript}
    """).strip()

    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        return response.text.strip()
    except Exception as e:
        return f"[要約エラー: {e}]"


def batch_summarize_threads(thread_data_list: list[dict], sleep_sec: float = 0.5) -> list[dict]:
    """
    thread_data_list: list of {"thread": thread_row, "messages": [message_rows]}
    Returns the same list with summary fields populated.
    """
    results = []
    for i, data in enumerate(thread_data_list):
        thread = data["thread"]
        messages = data["messages"]

        print(f"  [{i+1}/{len(thread_data_list)}] 要約中: {thread.get('subject', '')[:50]}")

        thread_summary = summarize_thread(messages, subject=thread.get("subject", ""))
        thread["summary"] = thread_summary

        for msg in messages:
            if msg.get("body_text") and not msg.get("summary"):
                msg["summary"] = summarize_message(
                    msg["body_text"],
                    subject=msg.get("subject", ""),
                    sender=msg.get("sender", ""),
                )
            time.sleep(sleep_sec)

        results.append({"thread": thread, "messages": messages})

    return results
