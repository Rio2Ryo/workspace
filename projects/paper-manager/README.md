# paper-manager

論文PDFをアップロードし、書誌情報抽出・CiNii/NDL照合・要約・Notion登録を行う FastAPI アプリです。

## Features
- PDFアップロード
- 書誌情報抽出
- CiNii / NDL 照合フロー
- ファイル名生成
- Notion OAuth
- 保存先DB選択
- REST API / Web UI

## Local setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app:app --reload --port 8000
```

## Required env vars
- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`
- `ANTHROPIC_API_KEY`
- `BASE_URL`
- `CINII_APPID` (optional)

## Render
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Set env vars from `.env.example`

## OAuth callback
- Local: `http://localhost:8000/auth/callback`
- Render: `https://<your-render-domain>/auth/callback`
