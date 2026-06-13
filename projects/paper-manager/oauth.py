"""Notion OAuth 2.0 utilities."""
import base64
import os
from typing import Optional
from urllib.parse import quote

import requests

NOTION_OAUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"
NOTION_SEARCH_URL = "https://api.notion.com/v1/search"

NOTION_CLIENT_ID = os.environ.get("NOTION_CLIENT_ID", "")
NOTION_CLIENT_SECRET = os.environ.get("NOTION_CLIENT_SECRET", "")


def get_auth_url(redirect_uri: str, state: str) -> str:
    params = (
        f"client_id={NOTION_CLIENT_ID}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&response_type=code"
        f"&owner=user"
        f"&state={state}"
    )
    return f"{NOTION_OAUTH_URL}?{params}"


def exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange auth code for access token. Returns token response dict."""
    credentials = base64.b64encode(
        f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}".encode()
    ).decode()

    resp = requests.post(
        NOTION_TOKEN_URL,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        },
        json={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
    # Returns: {access_token, token_type, bot_id, workspace_name, workspace_icon, workspace_id, owner}


def extract_user_from_token_response(token_resp: dict) -> dict:
    """Extract stable user identity from OAuth token response.

    token_resp['owner'] is either:
      {'type': 'user', 'user': {'id': '<uuid>', 'name': '...',
                                 'person': {'email': '...'}, 'avatar_url': '...'}}
      or bot-owner variants, e.g.
      {'type': 'bot', 'bot': {'owner': {'type': 'user', 'user': {...}}, ...}}

    Returns {'notion_user_id': str, 'name': str, 'email': str, 'avatar_url': str}.
    Raises ValueError if we cannot extract a user id.
    """
    if not isinstance(token_resp, dict):
        raise ValueError("token_resp must be a dict")

    owner = token_resp.get("owner") or {}
    user_obj: Optional[dict] = None

    # Direct user owner
    if isinstance(owner, dict):
        if owner.get("type") == "user" and isinstance(owner.get("user"), dict):
            user_obj = owner["user"]
        elif owner.get("type") == "bot" and isinstance(owner.get("bot"), dict):
            inner_owner = owner["bot"].get("owner") or {}
            if isinstance(inner_owner, dict) and isinstance(inner_owner.get("user"), dict):
                user_obj = inner_owner["user"]
            # Some responses directly include the user under bot.user / bot.owner.user
            elif isinstance(owner["bot"].get("user"), dict):
                user_obj = owner["bot"]["user"]
        # Fallback: owner itself has an "id"
        elif "id" in owner:
            user_obj = owner

    # Top-level fallbacks occasionally used by Notion
    if user_obj is None:
        if isinstance(token_resp.get("user"), dict):
            user_obj = token_resp["user"]

    if not isinstance(user_obj, dict):
        raise ValueError("OAuth token response has no user owner")

    notion_user_id = user_obj.get("id")
    if not notion_user_id:
        raise ValueError("OAuth token response is missing user id")

    name = user_obj.get("name") or ""
    avatar_url = user_obj.get("avatar_url") or ""
    email = ""
    person = user_obj.get("person")
    if isinstance(person, dict):
        email = person.get("email") or ""

    return {
        "notion_user_id": str(notion_user_id),
        "name": name,
        "email": email,
        "avatar_url": avatar_url,
    }


def validate_token(token: str) -> Optional[dict]:
    """Validate an Internal Integration token. Returns {workspace_name} or None."""
    try:
        resp = requests.get(
            "https://api.notion.com/v1/users/me",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": "2022-06-28",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        workspace_name = (
            data.get("bot", {}).get("workspace_name")
            or data.get("name")
            or "My Workspace"
        )
        return {"workspace_name": workspace_name}
    except Exception:
        return None


def _db_properties_schema() -> dict:
    return {
        "タイトル":  {"title": {}},
        "PDF":       {"url": {}},
        "PDF閲覧URL": {"url": {}},
        "Year":      {"number": {}},
        "税目":      {"select": {}},
        "タイプ":    {"select": {}},
        "雑誌名":    {"select": {}},
        "執筆者":    {"select": {}},
        "全著者":    {"rich_text": {}},
        "講義使用":  {"rich_text": {}},
        "メモ":      {"rich_text": {}},
        "判批":      {"rich_text": {}},
        "映像":      {"url": {}},
        "読":        {"checkbox": {}},
    }


def _find_accessible_page(access_token: str) -> Optional[str]:
    """Return a page_id accessible to this integration (for DB parent)."""
    try:
        resp = requests.post(
            "https://api.notion.com/v1/search",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            json={"filter": {"value": "page", "property": "object"}, "page_size": 1},
            timeout=10,
        )
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            if results:
                return results[0]["id"]
    except Exception:
        pass
    return None


def create_paper_database(access_token: str, title: str = "論文管理") -> Optional[dict]:
    """Create a paper-management Notion database.
    Tries workspace root first; falls back to first accessible page."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }

    def _build_payload(parent: dict) -> dict:
        return {
            "parent": parent,
            "icon": {"type": "emoji", "emoji": "📚"},
            "title": [{"type": "text", "text": {"content": title}}],
            "properties": _db_properties_schema(),
        }

    def _post(payload: dict) -> Optional[dict]:
        try:
            resp = requests.post(
                "https://api.notion.com/v1/databases",
                headers=headers, json=payload, timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                title_parts = data.get("title", [])
                db_title = title_parts[0]["text"]["content"] if title_parts else title
                return {"id": data["id"], "title": db_title, "url": data.get("url", "")}
        except Exception:
            pass
        return None

    # 1st attempt: workspace root (requires "Insert content" capability)
    result = _post(_build_payload({"type": "workspace", "workspace": True}))
    if result:
        return result

    # 2nd attempt: inside first accessible page (no special capability needed)
    page_id = _find_accessible_page(access_token)
    if page_id:
        result = _post(_build_payload({"type": "page_id", "page_id": page_id}))
        if result:
            return result

    return None


def list_databases(access_token: str) -> list[dict]:
    """Return list of databases the user has shared with the integration."""
    resp = requests.post(
        NOTION_SEARCH_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        json={
            "filter": {"value": "database", "property": "object"},
            "sort": {"direction": "descending", "timestamp": "last_edited_time"},
        },
        timeout=15,
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])

    databases = []
    for db in results:
        title_parts = db.get("title", [])
        title = "".join(p.get("plain_text", "") for p in title_parts) or "(無題)"
        databases.append({"id": db["id"], "title": title})
    return databases
