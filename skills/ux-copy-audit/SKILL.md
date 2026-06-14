---
name: ux-copy-audit
description: Audit and rewrite product UX copy, landing pages, forms, result pages, onboarding, and content-heavy interfaces for clarity, brevity, redundancy, progressive disclosure, and actionability. Use when the user asks to make UX better, reduce text, remove redundancy, check the whole experience, improve microcopy, or make content easier to scan/share.
---

# UX Copy Audit

Use this skill before claiming a UX/copy improvement is complete.

## Workflow

1. Extract the visible user-facing copy from the app/page, not only the changed section.
2. Map the journey: entry → choice → input → result → detail → share/next action.
3. Mark each text block as one of:
   - **Core:** needed to act or understand the result.
   - **Support:** useful, but should be short or folded.
   - **Reference:** trust/legal/source material; move near the end or behind details.
   - **Duplicate:** says the same thing as another block; delete or merge.
4. Apply these rules:
   - One screen = one main job.
   - Put the user benefit before the mechanism.
   - Prefer labels of 2–8 words and helper text under 45 Japanese characters when possible.
   - Result first: show summary/cards before long prose.
   - Do not repeat the same disclaimer more than once per screen.
   - If a paragraph has 3+ ideas, split into cards or cut to the strongest one.
   - Keep reference/source content collapsed or secondary.
5. Rewrite in layers:
   - Top: one-sentence promise.
   - Action: clear CTA.
   - Result: 3 short cards.
   - Details: collapsed.
   - Share: short copy users can send.
6. Verify with a copy budget:
   - Count visible text blocks.
   - Identify the 5 longest visible strings.
   - Remove/shorten any block that does not help the next action.

## Output standard

Report:
- What was too long/redundant.
- What was cut/merged/moved.
- Verification performed (build/test/screenshot/text extraction).

## Optional script

Use `scripts/extract-visible-copy.mjs <tsx-file>` to list likely JSX text nodes and long string literals for audit.
