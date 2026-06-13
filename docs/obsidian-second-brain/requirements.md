# Second Brain Knowledge Layer Requirements v0.4

作成日: 2026-06-05
更新日: 2026-06-05
対象: Shiro / OpenClaw workspace
状態: Active

## 1. Purpose

Second BrainアプリをShiroの主系ナレッジ運用基盤として育てる。Obsidian vaultは、Markdownで残せる保険・移植元・バックアップ知識層として維持する。

最終目的は、RyoさんやYakonさんへの確認回数を減らし、次回以降に自走できる判断領域を増やすこと。

## 2. Success Criteria

- 重要な判断、失敗、運用ルールがObsidianに残る
- タスク開始時に過去の類似判断・失敗を参照できる
- 日次・週次の振り返りがテンプレート化される
- Discord/Telegramで得た重要情報を整理して保管できる
- 参照すべき情報が `MEMORY.md` だけに偏らず、用途別に分解される
- 将来の自動同期・検索・RAG化に耐えるMarkdown構造になる
- Second Brainアプリ側に移植しやすい粒度で、判断・失敗・タスク・知識が分離される
- Second Brainが安定運用できる場合、UI・検索・タスク連携はSecond Brain側を主系にする

## 3. Stakeholders

- Ryoさん: 最終判断者。方針、優先度、成果価値を決める
- Yakonさん: 運用・改善指示者。Shiroの自走精度向上を重視する
- Shiro: 24h運用担当。記録、監視、検証、提案を継続する
- Sora: COS。方針・優先順位・判断基準の中核
- Ao: 開発リード。実装・GitHub・デプロイ関連の主担当
- Kuro: 機動支援。詰まりや高優先度対応を補助する

## 4. Scope

### In Scope

- Obsidian vaultの情報設計
- Markdownテンプレート整備
- 日次ログ、判断ログ、失敗ログ、タスクログの運用定義
- OpenClaw workspace内の既存記憶ファイルとの接続方針
- 将来の同期・検索・自動化候補の整理

### Out of Scope for v0.3

- 外部公開
- 本番環境の変更
- 課金が増えるサービス導入
- Discord/Telegramへの自動投稿実装
- Obsidianプラグインの大量導入

## 5. Product Direction

主系:

```text
/Users/umi/.openclaw/workspace/second-brain/
```

役割:

- Shiroの第二の脳の本体
- タスク、検索、RAG、UI、エージェント運用の集約先
- 将来的な自動化・可視化・共同作業の中心

補助系:

```text
/Users/umi/.openclaw/workspace/second-brain/obsidian-vault/
```

役割:

- Markdownで壊れにくく残す保険
- 要件定義、判断ログ、失敗ログ、日次ログの初期保存先
- Second Brainアプリへ投入する前の整理レイヤー

方針:

Second Brainアプリが十分に機能するなら、運用の主導権はSecond Brainへ寄せる。Obsidianは競合プロダクトではなく、データの可搬性と人間可読性を担保する補助層として扱う。

## 6. Information Architecture

初期vault配置:

```text
/Users/umi/.openclaw/workspace/second-brain/obsidian-vault/
```

推奨vault構成:

```text
00_Inbox/
10_Daily/
20_Projects/
30_Tasks/
40_Decisions/
50_Knowledge/
60_Failures/
70_Prompts/
80_Agents/
90_Archive/
```

### 00_Inbox

未整理メモの一時置き場。DiscordやTelegramから拾った情報、思いついた提案、後で整理する断片を入れる。

### 10_Daily

日次ログ。最低限、次の3行を残す。

- やったこと
- 明日の最重要
- リスク

### 20_Projects

プロジェクト単位の情報を管理する。

初期候補:

- Second Brain
- Obsidian Integration
- Second Brain QA
- Agent Operations
- Brand Titan

### 30_Tasks

タスク単位の状態を残す。

必須項目:

- 主担当
- 副担当
- 優先度
- 依存関係
- ETA
- 次アクション
- 完了条件

### 40_Decisions

判断ログ。Shiroの自走精度を上げるための最重要領域。

必須項目:

- 判断を求めた内容
- 判断結果
- 判断基準
- 次回から自走する条件
- 例外時に確認する条件

### 50_Knowledge

調査結果、技術知識、運用知識、プロジェクト横断で再利用できる知識を入れる。

### 60_Failures

失敗と再発防止を資産化する。

必須項目:

- 何が起きたか
- なぜ起きたか
- 次回どう防ぐか
- どのルールへ反映するか
- 24時間以内の反映状況

### 70_Prompts

Claude Code、Codex、Gemini、OpenClaw内エージェントに渡す再利用可能なプロンプトを保存する。

### 80_Agents

