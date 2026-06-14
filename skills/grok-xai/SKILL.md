---
name: grok-xai
description: Use xAI Grok via the xAI API for X/Twitter-oriented research, trend/context analysis, summaries, and drafting research briefs. Trigger when the user asks to use Grok, xAI API, X research, Twitter sentiment/context, or wants Grok-backed investigation.
---

# Grok / xAI Research Skill

Use this skill when Grok is useful for X/Twitter-adjacent research: trend context, discourse analysis, source discovery, reaction/sentiment summaries, and comparing claims against current public context.

## Safety / boundaries

- Never ask users to paste API keys into public/group chat.
- Read the API key from `XAI_API_KEY` only.
- Do not post to X or any external account. Research/read/summarize only unless explicit approval is given through the proper workflow.
- Treat Grok output as model output, not verified fact. Cross-check important claims with web/source evidence when accuracy matters.

## Quick usage

Run:

```bash
python3 ~/.openclaw/workspace/skills/grok-xai/scripts/grok_research.py "research question here"
```

Optional model:

```bash
XAI_MODEL=grok-4 python3 ~/.openclaw/workspace/skills/grok-xai/scripts/grok_research.py "query"
```

## Workflow

1. Clarify the research objective if ambiguous:
   - X discourse / sentiment / angle discovery → Grok is appropriate.
   - factual verification / source-heavy reporting → combine Grok with web search/fetch.
2. Use `scripts/grok_research.py` with a focused prompt.
3. Summarize with:
   - key findings
   - confidence level
   - what needs verification
   - suggested next action

## Prompt pattern

Ask Grok for structured output:

```text
Research this for X/Twitter context: <topic>
Return:
1. Main narratives or talking points
2. Notable controversies or disagreements
3. Useful keywords/accounts/sources to inspect next
4. Confidence and verification gaps
Keep it concise and distinguish facts from impressions.
```
