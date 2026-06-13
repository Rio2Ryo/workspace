# Product Spec — AI Swarm Factory

_Last updated: 2026-04-28 02:25 JST_

## 0. Inspection note

- `PRODUCT_BRIEF.md` was requested but was not found in the workspace at inspection time.
- An identifiable local Next.js project named “AI Swarm Factory” was also not present. Existing Next.js projects appear unrelated (`projects/auto-create2`, `vls-system`, `second-brain`, etc.).
- This spec is therefore written as a compact, implementable MVP for a new or soon-to-land Next.js App Router + Tailwind implementation, aligned with the QA plan in `docs/qa-plan.md`.

## 1. Concept

**AI Swarm Factory** is a demo web app where users can design a small team of AI agents, launch a simulated mission, and watch the swarm coordinate work in real time.

The MVP should feel like a “factory floor” for AI teams: choose a mission, tune agent roles, press launch, then see progress, handoffs, risks, and final output. It does not need real LLM/API execution in the first 2-hour build; deterministic mock simulation is enough if the UX clearly communicates the product idea.

### Target user

- Startup founders or product leads evaluating multi-agent automation.
- Developers/operators who want to understand how roles, tasks, and state transitions work.
- Non-technical stakeholders who need a visual explanation of “AI swarm” value.

### Core promise

> 複数のAIエージェントが、役割分担しながら1つのゴールへ進む様子を、数分で設計・確認できる。

### MVP outcome

A single polished landing/demo page where a user can:

1. Understand the value proposition above the fold.
2. Select or edit a mission.
3. See 4–6 simulated agents with roles and statuses.
4. Launch a simulated run.
5. Watch statuses/logs/progress update.
6. See a final generated summary.

## 2. Product goals

### Must-have

- Communicate “AI team factory” within 5 seconds.
- Provide a visible primary CTA: **スワームを起動する**.
- Render agent cards with role, status, current task, confidence, and cost/time estimate.
- Simulate state transitions without backend dependency.
- Include clear empty/loading/running/completed/error states.
- Work on mobile and desktop.

### Nice-to-have if time remains

- Mission template selector.
- Speed control: `通常 / 高速`.
- Risk alerts when simulated agents block each other.
- Export/copy final summary button.

### Out of scope for 2-hour MVP

- Real auth.
- Persistent database.
- Real LLM execution.
- Payment/pricing flows.
- Multi-page dashboard.

## 3. Information architecture / sections

### 3.1 Hero

Purpose: Explain the app and drive demo start.

Japanese copy:

- Eyebrow: `AI Swarm Factory`
- H1: `AIチームを設計して、仕事の流れをシミュレーション。`
- Lead: `リサーチ、設計、実装、レビュー。複数のAIエージェントが役割分担しながら成果物へ進む様子を、ブラウザ上で確認できます。`
- Primary CTA: `スワームを起動する`
- Secondary CTA: `仕組みを見る`
- Proof chips:
  - `5 agents`
  - `Mock simulation`
  - `No setup required`

### 3.2 Mission Builder

Purpose: Let the user define the swarm’s goal.

Fields:

- Mission title
  - Default: `新規SaaS LPの改善案を作る`
- Goal description
  - Default: `ターゲット、訴求、ファーストビュー、CTA、検証項目を整理する。`
- Output type selector
  - `企画書`, `実装計画`, `市場調査`, `QAレポート`
- Constraints text
  - Default: `2時間以内で実装可能。外部公開はしない。`

Japanese UI copy:

- Section title: `ミッションを設定`
- Helper: `スワームに任せたい仕事を1つ選びます。MVPではブラウザ内シミュレーションとして動作します。`
- Button: `この条件で起動`

### 3.3 Agent Lineup

Purpose: Show the team structure before and during execution.

Default agents:

1. **Planner / 空** — goal breakdown, priority, dependencies
2. **Researcher / 白** — facts, examples, risks
3. **Builder / 青** — implementation plan, technical feasibility
4. **Reviewer / 黒** — QA, edge cases, blockers
5. **Summarizer / 灯** — final synthesis and handoff

Card fields:

- Name
- Role
- Status badge
- Current task
- Confidence percentage
- Token/cost estimate mock

Japanese status labels:

- `待機中`
- `準備中`
- `実行中`
- `確認中`
- `完了`
- `ブロック`

### 3.4 Live Simulation Board

Purpose: Make the swarm feel alive.

Components:

- Overall progress bar
- Timeline/log feed
- Active handoff indicator
- Risk/decision panel
- Final output panel after completion

Sample Japanese logs:

- `Planner がミッションを4つの作業単位に分解しました。`
- `Researcher が競合パターンと訴求軸を整理中です。`
- `Builder が2時間以内に実装できるUI構成へ圧縮しました。`
- `Reviewer が未定義のエラー状態を検出しました。`
- `Summarizer が最終アウトプットを統合しています。`

Final output copy:

- Title: `生成された実行サマリー`
- Body example: `今回のスワームは、LP改善のために「ターゲット明確化」「CTA強化」「信頼要素の追加」「QA観点の整理」を優先提案しました。次のステップは、HeroとMission Builderの文言を実装し、モバイル表示を確認することです。`
- CTA: `サマリーをコピー`

### 3.5 How it works

Purpose: Explain the model simply.

Three steps:

1. `分解` — `ゴールを小さな作業単位に分ける`
2. `分担` — `役割ごとに担当エージェントへ割り当てる`
3. `統合` — `進捗・リスク・成果物を1つにまとめる`

### 3.6 CTA Footer

Copy:

- H2: `まずは小さなスワームから始めよう。`
- Lead: `本番連携の前に、チーム構成と作業フローを安全に試せます。`
- Button: `デモをもう一度実行`

## 4. User flow

1. Page loads with default mission and idle agents.
2. User optionally edits mission fields.
3. User clicks `スワームを起動する`.
4. App validates non-empty mission title and goal.
5. Simulation starts:
   - Agents move from `待機中` → `準備中` → `実行中` → `確認中` → `完了`.
   - Log feed appends deterministic events every 700–1200ms.
   - Progress increases in steps.
6. On completion, final summary appears and copy button becomes active.
7. User can reset and run again.

## 5. Data model for agent simulation

The MVP can keep all state in client-side React state. No backend is required.

```ts
export type AgentStatus =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'reviewing'
  | 'done'
  | 'blocked';

export type MissionType = 'proposal' | 'implementation' | 'research' | 'qa';

export interface Mission {
  id: string;
  title: string;
  goal: string;
  outputType: MissionType;
  constraints: string;
}

export interface SwarmAgent {
  id: string;
  name: string;
  displayName: string;
  role: 'planner' | 'researcher' | 'builder' | 'reviewer' | 'summarizer';
  roleLabelJa: string;
  description: string;
  status: AgentStatus;
  currentTask: string;
  confidence: number; // 0-100
  estimatedCostYen: number;
  accentColor: string;
}

export interface SimulationEvent {
  id: string;
  timestamp: number;
  agentId: string;
  type: 'status_change' | 'handoff' | 'risk' | 'insight' | 'complete';
  message: string;
}

export interface SwarmRun {
  id: string;
  mission: Mission;
  agents: SwarmAgent[];
  events: SimulationEvent[];
  progress: number; // 0-100
  status: 'idle' | 'running' | 'completed' | 'error';
  activeAgentId?: string;
  startedAt?: number;
  completedAt?: number;
  finalSummary?: string;
}
```

### Simulation implementation notes

- Use a fixed array of `SimulationStep` objects.
- `setInterval` or chained `setTimeout` advances one step at a time.
- Each step updates one or more agent statuses, appends an event, and increments progress.
- Disable launch button while `status === 'running'`.
- Provide `resetRun()` to restore initial state.