Sora、Ao、Shiro、Kuroなどの役割、担当、連携ルールを管理する。

### 90_Archive

完了済み、凍結、参照頻度が低い情報を保管する。

## 7. Frontmatter Conventions

すべてのノートは以下のYAMLフロントマターを持つ。Obsidianタグ検索・RAG取り込みに対応するため統一する。

```yaml
---
type: daily | decision | failure | task | project | knowledge | prompt | agent
date: YYYY-MM-DD
tags: []
status: draft | active | closed | archived
owner: shiro | sora | ao | kuro | ryo | yakon
related: []
---
```

### ファイル命名規則

| フォルダ | 命名パターン | 例 |
|---|---|---|
| 10_Daily | `YYYY-MM-DD.md` | `2026-06-05.md` |
| 30_Tasks | `task_<slug>.md` | `task_cycle-tracker-pwa.md` |
| 40_Decisions | `decision_YYYY-MM-DD_<slug>.md` | `decision_2026-06-05_vault-location.md` |
| 60_Failures | `failure_YYYY-MM-DD_<slug>.md` | `failure_2026-05-17_heartbeat-loop.md` |
| 20_Projects | `<project-slug>.md` | `second-brain.md` |
| 50_Knowledge | `<topic-slug>.md` | `obsidian-dataview-basics.md` |
| 70_Prompts | `prompt_<slug>.md` | `prompt_task-start-checklist.md` |
| 80_Agents | `agent_<name>.md` | `agent_shiro.md` |

スペースは使わずハイフン区切り。日付は ISO 8601（`YYYY-MM-DD`）。

## 8. MEMORY.md Connection Rules

既存memory配下のファイルとObsidian vaultの接続方針。

| 既存ファイル | vault対応 | 方針 |
|---|---|---|
| `MEMORY.md` (インデックス) | vault外維持 | Claude Codeが読む専用インデックス。vaultへコピー不要。 |
| `memory/feedback_*.md` | `50_Knowledge/` または `40_Decisions/` | 運用ルールは `50_Knowledge/`、判断基準は `40_Decisions/` へ対応ノートを作る |
| `memory/project_*.md` | `20_Projects/` | プロジェクトノートとして移植 |
| `memory/user_*.md` | `80_Agents/agent_shiro.md` | Shiro自己プロファイルとして統合 |
| `memory/reference_*.md` | `50_Knowledge/` | 参照先情報として管理 |

**双方向同期は行わない。** Obsidianは人間可読の長期記録、`memory/` はClaude Codeが即参照するショートサマリー。役割が異なる。

## 9. Core Templates

### Daily Note

```markdown
# Daily - YYYY-MM-DD

## 3-line Summary
- Done:
- Tomorrow:
- Risk:

## Work Log

## Decisions

## Failures / Issues

## Ideas

## Carryovers
```

### Decision Log

```markdown
# Decision - <title>

Date:
Asked by:
Context:

## Question

## Decision

## Criteria

## Next Self-Run Conditions

## Ask Again If

## Related Notes
```

### Failure Log

```markdown
# Failure - <title>

Date:
Severity:
Owner:

## What Happened

## Why It Happened

## Prevention

## Rule Update

## Follow-up
```

### Task Note

```markdown
# Task - <title>

Priority:
Owner:
Backup:
Status:
ETA:
Depends on:

## Goal

## Done Definition

## Current State

## Next Action

## Risks

## Log
```

### Project Note

```markdown
---
type: project
date: YYYY-MM-DD
tags: []
status: active
owner: shiro
related: []
---

# Project - <title>

## Goal

## Stakeholders

## Status

## Key Decisions
- [[decision_YYYY-MM-DD_slug]]

## Known Failures
- [[failure_YYYY-MM-DD_slug]]

## Active Tasks
- [[task_slug]]

## Notes
```

### Knowledge Note

```markdown
---
type: knowledge
date: YYYY-MM-DD
tags: []
status: active
owner: shiro
related: []
---

# <title>

## Summary

## Details

## Examples

## Limitations / Caveats

## References
```

### Weekly Review

```markdown
---
type: weekly
date: YYYY-MM-DD
tags: [weekly-review]
status: active
owner: shiro
---

# Weekly Review - YYYY-Www

## Week Summary
- Completed:
- Unfinished:
- Unexpected issues:

## Decision / Failure Log Review
- New decisions this week: [[]]
- New failures this week: [[]]
- Rules updated: 

## Self-Run Progress
- Topics I was able to decide independently:
- Topics I still needed to ask about:

## Next Week Top 3
1. 
2. 
3. 

## Risks Heading Into Next Week
```

### Task Start Checklist

