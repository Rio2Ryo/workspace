"""
論文管理 Web アプリ
Usage: uvicorn app:app --reload --port 8000
"""
import csv
import io
import json
import logging
import os
import secrets
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.INFO)

from typing import Optional

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

load_dotenv()

import db as database
import oauth
from config import ANTHROPIC_API_KEY

try:
    database.init_db()
except Exception as _db_init_err:
    import logging
    logging.warning(f"init_db failed: {_db_init_err}")

app = FastAPI(title="論文管理API", version="0.1.0")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")
CALLBACK_PATH = "/auth/callback"

# ---------------------------------------------------------------------------
# Encrypted session backup (survives cold starts / redeploys)
# ---------------------------------------------------------------------------
import base64
import hashlib
from itsdangerous import URLSafeSerializer, BadSignature

_SECRET = os.environ.get("SECRET_KEY", "dev-secret-please-change")
_signer = URLSafeSerializer(_SECRET, salt="session-backup")


def _session_to_cookie(session_id: str, data: dict) -> str:
    payload = {k: data.get(k) for k in (
        "access_token", "workspace_id", "workspace_name", "database_id", "database_name"
    )}
    payload["session_id"] = session_id
    return _signer.dumps(payload)


def _cookie_to_session(token: str) -> Optional[dict]:
    try:
        return _signer.loads(token)
    except BadSignature:
        return None


def _set_backup_cookie(response, session_id: str, data: dict):
    """Attach signed session backup cookie to response."""
    cookie_val = _session_to_cookie(session_id, data)
    response.set_cookie("session_backup", cookie_val, httponly=True,
                        max_age=86400 * 30, samesite="lax")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_session(request: Request, session_id: str = Cookie(default=None)) -> Optional[dict]:
    if not session_id:
        return None
    session = database.get_session(session_id)
    if session:
        return session
    # Cold-start recovery: restore from signed backup cookie
    backup = request.cookies.get("session_backup")
    if backup:
        data = _cookie_to_session(backup)
        if data and data.get("session_id") == session_id:
            database.save_session(session_id, data)
            return database.get_session(session_id)
    return None


def require_session(session: Optional[dict] = Depends(get_session)):
    if not session or not session.get("access_token"):
        raise HTTPException(status_code=401, detail="Notion と連携してください")
    return session


def require_user(session: dict = Depends(require_session)) -> dict:
    """Return current user row. Raises 401 if session has no linked user."""
    user = None
    session_id = session.get("session_id")
    if session_id and hasattr(database, "get_user_by_session"):
        try:
            user = database.get_user_by_session(session_id)
        except Exception as e:
            logging.warning(f"get_user_by_session failed: {e}")
    if not user:
        raise HTTPException(status_code=401, detail="ユーザー情報が未リンクです。再ログインしてください。")
    return user


def can_view_user_data(viewer_user_id: str, owner_user_id: str) -> bool:
    """Returns True iff viewer == owner or viewer is parent of owner."""
    if not viewer_user_id or not owner_user_id:
        return False
    if viewer_user_id == owner_user_id:
        return True
    if hasattr(database, "is_parent_of"):
        try:
            return bool(database.is_parent_of(viewer_user_id, owner_user_id))
        except Exception as e:
            logging.warning(f"is_parent_of failed: {e}")
    return False


def resolve_view_target(current_user: dict, view_as: Optional[str]) -> dict:
    """If view_as is None or equals current_user['user_id'], return current user.
    Else check is_parent_of(current, view_as); if OK, return the target user dict.
    Else raise 403."""
    current_uid = current_user.get("user_id")
    if not view_as or view_as == current_uid:
        return current_user
    if not hasattr(database, "is_parent_of") or not hasattr(database, "get_user"):
        raise HTTPException(status_code=403, detail="権限がありません")
    try:
        ok = database.is_parent_of(current_uid, view_as)
    except Exception as e:
        logging.warning(f"is_parent_of failed: {e}")
        ok = False
    if not ok:
        raise HTTPException(status_code=403, detail="権限がありません")
    target = None
    try:
        target = database.get_user(view_as)
    except Exception as e:
        logging.warning(f"get_user failed: {e}")
    if not target:
        raise HTTPException(status_code=404, detail="対象ユーザーが見つかりません")
    return target


def _deny_if_view_as(view_as: Optional[str], session_id: Optional[str]) -> None:
    """Raise 403 if acting as another user (view-as mode is read-only)."""
    if not view_as:
        return
    current_uid = None
    if session_id and hasattr(database, "get_user_by_session"):
        try:
            u = database.get_user_by_session(session_id)
            current_uid = u.get("user_id") if u else None
        except Exception:
            current_uid = None
    if current_uid and view_as == current_uid:
        return
    raise HTTPException(status_code=403, detail="閲覧モードでは編集できません")


