# Diagram-first slide playbook

Use this whenever a deck needs to explain, persuade, or survive a business meeting. Decorative images are optional; explanatory diagrams are mandatory.

## Core standards

- Lead with the answer: every slide title must be an action title, not a label.
- One slide = one claim = one visual proof.
- Use MECE grouping: split ideas into non-overlapping buckets that cover the message.
- Run the “so what?” test: if a visual does not explain the claim, remove or redesign it.
- Prefer native editable diagrams (shapes, arrows, charts, labels) over background images for explanation.
- Use image generation only for hero mood, product atmosphere, or complex illustrative assets after the diagram logic is fixed.

## Narrative frames

- SCQA: Situation → Complication → Question → Answer.
- Problem → Insight → Recommendation.
- Before → After → How.
- Current state → Target state → Transition plan.
- Funnel: audience/contact → intent → action → retained relationship.

## Diagram selection

| Message goal | Use this diagram | Notes |
| --- | --- | --- |
| Show a process | Linear flow / swimlane | 3–6 steps max, arrows must explain causality. |
| Show transformation | Before → bridge → after | Use contrast and a clear outcome metric/claim. |
| Show prioritization | 2×2 matrix | Label axes with business meaning, highlight one quadrant. |
| Show ecosystem | Hub-and-spoke / layered architecture | Center = system; spokes = actors/apps/data. |
| Show relationship | Network map | Use distance/thickness/color to encode closeness. |
| Show drop-off | Funnel / leakage diagram | Label lost value at each stage. |
| Show proof | Bar / waterfall / scorecard | Use real numbers when available; otherwise mark as assumption. |
| Show roadmap | Timeline / phased rollout | 3 phases, outcome at end of each phase. |
| Show decision | Option table / trade-off matrix | Criteria in rows; highlight recommended option. |

## AI image prompt rule

Do not ask image models for “nice visuals.” Ask for diagram assets only after defining:

1. Diagram type
2. Exact nodes/labels
3. Exact relationships/arrows
4. Main insight to highlight
5. Style constraints

Prompt skeleton:

```text
Create a clean 16:9 [diagram type] for a business presentation.
Main claim: [action title].
Elements: [node A], [node B], [node C].
Relationships: A -> B because [...], B -> C because [...].
Highlight: [one object] in champagne gold.
Style: premium Japanese B2B deck, black/ivory/gold, flat vector, high contrast, large readable labels.
No stock photos, no decorative people, no fake UI, no tiny unreadable text.
```

## KATAOMOI-specific diagram patterns

- NFC card → audience-specific landing page → follow-up automation → relationship graph.
- Traditional name card exchange leakage funnel: exchange → forgotten → delayed follow-up → lost opportunity.
- “Net vs harpoon” comparison: broadcast SNS vs targeted relationship OS.
- Relationship trust graph: nodes with distance/thickness representing closeness and trust.
- AI app ecosystem: business apps around an AI orchestration core.

## Quality gate

Before delivery, check:

- Can the viewer explain the slide from the diagram alone?
- Is every arrow labeled or obvious?
- Is the emphasized element visually dominant?
- Are labels readable at Discord preview size?
- Does the slide avoid random decorative imagery?