```markdown
---
type: task
date: YYYY-MM-DD
tags: []
status: active
owner: shiro
related: []
---

# Task - <title>

Priority:
Owner:
Backup:
Status:
ETA:
Depends on:

## Goal

## Done Definition

## Pre-Start Checklist
- [ ] Related project note reviewed: [[]]
- [ ] Similar failure logs checked: [[]]
- [ ] Existing decision logs checked: [[]]
- [ ] Risks identified and written below

## Current State

## Next Action

## Risks

## Log
```

## 10. Operational Workflow

### Task Start

1. 関連プロジェクトノートを確認する
2. 類似する失敗ログを確認する
3. 既存の判断ログを確認する
4. 必要ならタスクノートを作る
5. 完了条件とリスクを明記する

### During Work

1. 重要な判断を `40_Decisions/` に残す
2. 失敗・指摘は即座に `60_Failures/` のドラフトにする
3. 重要な発見はプロジェクトノートまたは知識ノートに接続する

### Task Completion

1. 完了条件を満たしたか確認する
2. 動作確認結果を残す
3. ロールバック可能性を記録する
4. 関連ドキュメント更新を記録する
5. 次の提案を1つ以上残す

### Daily Close

1. 3行サマリーを書く
2. 未完了タスクを整理する
3. 明日の最重要を1つ決める
4. リスクを明記する

## 11. Automation Candidates

### Phase 1: Manual First

- Markdownテンプレートを作成
- 重要ログを手動で保存
- 既存 `MEMORY.md` と日次 `memory/YYYY-MM-DD.md` をObsidian構造に対応させる

### Phase 2: Semi-Automation

- Discordスレッド要約をInboxへ保存
- Daily Noteの自動作成
- タスク完了時のDecision/Failure記録チェック
- 類似失敗検索のコマンド化

### Phase 3: Second Brain Integration

- Obsidian vaultをSecond Brainの取り込み対象にする
- 判断ログ、失敗ログ、日次ログをSecond Brain側のDocument/Task/Agent Memoryへ対応させる
- タスク開始時に関連ノートを自動提示
- 判断ログから自走条件を抽出する

## 12. Risk Boundaries

事前確認が必要:

- 外部公開
- 本番環境変更
- 課金増
- 削除系操作
- 個人情報・認証情報の保存方式変更
- Discord/Telegramへの自動投稿

自走可能:

- ローカルMarkdown作成
- テンプレート追加
- 要件定義更新
- 既存ルールの整理
- 非公開の作業ログ保存

## 13. Definition of Done

v0.3の完了条件:

- 要件定義Markdownが作成されている
- 初期vault構成が決まっている
- 最低限のテンプレートが定義されている
- 運用フローがタスク開始、作業中、完了、日次で定義されている
- 自動化候補がPhase分けされている
- 未決事項が明記されている

## 14. Open Questions

- **[決定] Obsidian vaultの実体はどこに置くか** — 初期vaultは `/Users/umi/.openclaw/workspace/second-brain/obsidian-vault/` に置く
- **[決定] Second Brainへ寄せるか** — Second Brainアプリが機能するなら、主系はSecond Brainへ寄せる。Obsidianは補助層として維持する
- **[未決] `memory/` をvaultに含めるか** — `~/.claude/projects/.../memory/` はClaude Code用ショートサマリーとして分離維持が推奨。Obsidianはその長期版として明確に役割分離する方針でよいか確認する
- **[未決] Discord/Telegramログの保存範囲** — 個人情報・認証情報を含まない会話要約のみ許可とするか、範囲をRyoさんに確認する
- **[未決] 同期方式** — Obsidian Sync / Git / iCloud / ローカルのみ。v0.1はローカルのみで開始し、同期はv1以降とする方針を確認する
- **[未決] RAG除外範囲** — 将来RAG化する場合に `80_Agents/` の個人プロファイルを除外するかを決める
- **[未決] マルチエージェント共有** — Sora/Ao/Kuroの記録も同じvaultにするか、Shiro専用にするか

## 15. Next Implementation Tasks

優先度順。

1. [x] Obsidian vaultの配置方針を決める（`second-brain/obsidian-vault/`）
2. [x] 上記フォルダ構成を実ディレクトリとして作成する
3. [x] `templates/` にSection 8のテンプレートファイルを配置する
4. [ ] `80_Agents/agent_shiro.md` に既存memoryのShiro関連情報を統合する
5. [ ] 既存memoryの重要判断・失敗をvault `40_Decisions/` または `60_Failures/` に対応ノートとして作成する
6. [x] 最初の日次ノート（`10_Daily/YYYY-MM-DD.md`）を手動作成して運用を開始する
7. [ ] Second Brainアプリ側の取り込み方式を確認する
8. [ ] vault内MarkdownをSecond BrainのDocument/Memory/Taskへ対応づける設計を作る