def paper_owner_user_id(paper_id: str) -> Optional[str]:
    """Return the user_id that owns the given paper via session join.
    Falls back to None if not found or schema doesn't yet have user linkage."""
    import sqlite3
    try:
        conn = sqlite3.connect(str(database.DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT s.user_id FROM papers p
            LEFT JOIN sessions s ON p.session_id = s.session_id
            WHERE p.paper_id = ?
            """,
            (paper_id,),
        ).fetchone()
        conn.close()
    except Exception as e:
        logging.warning(f"paper_owner_user_id query failed: {e}")
        return None
    if not row:
        return None
    return row["user_id"] if row["user_id"] else None


def require_api_key(x_api_key: str = Header(default=None)) -> dict:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required")
    session = database.get_session_by_api_key(x_api_key)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not session.get("database_id"):
        raise HTTPException(status_code=400, detail="保存先DBが未設定です。Web UIから設定してください。")
    return session


def _process_pdf_task(job_id: str, pdf_bytes: bytes, original_name: str, session: dict):
    """Background task: extract, verify, summarize, upload PDF. Stops before Notion registration."""
    from extractors.pdf_extractor import extract_text
    from extractors.ai_extractor import extract_metadata, generate_summary, generate_one_line_summary
    from extractors.db_verifier import verify_metadata
    from utils.filename import generate_filename

    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = Path(tmp.name)

        # Step 1: Extract text
        text = extract_text(tmp_path)

        # Step 2: AI metadata extraction (text + visual layout from the PDF itself)
        ai_meta = extract_metadata(text, pdf_bytes=pdf_bytes)

        # Step 3: CiNii / NDL verification
        verified_meta = verify_metadata(ai_meta)

        # Step 4: Generate filename
        filename = generate_filename(verified_meta)

        # Step 5: Summary (pass pdf_bytes so scanned/image-only PDFs work via multimodal)
        summary = generate_summary(text, pdf_bytes=pdf_bytes)

        # Step 5b: Always generate one_line_summary for 2-stage summary
        one_line_summary = None
        try:
            one_line_summary = generate_one_line_summary(summary)
        except Exception as e:
            logging.warning(f"[task] one_line_summary generation failed: {e}")

        # Step 6: Upload PDF to Vercel Blob
        from blob_storage import upload_pdf
        blob_filename = filename or (original_name if original_name else "paper.pdf")
        pdf_url = upload_pdf(tmp_path, blob_filename)

        # Store extracted data and wait for user confirmation
        display = {k: v for k, v in verified_meta.items() if k not in ("cinii_result", "ndl_result")}
        display["cinii_result"] = verified_meta.get("cinii_result")
        display["ndl_result"] = verified_meta.get("ndl_result")

        # Compute viewer URL for this job
        pdf_viewer_url = f"{BASE_URL}/pdf/{job_id}" if pdf_url else None

        result = {
            "metadata": display,
            "verified_meta": verified_meta,
            "filename": filename,
            "summary": summary,
            "one_line_summary": one_line_summary,
            "pdf_url": pdf_url,
            "pdf_viewer_url": pdf_viewer_url,
        }
        database.update_job(job_id, "awaiting_confirmation", result=result)

    except Exception as e:
        import traceback
        err_detail = f"{type(e).__name__}: {e}"
        tb = traceback.format_exc()
        logging.error("[task] _process_pdf_task error: %s\n%s", err_detail, tb)
        print(f"[task] ERROR: {err_detail}\n{tb}", flush=True)
        database.update_job(job_id, "error", error=err_detail)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


def _register_to_notion(job_id: str, meta: dict, summary: str, one_line_summary: Optional[str],
                        filename: Optional[str], pdf_url: Optional[str], session: dict,
                        pdf_view_url: Optional[str] = None):
    """Phase 2: Register confirmed metadata to Notion and finalize the job."""
    from notion.client import register_paper

    session_id = session.get("session_id", "")
    column_mapping = database.get_column_mapping(session_id)
    scholar_list = database.get_scholar_list(session_id)

    reg_result = register_paper(
        meta=meta,
        summary=summary,
        filename=filename,
        pdf_path=None,
        access_token=session["access_token"],
        database_id=session["database_id"],
        pdf_url=pdf_url,
        pdf_view_url=pdf_view_url,
        one_line_summary=one_line_summary,
        column_mapping=column_mapping,
        scholar_list=scholar_list if scholar_list else None,
    )
    notion_url = f"https://www.notion.so/{reg_result.page_id.replace('-', '')}"

    display = {k: v for k, v in meta.items() if k not in ("cinii_result", "ndl_result")}
    display["cinii_result"] = meta.get("cinii_result")
    display["ndl_result"] = meta.get("ndl_result")

    debug_info = reg_result.debug_props.pop("__debug_schema__", {})

    # Determine job status based on write results
    failed_props = [f"{name}: {err}" for name, err in reg_result.failed]
    warnings = reg_result.warnings + failed_props

    if reg_result.has_failures:
        status = "partial"
    else:
        status = "done"

    result = {
        "metadata": display,
        "filename": filename,
        "summary": summary,
        "notion_page_id": reg_result.page_id,
        "notion_url": notion_url,
        "pdf_url": pdf_url,
        "debug_props": reg_result.written,
        "failed_props": [name for name, _ in reg_result.failed],
        "warnings": warnings,
        "debug_schema": str(debug_info)[:500],
    }
    database.update_job(job_id, status, result=result)

    database.save_paper(
        session_id=session.get("session_id", job_id),
        job_id=job_id,
        meta=meta,
        filename=filename,
        summary=summary,
        notion_page_id=reg_result.page_id,
        notion_url=notion_url,
    )


# ---------------------------------------------------------------------------
# Web UI routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index(request: Request, session_id: str = Cookie(default=None),
                token_error: str = None, view_as: Optional[str] = None,
                flash: Optional[str] = None):
    try:
        session = database.get_session(session_id) if session_id else None
        connected = bool(session and session.get("access_token"))
        database_selected = bool(session and session.get("database_id")) if connected else False

        # Get existing API key if any
        api_key = None
        if connected and session_id:
            import sqlite3
            conn = sqlite3.connect(str(database.DB_PATH))
            row = conn.execute(
                "SELECT api_key FROM api_keys WHERE session_id = ? LIMIT 1", (session_id,)
            ).fetchone()
            conn.close()
            api_key = row[0] if row else None

        # User-aware context (best effort — gracefully handle missing db funcs)
        current_user = None
        is_parent = False
        has_parent = False
        viewing_as_child = False
        view_target = None
        if connected and session_id and hasattr(database, "get_user_by_session"):
            try:
                current_user = database.get_user_by_session(session_id)
            except Exception as e:
                logging.warning(f"get_user_by_session failed: {e}")
            if current_user and current_user.get("user_id"):
                uid = current_user["user_id"]
                if hasattr(database, "list_children"):
                    try:
                        is_parent = len(database.list_children(uid)) > 0
                    except Exception as e:
                        logging.warning(f"list_children failed: {e}")
                if hasattr(database, "list_parents"):
                    try:
                        has_parent = len(database.list_parents(uid)) > 0
                    except Exception as e:
                        logging.warning(f"list_parents failed: {e}")
                if view_as and view_as != uid:
                    try:
                        view_target = resolve_view_target(current_user, view_as)
                        viewing_as_child = True
                    except HTTPException:
                        return RedirectResponse("/parent?flash=invalid_view_as", status_code=303)

        error_msg = "トークンが無効です。形式と権限を確認してください。" if token_error else None
        return templates.TemplateResponse(request=request, name="index.html", context={
            "connected": connected,
            "database_selected": database_selected,
            "workspace_name": session.get("workspace_name") if session else None,
            "api_key": api_key,
            "token_error": error_msg,
            "oauth_enabled": bool(oauth.NOTION_CLIENT_ID),
            "current_user": current_user,
            "is_parent": is_parent,
            "has_parent": has_parent,
            "viewing_as_child": viewing_as_child,
            "view_target": view_target,
            "flash": flash,
        })
    except Exception as e:
        import traceback, logging
        logging.error(traceback.format_exc())
        raise


@app.get("/auth/notion")
async def auth_notion(request: Request):
    """Redirect to Notion OAuth consent screen (Public Integration)."""
    if not oauth.NOTION_CLIENT_ID:
        return RedirectResponse("/")
    state = secrets.token_urlsafe(16)
    redirect_uri = f"{BASE_URL}{CALLBACK_PATH}"
    url = oauth.get_auth_url(redirect_uri, state)
    response = RedirectResponse(url)
    response.set_cookie("oauth_state", state, httponly=True, max_age=600)
    return response


@app.post("/auth/token")
async def auth_token(token: str = Form(...)):
    """Accept a Notion Internal Integration token, validate it, and start a session."""
    token = token.strip()
    info = oauth.validate_token(token)
    if not info:
        # Re-render index with error
        response = RedirectResponse("/?token_error=1", status_code=303)
        return response

    session_id = secrets.token_urlsafe(32)
    session_data = {
        "access_token": token,
        "workspace_name": info.get("workspace_name", "My Workspace"),
        "database_id": None,
        "database_name": None,
    }
    database.save_session(session_id, session_data)
    response = RedirectResponse("/databases", status_code=303)
    response.set_cookie("session_id", session_id, httponly=True, max_age=86400 * 30)
    _set_backup_cookie(response, session_id, session_data)
    return response


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = None, error: str = None,
                        state: str = None, oauth_state: str = Cookie(default=None)):
    if error or not code:
        return HTMLResponse(f"<p>認証エラー: {error}</p><a href='/'>戻る</a>", status_code=400)

    redirect_uri = f"{BASE_URL}{CALLBACK_PATH}"
    try:
        token_data = oauth.exchange_code(code, redirect_uri)
    except Exception as e:
        return HTMLResponse(f"<p>トークン取得エラー: {e}</p><a href='/'>戻る</a>", status_code=500)

    session_id = secrets.token_urlsafe(32)
    session_data = {
        "access_token": token_data.get("access_token"),
        "workspace_id": token_data.get("workspace_id"),
        "workspace_name": token_data.get("workspace_name"),
        "database_id": None,
        "database_name": None,
    }
    database.save_session(session_id, session_data)

    # Extract Notion user identity and link session -> user
    try:
        user_info = oauth.extract_user_from_token_response(token_data)
        if hasattr(database, "get_or_create_user") and hasattr(database, "link_session_to_user"):
            user = database.get_or_create_user(
                user_info["notion_user_id"],
                name=user_info.get("name", ""),
                email=user_info.get("email", ""),
                avatar_url=user_info.get("avatar_url", ""),
            )
            if user and user.get("user_id"):
                database.link_session_to_user(session_id, user["user_id"])
        else:
            logging.warning("db user helpers missing; skipping user linkage")
    except ValueError as e:
        logging.warning(f"extract_user_from_token_response failed: {e}")
    except Exception as e:
        logging.warning(f"user linkage failed: {e}")

    response = RedirectResponse("/databases")
    response.set_cookie("session_id", session_id, httponly=True, max_age=86400 * 30)
    response.delete_cookie("oauth_state")
    _set_backup_cookie(response, session_id, session_data)
    return response


@app.get("/databases", response_class=HTMLResponse)
async def databases_page(request: Request, session: dict = Depends(require_session)):
    try:
        dbs = oauth.list_databases(session["access_token"])
    except Exception as e:
        dbs = []
    return templates.TemplateResponse(request=request, name="databases.html", context={
        "databases": dbs,
        "workspace_name": session.get("workspace_name"),
        "error": False,
    })


@app.post("/select-db")
async def select_db(request: Request, view_as: Optional[str] = None,
                    session_id: str = Cookie(default=None),
                    session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    form = await request.form()
    db_id = form.get("database_id")
    if not db_id:
        return RedirectResponse("/databases", status_code=303)

    # Get DB name from the list
    try:
        dbs = oauth.list_databases(session["access_token"])
        db_name = next((d["title"] for d in dbs if d["id"] == db_id), db_id)
    except Exception:
        db_name = db_id

    session.update({"database_id": db_id, "database_name": db_name})
    database.save_session(session_id, session)
    response = RedirectResponse("/", status_code=303)
    _set_backup_cookie(response, session_id, session)
    return response


@app.post("/create-db")
async def create_db(request: Request, view_as: Optional[str] = None,
                    session_id: str = Cookie(default=None),
                    session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    form = await request.form()
    db_title = (form.get("db_title") or "論文管理").strip() or "論文管理"
    result = oauth.create_paper_database(session["access_token"], title=db_title)
    if not result:
        try:
            dbs = oauth.list_databases(session["access_token"])
        except Exception:
            dbs = []
        return templates.TemplateResponse(request=request, name="databases.html", context={
            "databases": dbs,
            "workspace_name": session.get("workspace_name"),
            "error": True,
        })
    session.update({"database_id": result["id"], "database_name": result["title"]})
    database.save_session(session_id, session)
    response = RedirectResponse("/", status_code=303)
    _set_backup_cookie(response, session_id, session)
    return response


@app.post("/api/blob/upload-token")
async def get_blob_upload_token(
    request: Request,
    session: dict = Depends(require_session),
):
    """Issue a Vercel Blob upload token for client-direct upload.
    Used to bypass the 4.5MB Vercel Function body limit on large PDFs."""
    import re
    import uuid as _uuid
    payload = await request.json()
    filename = (payload.get("filename") or "").strip()
    content_length = int(payload.get("contentLength") or 0)
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDFファイルのみ対応しています")
    if content_length <= 0 or content_length > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="ファイルサイズが無効です（最大50MB）")
    blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    if not blob_token:
        raise HTTPException(status_code=500, detail="Vercel Blob が未設定です")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    pathname = f"papers/{_uuid.uuid4().hex}_{safe_name}"
    return JSONResponse({
        "pathname": pathname,
        "uploadUrl": f"https://blob.vercel-storage.com/{pathname}",
        "token": blob_token,
    })


@app.post("/upload", response_class=HTMLResponse)
async def upload(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    blob_url: Optional[str] = Form(default=None),
    blob_filename: Optional[str] = Form(default=None),
    view_as: Optional[str] = None,
    session_id: str = Cookie(default=None),
    session: dict = Depends(require_session),
):
    _deny_if_view_as(view_as, session_id)
    if not session.get("database_id"):
        return RedirectResponse("/databases", status_code=303)

    import asyncio
    import requests as _requests

    pdf_bytes: bytes
    filename: str

    if blob_url and blob_filename:
        # Client-direct upload path: PDF already in Vercel Blob, fetch by URL.
        # Validate the URL points to vercel-storage.com (defence-in-depth).
        if not blob_filename.lower().endswith(".pdf"):
            return HTMLResponse("<p>PDFファイルのみ対応しています。</p>", status_code=400)
        if "vercel-storage.com" not in blob_url:
            return HTMLResponse("<p>無効なファイル URL です。</p>", status_code=400)
        try:
            resp = _requests.get(blob_url, timeout=120)
            resp.raise_for_status()
            pdf_bytes = resp.content
        except Exception as e:
            return HTMLResponse(f"<p>ファイル取得に失敗しました: {e}</p>", status_code=502)
        if len(pdf_bytes) > 50 * 1024 * 1024:
            return HTMLResponse("<p>ファイルサイズが大きすぎます（最大50MB）。</p>", status_code=413)
        filename = blob_filename
    elif file is not None and file.filename:
        # Legacy small-file path through the function body (≤4.5MB).
        if not file.filename.lower().endswith(".pdf"):
            return HTMLResponse("<p>PDFファイルのみ対応しています。</p>", status_code=400)
        pdf_bytes = await file.read()
        filename = file.filename
    else:
        return HTMLResponse("<p>ファイルが指定されていません。</p>", status_code=400)

    job_id = database.create_job(session_id)

    # Run synchronously in thread pool so Vercel doesn't cut it off
    await asyncio.to_thread(_process_pdf_task, job_id, pdf_bytes, filename, session)

    job = database.get_job(job_id)
    if job and job.get("status") == "awaiting_confirmation":
        return RedirectResponse(f"/confirm/{job_id}", status_code=303)
    # Error case
    error_msg = (job.get("error") if job else None) or "処理中にエラーが発生しました"
    return templates.TemplateResponse(request=request, name="result.html", context={
        "job": {"status": "error", "error": error_msg},
        "workspace_name": session.get("workspace_name"),
    })


@app.get("/processing/{job_id}", response_class=HTMLResponse)
async def processing_page(request: Request, job_id: str, session: dict = Depends(require_session)):
    return templates.TemplateResponse(request=request, name="processing.html", context={
        "job_id": job_id,
        "workspace_name": session.get("workspace_name"),
    })


@app.get("/confirm/{job_id}", response_class=HTMLResponse)
async def confirm_page(request: Request, job_id: str, session: dict = Depends(require_session)):
    job = database.get_job(job_id)
    if not job or job.get("status") != "awaiting_confirmation":
        return RedirectResponse("/")
    r = job.get("result", {})
    meta = r.get("metadata", {})
    return templates.TemplateResponse(request=request, name="confirm.html", context={
        "job_id": job_id,
        "meta": meta,
        "filename": r.get("filename", ""),
        "summary": r.get("summary", ""),
        "has_pdf": bool(r.get("pdf_url")),
        "workspace_name": session.get("workspace_name"),
    })


@app.post("/confirm/{job_id}")
async def confirm_submit(request: Request, job_id: str,
                         view_as: Optional[str] = None,
                         session_id: str = Cookie(default=None),
                         session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    job = database.get_job(job_id)
    if not job or job.get("status") != "awaiting_confirmation":
        return RedirectResponse("/", status_code=303)

    stored = job.get("result", {})
    form = await request.form()

    # Parse edited fields from form
    authors_raw = form.get("authors", "")
    import re as _re
    authors = [a.strip() for a in _re.split(r"[、,・;\n]", authors_raw) if a.strip()]

    # Build updated meta, preserving cinii/ndl verification results from stored data
    verified_meta = dict(stored.get("verified_meta") or stored.get("metadata") or {})
    verified_meta.update({
        "title": form.get("title", ""),
        "authors": authors,
        "journal": form.get("journal", ""),
        "year": form.get("year", ""),
        "volume": form.get("volume", ""),
        "issue": form.get("issue", ""),
        "pages": form.get("pages", ""),
        "type": form.get("doc_type", ""),
        "doi": form.get("doi", ""),
    })
    # Per-user request: never persist "わからない" — coerce to blank.
    from extractors.ai_extractor import _normalize_unknown
    verified_meta = _normalize_unknown(verified_meta)

    filename = (form.get("filename") or "").strip() or stored.get("filename")
    summary = stored.get("summary", "")
    one_line_summary = stored.get("one_line_summary")
    pdf_url = stored.get("pdf_url")
    pdf_view_url = f"{BASE_URL}/view-pdf/{job_id}" if pdf_url else None

    # Mark job as registering to prevent race conditions
    database.update_job(job_id, "registering")

    try:
        import asyncio
        await asyncio.wait_for(
            asyncio.to_thread(
                _register_to_notion,
                job_id, verified_meta, summary, one_line_summary, filename, pdf_url, session,
                pdf_view_url,
            ),
            timeout=60,  # 60 second timeout for Notion API
        )
    except asyncio.TimeoutError:
        err_detail = "Notion APIへの登録がタイムアウトしました（60秒）"
        logging.error("[confirm] registration timeout for job %s", job_id)
        database.update_job(job_id, "error", error=err_detail)
    except Exception as e:
        import traceback
        err_detail = f"{type(e).__name__}: {e}"
        logging.error("[confirm] registration error: %s\n%s", err_detail, traceback.format_exc())
        database.update_job(job_id, "error", error=err_detail)

    return RedirectResponse(f"/result/{job_id}", status_code=303)


@app.get("/result/{job_id}", response_class=HTMLResponse)
async def result_page(request: Request, job_id: str, session: dict = Depends(require_session)):
    job = database.get_job(job_id)
    if not job:
        return RedirectResponse("/")
    return templates.TemplateResponse(request=request, name="result.html", context={
        "job": job,
        "workspace_name": session.get("workspace_name"),
    })


@app.get("/job/{job_id}")
async def job_status(job_id: str):
    job = database.get_job(job_id)
    if not job:
        return JSONResponse({"status": "not_found"}, status_code=404)
    return JSONResponse({"status": job["status"], "error": job.get("error")})


@app.get("/papers", response_class=HTMLResponse)
async def papers_page(request: Request, q: str = "", sort: str = "newest",
                      cinii: str = "", ndl: str = "", memo: str = "",
                      view_as: Optional[str] = None,
                      session_id: str = Cookie(default=None),
                      session: dict = Depends(require_session)):
    viewing_as_child = False
    view_target = None
    current_user = None
    if session_id and hasattr(database, "get_user_by_session"):
        try:
            current_user = database.get_user_by_session(session_id)
        except Exception as e:
            logging.warning(f"get_user_by_session failed: {e}")

    if view_as and current_user and view_as != current_user.get("user_id"):
        try:
            view_target = resolve_view_target(current_user, view_as)
            viewing_as_child = True
        except HTTPException:
            return RedirectResponse("/parent?flash=invalid_view_as", status_code=303)

        # Cross-user listing
        if hasattr(database, "list_papers_by_user"):
            papers = database.list_papers_by_user(
                view_target["user_id"], q=q or "", sort=sort,
            )
        else:
            papers = []
    else:
        papers = database.list_papers(
            session["session_id"], search=q or None, sort=sort,
            cinii_only=bool(cinii), ndl_only=bool(ndl), memo_only=bool(memo),
        )
    return templates.TemplateResponse(request=request, name="papers.html", context={
        "papers": papers,
        "query": q,
        "sort": sort,
        "cinii": cinii,
        "ndl": ndl,
        "memo": memo,
        "workspace_name": session.get("workspace_name"),
        "viewing_as_child": viewing_as_child,
        "view_target": view_target,
        "view_as": view_as if viewing_as_child else None,
    })


@app.get("/papers/export")
async def papers_export(q: str = "", sort: str = "newest",
                        cinii: str = "", ndl: str = "", memo: str = "",
                        format: str = "csv",
                        session_id: str = Cookie(default=None),
                        session: dict = Depends(require_session)):
    papers = database.list_papers(
        session["session_id"], search=q or None, sort=sort, limit=10000,
        cinii_only=bool(cinii), ndl_only=bool(ndl), memo_only=bool(memo),
    )

    if format == "json":
        data = [
            {
                "id": p["paper_id"],
                "title": p.get("title"),
                "authors": p.get("authors") or [],
                "journal": p.get("journal"),
                "year": p.get("year"),
                "volume": p.get("volume"),
                "issue": p.get("issue"),
                "pages": p.get("pages"),
                "filename": p.get("filename"),
                "summary": p.get("summary"),
                "memo": p.get("memo"),
                "notion_url": p.get("notion_url"),
                "cinii_verified": bool(p.get("cinii_verified")),
                "ndl_verified": bool(p.get("ndl_verified")),
                "manually_edited": bool(p.get("manually_edited")),
                "created_at": p.get("created_at"),
                "updated_at": p.get("updated_at"),
            }
            for p in papers
        ]
        content = json.dumps({"count": len(data), "papers": data}, ensure_ascii=False, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode("utf-8")),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=papers.json"},
        )

    # CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["タイトル", "著者", "雑誌名", "年", "巻", "号", "頁", "要約", "メモ",
                     "CiNii照合", "NDL照合", "手動修正", "Notion URL", "登録日"])
    for p in papers:
        writer.writerow([
            p.get("title") or "",
            "・".join(p.get("authors") or []),
            p.get("journal") or "",
            p.get("year") or "",
            p.get("volume") or "",
            p.get("issue") or "",
            p.get("pages") or "",
            p.get("summary") or "",
            p.get("memo") or "",
            "✓" if p.get("cinii_verified") else "",
            "✓" if p.get("ndl_verified") else "",
            "✓" if p.get("manually_edited") else "",
            p.get("notion_url") or "",
            (p.get("created_at") or "")[:10],
        ])
    content_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel
    return StreamingResponse(
        io.BytesIO(content_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=papers.csv"},
    )


@app.get("/papers/{paper_id}", response_class=HTMLResponse)
async def paper_detail(request: Request, paper_id: str,
                       view_as: Optional[str] = None,
                       session_id: str = Cookie(default=None),
                       session: dict = Depends(require_session)):
    # Try owner-in-session first (backward-compat path)
    paper = database.get_paper(paper_id, session["session_id"])
    viewing_as_child = False

    if not paper:
        # Try cross-user access via owner user_id check
        current_user = None
        if session_id and hasattr(database, "get_user_by_session"):
            try:
                current_user = database.get_user_by_session(session_id)
            except Exception as e:
                logging.warning(f"get_user_by_session failed: {e}")
        owner_uid = paper_owner_user_id(paper_id)
        if not current_user or not owner_uid or not can_view_user_data(
            current_user.get("user_id"), owner_uid
        ):
            raise HTTPException(status_code=404, detail="Paper not found")

        # Fetch paper using any of owner's sessions
        if hasattr(database, "session_ids_for_user"):
            try:
                for sid in database.session_ids_for_user(owner_uid):
                    p = database.get_paper(paper_id, sid)
                    if p:
                        paper = p
                        break
            except Exception as e:
                logging.warning(f"session_ids_for_user failed: {e}")
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        viewing_as_child = (current_user.get("user_id") != owner_uid)
    else:
        # Paper is owned by this session. If view_as was specified and differs,
        # we still treat this as owner view (no restrictions) — view_as only
        # matters when crossing user boundaries.
        pass

    # Related papers — list within the paper's own session scope
    related_session = paper.get("session_id") or session["session_id"]
    try:
        related = database.list_related_papers(
            paper_id, related_session,
            authors=paper.get("authors") or [],
            journal=paper.get("journal"),
        )
    except Exception as e:
        logging.warning(f"list_related_papers failed: {e}")
        related = []

    return templates.TemplateResponse(request=request, name="paper_detail.html", context={
        "paper": paper,
        "related": related,
        "workspace_name": session.get("workspace_name"),
        "viewing_as_child": viewing_as_child,
    })


@app.get("/papers/{paper_id}/edit", response_class=HTMLResponse)
async def paper_edit_page(request: Request, paper_id: str,
                          view_as: Optional[str] = None,
                          session_id: str = Cookie(default=None),
                          session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    paper = database.get_paper(paper_id, session["session_id"])
    if not paper:
        return RedirectResponse("/papers")
    return templates.TemplateResponse(request=request, name="paper_edit.html", context={
        "paper": paper,
        "workspace_name": session.get("workspace_name"),
    })


@app.post("/papers/{paper_id}/edit")
async def paper_edit_save(request: Request, paper_id: str,
                           view_as: Optional[str] = None,
                           session_id: str = Cookie(default=None),
                           session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    form = await request.form()
    # Parse authors: split on 、,・; or newline
    authors_raw = form.get("authors", "")
    import re as _re
    authors = [a.strip() for a in _re.split(r"[、,・;\n]", authors_raw) if a.strip()]

    new_meta = {
        "title": form.get("title", ""),
        "authors": authors,
        "journal": form.get("journal", ""),
        "year": form.get("year", ""),
        "volume": form.get("volume", ""),
        "issue": form.get("issue", ""),
        "pages": form.get("pages", ""),
    }
    # Per-user request: never persist "わからない" — coerce to blank so the DB and
    # display stay clean even if the user typed it or it was loaded from old data.
    from extractors.ai_extractor import _normalize_unknown
    new_meta = _normalize_unknown(new_meta)
    # Regenerate filename from the edited metadata so users don't have to keep
    # the saved filename in sync manually.
    from utils.filename import generate_filename
    regenerated = generate_filename(new_meta)
    if regenerated:
        new_meta["filename"] = regenerated

    database.update_paper_meta(paper_id, session["session_id"], new_meta)
    # Save memo via same request if provided
    memo = form.get("memo")
    if memo is not None:
        database.update_paper_memo(paper_id, session["session_id"], memo)
    return RedirectResponse(f"/papers/{paper_id}", status_code=303)


@app.post("/papers/{paper_id}/memo")
async def update_memo(request: Request, paper_id: str,
                      view_as: Optional[str] = None,
                      session_id: str = Cookie(default=None),
                      session: dict = Depends(require_session)):
    _deny_if_view_as(view_as, session_id)
    form = await request.form()
    memo = form.get("memo", "")
    database.update_paper_memo(paper_id, session["session_id"], memo)
    return RedirectResponse(f"/papers/{paper_id}", status_code=303)


@app.get("/settings/mapping", response_class=HTMLResponse)
async def mapping_page(request: Request, session_id: str = Cookie(default=None),
                       session: dict = Depends(require_session)):
    from notion.client import get_db_columns, infer_column_mapping, _last_db_debug
    columns = {}
    inferred = {}
    schema_error = None
    if session.get("database_id"):
        try:
            columns = get_db_columns(session["access_token"], session["database_id"])
            inferred = infer_column_mapping(columns)
        except Exception as e:
            schema_error = str(e)
            logging.warning(f"[mapping] get_db_columns failed: {e}")
    elif not session.get("database_id"):
        schema_error = "database_id が未設定です"
    user_mapping = database.get_column_mapping(session_id)
    # Effective: inferred as base, user_mapping overrides
    effective = dict(inferred)
    for role, col in user_mapping.items():
        if col is not None:
            effective[role] = col if col else None
    # Get existing API key
    api_key = None
    if session_id:
        import sqlite3
        conn = sqlite3.connect(str(database.DB_PATH))
        row = conn.execute(
            "SELECT api_key FROM api_keys WHERE session_id = ? LIMIT 1", (session_id,)
        ).fetchone()
        conn.close()
        api_key = row[0] if row else None
    return templates.TemplateResponse(request=request, name="settings.html", context={
        "columns": columns,
        "mapping": effective,
        "user_mapping": user_mapping,
        "inferred": inferred,
        "workspace_name": session.get("workspace_name"),
        "database_name": session.get("database_name"),
        "database_id": session.get("database_id"),
        "saved": request.query_params.get("saved"),
        "schema_error": schema_error,
        "db_debug": _last_db_debug,
        "api_key": api_key,
    })


@app.post("/settings/mapping")
async def save_mapping(request: Request, session_id: str = Cookie(default=None),
                       session: dict = Depends(require_session)):
    form = await request.form()
    roles = ["title", "author_primary", "authors_all", "journal", "year",
             "doc_type", "summary", "one_line_summary", "memo", "doi", "pdf", "read"]
    mapping = {}
    for role in roles:
        val = (form.get(f"role_{role}") or "").strip()
        mapping[role] = val if val else None
    database.save_column_mapping(session_id, mapping)
    return RedirectResponse("/settings/mapping?saved=1", status_code=303)


@app.get("/api/debug/schema")
async def debug_schema(session: dict = Depends(require_session)):
    """Return raw Notion API response for the current DB. Temporary debug endpoint."""
    from notion_client import Client
    db_id = session.get("database_id")
    token = session.get("access_token")
    if not db_id or not token:
        return JSONResponse({"error": "no database_id or token in session",
                             "database_id": db_id, "has_token": bool(token)})
    client = Client(auth=token)
    result: dict = {"database_id": db_id}
    try:
        db = client.databases.retrieve(database_id=db_id)
        result["retrieve_ok"] = True
        result["db_keys"] = list(db.keys())
        result["prop_count"] = len(db.get("properties", {}))
        result["prop_names"] = list(db.get("properties", {}).keys())[:20]
    except Exception as e:
        result["retrieve_ok"] = False
        result["retrieve_error"] = str(e)
    try:
        q = client.databases.query(database_id=db_id, page_size=1)
        pages = q.get("results", [])
        if pages:
            props = pages[0].get("properties", {})
            result["query_prop_count"] = len(props)
            result["query_prop_names"] = list(props.keys())[:20]
        else:
            result["query_prop_count"] = 0
            result["query_empty"] = True
    except Exception as e:
        result["query_error"] = str(e)
    return JSONResponse(result)


@app.post("/api-key/create")
async def create_api_key(session_id: str = Cookie(default=None), session: dict = Depends(require_session)):
    api_key = database.create_api_key(session_id)
    return RedirectResponse("/settings/mapping", status_code=303)


def _job_owner_user_id(job: dict) -> Optional[str]:
    """Return user_id who owns the job, via session join. None if not linked."""
    if not job:
        return None
    job_session_id = job.get("session_id")
    if not job_session_id:
        return None
    try:
        import sqlite3
        conn = sqlite3.connect(str(database.DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE session_id = ?", (job_session_id,)
        ).fetchone()
        conn.close()
        return row["user_id"] if row and row["user_id"] else None
    except Exception as e:
        logging.warning(f"_job_owner_user_id failed: {e}")
        return None


def _job_accessible_to_session(job: dict, session_id: Optional[str]) -> bool:
    """Return True if current session owns the job or is parent of its owner.

    Backward-compat: if the job has no user linkage, allow only when session owns it.
    """
    if not job:
        return False
    job_session_id = job.get("session_id")
    if job_session_id and session_id and job_session_id == session_id:
        return True
    if not session_id or not hasattr(database, "get_user_by_session"):
        return False
    try:
        viewer = database.get_user_by_session(session_id)
    except Exception:
        viewer = None
    if not viewer or not viewer.get("user_id"):
        return False
    owner_uid = _job_owner_user_id(job)
    if not owner_uid:
        return False
    return can_view_user_data(viewer["user_id"], owner_uid)


@app.get("/pdf/{job_id}")
async def view_pdf(job_id: str, download: bool = False,
                   session_id: str = Cookie(default=None)):
    """Serve PDF — inline by default, attachment when ?download=true."""
    import requests as _req
    from fastapi.responses import Response as _Resp
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Access check: owner or parent of owner. If session_id is present and
    # ownership is clearly cross-session-cross-user, reject. Otherwise stay lenient
    # for backward compatibility with un-migrated users.
    if session_id:
        job_sid = job.get("session_id")
        if job_sid and job_sid != session_id and not _job_accessible_to_session(job, session_id):
            raise HTTPException(status_code=404, detail="Job not found")
    result = job.get("result") or {}
    pdf_url = result.get("pdf_url")
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF not available")
    try:
        r = _req.get(pdf_url, timeout=30)
        r.raise_for_status()
        from urllib.parse import quote as _quote
        raw_name = (result.get("filename") or "paper.pdf").replace('"', '').replace("'", '')
        if download:
            # RFC 5987: ASCII fallback + UTF-8 encoded filename
            utf8_encoded = _quote(raw_name, safe='')
            cd = f'attachment; filename="paper.pdf"; filename*=UTF-8\'\'{utf8_encoded}'
        else:
            # inline: omit filename to avoid latin-1 encoding errors
            cd = "inline"
        return _Resp(
            content=r.content,
            media_type="application/pdf",
            headers={"Content-Disposition": cd},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PDF fetch failed: {e}")


@app.get("/view-pdf/{job_id}", response_class=HTMLResponse)
async def view_pdf_page(request: Request, job_id: str,
                        session_id: str = Cookie(default=None)):
    """In-browser PDF viewer page with download button."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if session_id and not _job_accessible_to_session(job, session_id):
        # Keep lenient: if user_id linkage isn't set yet, _job_accessible_to_session
        # returns False — but legacy flow (no user linkage) relies on session_id
        # match; we only reject if there's a clear ownership mismatch.
        job_sid = job.get("session_id")
        if job_sid and job_sid != session_id:
            # Confirm we actually failed because of cross-user; else allow.
            raise HTTPException(status_code=404, detail="Job not found")
    result = job.get("result") or {}
    if not result.get("pdf_url"):
        raise HTTPException(status_code=404, detail="PDF not available")
    return templates.TemplateResponse(request=request, name="view_pdf.html", context={
        "job_id": job_id,
        "filename": result.get("filename") or "paper.pdf",
    })


@app.get("/settings/scholars", response_class=HTMLResponse)
async def scholars_page(request: Request, session_id: str = Cookie(default=None),
                        session: dict = Depends(require_session)):
    scholars = database.get_scholar_list(session_id or "")
    return templates.TemplateResponse(request=request, name="scholars.html", context={
        "scholars": scholars,
        "scholars_text": "\n".join(scholars),
        "workspace_name": session.get("workspace_name"),
        "saved": request.query_params.get("saved"),
    })


@app.post("/settings/scholars")
async def save_scholars(request: Request, session_id: str = Cookie(default=None),
                        session: dict = Depends(require_session)):
    form = await request.form()
    raw = form.get("scholars", "")
    scholars = [s.strip() for s in raw.replace(",", "\n").replace("、", "\n").splitlines() if s.strip()]
    database.save_scholar_list(session_id or "", scholars)
    return RedirectResponse("/settings/scholars?saved=1", status_code=303)


@app.get("/disconnect")
@app.post("/disconnect")
@app.get("/logout")
@app.post("/logout")
async def disconnect(session_id: str = Cookie(default=None)):
    """Fully log the user out: drop the session row, clear both session cookies."""
    if session_id:
        try:
            database.delete_session(session_id)
        except Exception as e:
            logging.warning(f"delete_session failed: {e}")
    response = RedirectResponse("/", status_code=303)
    response.delete_cookie("session_id", path="/")
    response.delete_cookie("session_backup", path="/")
    return response


@app.get("/switch-account", response_class=HTMLResponse)
async def switch_account(request: Request, session_id: str = Cookie(default=None)):
    """Guided flow for connecting a different Notion account:
    1. Clear all session state server- and client-side.
    2. Show a short helper page that links to notion.so (open in new tab to
       add a different Notion account) and then to /auth/notion.
    """
    if session_id:
        try:
            database.delete_session(session_id)
        except Exception as e:
            logging.warning(f"delete_session failed: {e}")
    html = """
<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">
<title>別のNotionに切替</title>
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f8f9fa;color:#212529;min-height:100vh;margin:0;padding:2rem 1.5rem;}
.card{max-width:520px;margin:2rem auto;background:#fff;border:1px solid #e9ecef;border-radius:12px;padding:2rem;}
h1{font-size:1.15rem;margin-bottom:1rem;}
ol{padding-left:1.2rem;line-height:1.9;font-size:0.92rem;color:#343a40;margin-bottom:1.25rem;}
.btn{display:block;text-align:center;padding:0.7rem 1rem;border-radius:8px;font-weight:600;text-decoration:none;margin-bottom:0.6rem;}
.btn-primary{background:#4338ca;color:#fff;}
.btn-secondary{background:#e9ecef;color:#343a40;}
.muted{font-size:0.8rem;color:#6c757d;margin-top:1rem;}
</style></head><body>
<div class=\"card\">
  <h1>🔁 別のNotionアカウントに切り替える</h1>
  <ol>
    <li><strong>新しいタブでNotionを開き</strong>、右上のアカウントメニュー → <code>Add another account</code> で接続したいNotionにログインしてください。</li>
    <li>このページに戻って下の「Notionで認証する」を押すと、OAuth画面右上のドロップダウンで新しく追加したアカウントが選択肢として出ます。</li>
    <li>対象のワークスペースを選択し「Select pages」を進めれば、別Notionとしてペーパーマネージャーに繋がります。</li>
  </ol>
  <a class=\"btn btn-secondary\" href=\"https://www.notion.so/login?fromAgent=true\" target=\"_blank\" rel=\"noopener\">
    ① Notion を新しいタブで開く
  </a>
  <a class=\"btn btn-primary\" href=\"/auth/notion\">
    ② Notion で認証する
  </a>
  <p class=\"muted\">※ 既存のセッションは既にログアウト済みです。</p>
</div>
</body></html>
"""
    response = HTMLResponse(html, status_code=200)
    response.delete_cookie("session_id", path="/")
    response.delete_cookie("session_backup", path="/")
    return response


# ---------------------------------------------------------------------------
# Parent dashboard / invite / accept-invite
# ---------------------------------------------------------------------------

@app.get("/parent", response_class=HTMLResponse)
async def parent_dashboard(request: Request, flash: Optional[str] = None,
                           error: Optional[str] = None,
                           current_user: dict = Depends(require_user)):
    uid = current_user["user_id"]
    children: list = []
    active_invites: list = []
    parents: list = []
    if hasattr(database, "list_children"):
        try:
            children = database.list_children(uid)
        except Exception as e:
            logging.warning(f"list_children failed: {e}")
    if hasattr(database, "list_active_invites"):
        try:
            active_invites = database.list_active_invites(uid)
        except Exception as e:
            logging.warning(f"list_active_invites failed: {e}")
    if hasattr(database, "list_parents"):
        try:
            parents = database.list_parents(uid)
        except Exception as e:
            logging.warning(f"list_parents failed: {e}")

    return templates.TemplateResponse(request=request, name="parent_dashboard.html", context={
        "current_user": current_user,
        "children": children,
        "active_invites": active_invites,
        "parents": parents,
        "flash": flash,
        "error": error,
    })


@app.post("/parent/invite")
async def parent_invite_create(current_user: dict = Depends(require_user)):
    if not hasattr(database, "create_invite_code"):
        return RedirectResponse("/parent?error=invite_unavailable", status_code=303)
    try:
        database.create_invite_code(current_user["user_id"])
    except Exception as e:
        logging.warning(f"create_invite_code failed: {e}")
        return RedirectResponse("/parent?error=invite_failed", status_code=303)
    return RedirectResponse("/parent?flash=invite_created", status_code=303)


@app.post("/parent/invite/revoke")
async def parent_invite_revoke(request: Request,
                               current_user: dict = Depends(require_user)):
    form = await request.form()
    code = (form.get("code") or "").strip()
    if code and hasattr(database, "revoke_invite"):
        try:
            database.revoke_invite(code, current_user["user_id"])
        except Exception as e:
            logging.warning(f"revoke_invite failed: {e}")
    return RedirectResponse("/parent?flash=invite_revoked", status_code=303)


@app.post("/parent/children/remove")
async def parent_child_remove(request: Request,
                              current_user: dict = Depends(require_user)):
    form = await request.form()
    child_user_id = (form.get("child_user_id") or "").strip()
    if child_user_id and hasattr(database, "remove_parent_child"):
        try:
            database.remove_parent_child(current_user["user_id"], child_user_id)
        except Exception as e:
            logging.warning(f"remove_parent_child failed: {e}")
    return RedirectResponse("/parent?flash=child_removed", status_code=303)


@app.get("/parent/children/{child_user_id}")
async def parent_view_child(child_user_id: str,
                            current_user: dict = Depends(require_user)):
    if not hasattr(database, "is_parent_of"):
        raise HTTPException(status_code=403, detail="権限がありません")
    try:
        ok = database.is_parent_of(current_user["user_id"], child_user_id)
    except Exception as e:
        logging.warning(f"is_parent_of failed: {e}")
        ok = False
    if not ok:
        raise HTTPException(status_code=403, detail="権限がありません")
    return RedirectResponse(f"/papers?view_as={child_user_id}", status_code=303)


@app.get("/accept-invite", response_class=HTMLResponse)
async def accept_invite_page(request: Request, flash: Optional[str] = None,
                             error: Optional[str] = None,
                             current_user: dict = Depends(require_user)):
    return templates.TemplateResponse(request=request, name="accept_invite.html", context={
        "current_user": current_user,
        "flash": flash,
        "error": error,
    })


@app.post("/accept-invite")
async def accept_invite_submit(request: Request,
                               current_user: dict = Depends(require_user)):
    form = await request.form()
    code = (form.get("code") or "").strip()
    if not code:
        return RedirectResponse("/accept-invite?error=empty", status_code=303)
    if not hasattr(database, "consume_invite"):
        return RedirectResponse("/accept-invite?error=unavailable", status_code=303)
    try:
        result = database.consume_invite(code, current_user["user_id"])
    except Exception as e:
        logging.warning(f"consume_invite failed: {e}")
        result = None
    if not result:
        return templates.TemplateResponse(
            request=request, name="accept_invite.html", context={
                "current_user": current_user,
                "error": "招待コードが無効または期限切れです",
            }
        )
    return RedirectResponse("/?flash=invite_accepted", status_code=303)


# ---------------------------------------------------------------------------
# REST API (for CLI / AI access)
# ---------------------------------------------------------------------------

@app.post("/api/process")
async def api_process(
    file: UploadFile = File(...),
    session: dict = Depends(require_api_key),
):
    """
    PDFをアップロードして処理ジョブを開始する。
    ヘッダー: X-API-Key: pm_xxxxx
    レスポンス: {"job_id": "..."}
    """
    import asyncio
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDFファイルのみ対応しています")

    pdf_bytes = await file.read()
    job_id = database.create_job(session.get("session_id", "api"))
    await asyncio.to_thread(_process_pdf_task, job_id, pdf_bytes, file.filename, session)
    job = database.get_job(job_id)
    return {
        "job_id": job_id,
        "status": job["status"] if job else "error",
        "result": job.get("result") if job else None,
        "error": job.get("error") if job else None,
    }


@app.get("/api/papers")
async def api_papers(q: str = "", limit: int = 50, session: dict = Depends(require_api_key)):
    """
    登録済み論文を検索・一覧取得する。
    ヘッダー: X-API-Key: pm_xxxxx
    クエリパラメータ: q=キーワード, limit=件数(max 200)
    """
    limit = min(limit, 200)
    papers = database.list_papers(session["session_id"], search=q or None, limit=limit)
    return {
        "count": len(papers),
        "papers": [
            {
                "id": p["paper_id"],
                "title": p.get("title"),
                "authors": p.get("authors") or [],
                "journal": p.get("journal"),
                "year": p.get("year"),
                "volume": p.get("volume"),
                "issue": p.get("issue"),
                "pages": p.get("pages"),
                "filename": p.get("filename"),
                "summary": p.get("summary"),
                "notion_url": p.get("notion_url"),
                "cinii_verified": bool(p.get("cinii_verified")),
                "ndl_verified": bool(p.get("ndl_verified")),
                "created_at": p.get("created_at"),
            }
            for p in papers
        ],
    }


@app.get("/api/job/{job_id}")
async def api_job_status(job_id: str, session: dict = Depends(require_api_key)):
    """ジョブの処理状況と結果を返す。"""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "status": job["status"],
        "result": job.get("result"),
        "error": job.get("error"),
    }
