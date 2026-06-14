---
name: reddit-search
description: Search Reddit posts and discussions for research. Use when the user asks to search Reddit/Raddit, subreddits, Reddit sentiment, Reddit threads, product feedback, community reactions, or wants Reddit results included in web/X research.
---

# Reddit Search

## Quick workflow

1. Prefer the bundled script for lightweight public Reddit search:

```bash
python3 ~/.openclaw/workspace/skills/reddit-search/scripts/reddit_search.py "query" --limit 10
python3 ~/.openclaw/workspace/skills/reddit-search/scripts/reddit_search.py "query" --subreddit LocalLLaMA --sort new --time month
```

2. If the script returns `blocked`, `rate_limited`, or weak results, use `web_search` with targeted queries:

```text
site:reddit.com/r/<subreddit> <query>
site:reddit.com <query> reddit
```

3. For high-confidence summaries, fetch/open the specific Reddit thread and inspect the title, score, comments count, date, and top comments before drawing conclusions.

## Search modes

- Broad Reddit search: omit `--subreddit`.
- Subreddit search: pass `--subreddit name` without `r/`.
- Sort: `relevance`, `new`, `top`, `comments`.
- Time filter: `hour`, `day`, `week`, `month`, `year`, `all`.
- Output: default markdown; use `--json` for machine-readable results.

## API and policy notes

- The script uses Reddit's public JSON endpoints without credentials, with a clear User-Agent.
- This is suitable for lightweight research, not bulk scraping or monitoring.
- If repeated/high-volume use is needed, ask for Reddit OAuth app credentials and switch to the official OAuth API/PRAW flow.
- Respect Reddit rate limits and community privacy; do not collect personal data beyond public thread metadata needed for the task.

## Reporting format

When reporting Reddit findings, include:

- query/subreddit/time range
- top thread URLs
- observed consensus or disagreement
- caveats: sample size, age of posts, whether comments were inspected
