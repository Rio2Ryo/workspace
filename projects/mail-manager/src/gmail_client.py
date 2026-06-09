"""Gmail API client — read-only."""

import base64
import json
import re
from datetime import datetime, timezone
from email import policy as email_policy
from email.parser import BytesParser
from pathlib import Path
from typing import Generator

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
TOKEN_PATH = Path(__file__).parent.parent / "data" / "token.json"
CREDS_PATH = Path(__file__).parent.parent / "data" / "credentials.json"


def _get_credentials() -> Credentials:
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                raise FileNotFoundError(
                    f"credentials.json が見つかりません: {CREDS_PATH}\n"
                    "Google Cloud Console から OAuth 2.0 クライアント ID をダウンロードして配置してください。"
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())
    return creds


def build_service():
    return build("gmail", "v1", credentials=_get_credentials())


# ── low-level helpers ─────────────────────────────────────────────────────────

def _decode_body(data: str) -> str:
    """Base64url → utf-8 string."""
    try:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_parts(payload: dict) -> tuple[str, str]:
    """Recursively extract (plain_text, html) from a MIME payload."""
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime == "text/plain":
        return _decode_body(body_data), ""
    if mime == "text/html":
        return "", _decode_body(body_data)

    plain, html = "", ""
    for part in payload.get("parts", []):
        p, h = _extract_parts(part)
        plain += p
        html += h
    return plain, html


def _extract_attachments(payload: dict) -> list[dict]:
    attachments = []
    for part in payload.get("parts", []):
        filename = part.get("filename", "")
        if filename:
            attachments.append({
                "filename": filename,
                "mime_type": part.get("mimeType", ""),
                "size_bytes": part.get("body", {}).get("size", 0),
                "attachment_id": part.get("body", {}).get("attachmentId", ""),
            })
        attachments.extend(_extract_attachments(part))
    return attachments


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _parse_date(raw: str) -> str:
    """Parse RFC2822 date → ISO 8601 string (best-effort)."""
    import email.utils
    try:
        ts = email.utils.parsedate_to_datetime(raw)
        return ts.astimezone(timezone.utc).isoformat()
    except Exception:
        return raw


# ── public API ────────────────────────────────────────────────────────────────

def fetch_thread_ids(service, label_ids: list[str] = None, max_results: int = 100) -> list[str]:
    """Return a list of thread IDs matching the given labels."""
    if label_ids is None:
        label_ids = ["INBOX", "SENT"]

    thread_ids = []
    for label in label_ids:
        page_token = None
        while len(thread_ids) < max_results:
            resp = service.users().threads().list(
                userId="me",
                labelIds=[label],
                maxResults=min(500, max_results - len(thread_ids)),
                pageToken=page_token,
            ).execute()
            for t in resp.get("threads", []):
                if t["id"] not in thread_ids:
                    thread_ids.append(t["id"])
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    return thread_ids[:max_results]


def fetch_thread(service, thread_id: str) -> dict:
    """Fetch a full thread and return structured data."""
    raw = service.users().threads().get(
        userId="me", id=thread_id, format="full"
    ).execute()

    messages = []
    for msg in raw.get("messages", []):
        headers = msg["payload"].get("headers", [])
        plain, html = _extract_parts(msg["payload"])
        atts = _extract_attachments(msg["payload"])
        label_ids = msg.get("labelIds", [])
        is_sent = "SENT" in label_ids

        messages.append({
            "message_id": msg["id"],
            "thread_id": thread_id,
            "subject": _header(headers, "Subject"),
            "sender": _header(headers, "From"),
            "recipients": json.dumps(
                [a.strip() for a in re.split(r"[,;]", _header(headers, "To")) if a.strip()]
            ),
            "date": _parse_date(_header(headers, "Date")),
            "body_text": plain.strip(),
            "body_html": html.strip(),
            "summary": None,
            "is_sent": 1 if is_sent else 0,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "_attachments": atts,
        })

    if not messages:
        return {"thread": None, "messages": []}

    messages.sort(key=lambda m: m["date"])
    all_participants = list({
        addr.strip()
        for m in messages
        for addr in ([m["sender"]] + json.loads(m["recipients"]))
        if addr.strip()
    })

    thread_record = {
        "thread_id": thread_id,
        "subject": messages[0]["subject"],
        "participants": json.dumps(all_participants),
        "first_date": messages[0]["date"],
        "last_date": messages[-1]["date"],
        "message_count": len(messages),
        "summary": None,
        "theme": None,
        "importance": None,
        "labels": json.dumps([]),
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"thread": thread_record, "messages": messages}


def iter_threads(service, max_results: int = 100) -> Generator[dict, None, None]:
    """Yield structured thread dicts, fetching from Gmail."""
    thread_ids = fetch_thread_ids(service, max_results=max_results)
    for tid in thread_ids:
        yield fetch_thread(service, tid)
