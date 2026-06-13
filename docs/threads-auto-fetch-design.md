# Threads Account Post Auto Fetch

## Purpose

Threadsアカウントの投稿を安全に自動取得し、後続の検索・要約・Second Brain取り込みに使える形で保存する。

この準備メモでは、外部アクセス・認証・本番設定変更は行わない。まず設計とローカル実装方針だけを固める。

## Current Workspace Findings

- `threads-auto-fetch` 専用の実装・メモは未発見。
- 近い既存パターン:
  - `projects/mail-manager/`: 外部API取得 -> SQLite保存 -> 検索/要約 CLI。
  - `second-brain/apps/api/src/routes/import.ts`: MarkdownをSecond Brain docsへ保存するAPI。
  - `second-brain/apps/api/src/db/docs.ts`: docs metadata + R2 markdown保存の既存DB層。
- 現在の安全制約:
  - secrets/tokensは表示・コミットしない。
  - 外部公開、投稿、削除、課金増、本番DB変更はしない。
  - Threads API実呼び出しは認証情報とMeta App設定が必要なので判断待ち。

## API Feasibility

Preferred route: official Threads API only.

Officially documented retrieval surfaces include:

- `GET /{threads-user-id}/threads`: created posts for a Threads user.
- `GET /profile_posts?username=...`: public profile post lookup.
- `GET /{threads-media-id}`: individual media/post detail.
- `GET /{threads-user-id}/replies`: user replies.
- `GET /{threads-media-id}/insights`: post insights, if permission allows.

Important implications:

- OAuth/access token is required for the normal API paths.
- `threads_basic` is the minimum likely scope for profile/post reading.
- Additional scopes may be needed for replies, mentions, keyword search, insights, or publishing.
- App review may be required before production use outside test users.
- A long-lived token exchange exists, but it must be done server-side and requires the app secret.

## Scraping Feasibility

Do not implement scraping as the default path.

Reasons:

- Meta treats unauthorized automated scraping as high-risk policy territory.
- Browser/headless scraping would require login/session handling and could expose private data.
- Scraping is more brittle than the official API and harder to operate safely.

Allowed fallback only after explicit approval:

- Manual export/import or user-provided JSON/CSV.
- Read-only browser verification by a human-driven session.
- No credential automation unless Ryo approves the risk and account boundary.

## Storage Options

### Option A: Local SQLite First

Best for first implementation.

Path:

```text
projects/threads-auto-fetch/data/threads.db
```

Tables:

```sql
CREATE TABLE threads_accounts (
  username TEXT PRIMARY KEY,
  threads_user_id TEXT,
  display_name TEXT,
  last_synced_at TEXT,
  after_cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE threads_posts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  permalink TEXT,
  media_type TEXT,
  text TEXT,
  timestamp TEXT,
  shortcode TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'threads_api'
);

CREATE INDEX idx_threads_posts_username_timestamp
  ON threads_posts(username, timestamp DESC);
```

Pros:

- No production DB change.
- Easy to test with fixture JSON.
- Keeps tokens outside repo in local env.

Cons:

- Not immediately visible in Second Brain UI.

### Option B: Second Brain Docs Import

Use after local fetch is stable.

Mapping:

- One account summary doc: `/sources/threads/{username}/index`
- One daily markdown doc: `/sources/threads/{username}/YYYY-MM-DD`
- Optional raw JSON stays outside docs unless redacted.

Pros:

- Searchable in Second Brain.
- Aligns with existing docs/R2 import pattern.

Cons:

- Requires local API/D1/R2 availability.
- Current sandbox may block local wrangler/Miniflare listen.

## Minimal Implementation Plan

Phase 0: fixtures only.

1. Create `projects/threads-auto-fetch/`.
2. Add SQLite schema and DB helpers.
3. Add fixture loader that imports `fixtures/sample-posts.json`.
4. Add CLI:
   - `init-db`
   - `import-fixture`
   - `list --username ...`
   - `export-markdown --username ...`
5. Verify no network, no secrets, no external access.

Phase 1: official API read-only fetch.

1. Read token from environment only:
   - `THREADS_ACCESS_TOKEN`
2. Accept username/user id from CLI.
3. Fetch only read endpoints.
4. Upsert by Threads media id.
5. Store cursor and timestamp.
6. Apply rate-limit friendly defaults:
   - `limit <= 25` initially
   - no parallel fetch
   - retry only explicit transient failures

Phase 2: Second Brain bridge.

1. Convert fetched posts to markdown.
2. Import via existing local `/import/markdown` route when available.
3. Keep raw JSON outside docs or redact before import.

## Stop Conditions

Stop and ask before:

- Using real Threads credentials or app secrets.
- Calling Meta/Threads API from this environment.
- Scraping Threads web/app.
- Adding production cron, Cloudflare Worker schedule, Vercel cron, or any billing-impacting service.
- Writing to production Second Brain/D1/R2.
- Publishing or modifying any Threads content.

## Recommended Next Step

Implement Phase 0 fixture-only local scaffold. This produces a testable importer without external access or credentials.

## References Checked

- Meta Threads developer docs index: <https://developers.facebook.com/docs/threads/>
- Threads docs mirror used when direct Meta docs returned rate limits: <https://context7.com/websites/developers_facebook_threads/llms.txt?tokens=10000>
- Meta automated data collection terms: <https://www.facebook.com/legal/automated_data_collection_terms>
- Meta Terms of Service automated access restriction: <https://www.facebook.com/legal/terms>