```ts
interface SimulationStep {
  delayMs: number;
  progress: number;
  agentUpdates: Array<Pick<SwarmAgent, 'id' | 'status' | 'currentTask' | 'confidence'>>;
  event: Omit<SimulationEvent, 'id' | 'timestamp'>;
}
```

## 6. Acceptance criteria

### Functional

- [ ] Page renders without runtime errors in a Next.js environment.
- [ ] Hero, Mission Builder, Agent Lineup, Live Simulation Board, How it works, and Footer CTA are visible.
- [ ] Launch button starts the simulation when mission title and goal are non-empty.
- [ ] Empty mission title or goal shows an inline Japanese validation message.
- [ ] During simulation, at least 8 log events appear in order.
- [ ] At least 5 agents change status during the run.
- [ ] Progress reaches 100% and final summary appears.
- [ ] Reset/re-run returns agents and logs to initial state.
- [ ] Copy summary button copies text or shows a graceful fallback message.

### UX / content

- [ ] Above-the-fold copy explains the product within 5 seconds.
- [ ] All primary UI copy is Japanese.
- [ ] Mock/demo nature is clearly stated: `MVPではブラウザ内シミュレーションとして動作します。`
- [ ] Status colors are distinguishable and not color-only; labels are always present.
- [ ] Mobile width around 375px has no horizontal scrolling.
- [ ] Buttons and form fields have visible focus states.

### Technical

- [ ] No real API keys, credentials, or private URLs are introduced.
- [ ] Simulation works without network calls.
- [ ] TypeScript types are defined near the component or in `src/lib/swarm-simulation.ts`.
- [ ] Build/lint/typecheck commands pass if configured.
- [ ] No external image dependency is required for the core experience.

## 7. Design direction

### Visual mood

“Factory control room meets friendly AI dashboard.” Use a dark, high-contrast base with luminous status accents. The UI should feel operational and alive, not like a generic SaaS landing page.

### Palette

- Background: `#080B12` / `#0E1420`
- Surface: `rgba(255,255,255,0.06)`
- Border: `rgba(255,255,255,0.12)`
- Primary cyan: `#64E9FF`
- Secondary violet: `#A78BFA`
- Success green: `#34D399`
- Warning amber: `#FBBF24`
- Error red: `#FB7185`
- Text primary: `#F8FAFC`
- Text muted: `#94A3B8`

### Layout

Desktop:

- Max width: 1180–1240px.
- Hero: two-column layout, copy left, live mini console/right visual.
- Main demo: left mission panel, right simulation board.
- Agent cards: responsive grid, 5 cards wrapping gracefully.

Mobile:

- Stack all sections.
- Keep launch CTA sticky or repeated after Mission Builder.
- Logs should have max height with internal scroll.

### Components

- `StatusBadge`
- `AgentCard`
- `MissionForm`
- `ProgressRail`
- `EventLog`
- `FinalSummaryCard`
- `HowItWorksStep`

### Motion

Use small, purposeful transitions only:

- Status badge pulse while running.
- Progress bar ease-out.
- Log items fade/slide in.
- Avoid heavy animation that slows implementation.

## 8. 2-hour implementation plan

1. **0–20 min:** Create data/types and static section layout.
2. **20–45 min:** Build hero, mission form, agent cards.
3. **45–80 min:** Implement simulation state machine and event log.
4. **80–105 min:** Add final summary, reset, validation, copy button.
5. **105–120 min:** Responsive polish, accessibility labels, run build/lint if available.

## 9. Recommended file structure

```txt
src/app/page.tsx
src/app/globals.css
src/lib/swarm-simulation.ts
src/components/swarm/AgentCard.tsx
src/components/swarm/EventLog.tsx
src/components/swarm/MissionForm.tsx
src/components/swarm/StatusBadge.tsx
```

For the fastest MVP, all components can initially live inside `src/app/page.tsx`, then be extracted after the demo is stable.
