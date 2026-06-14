# Second Brain WIP — 不足テスト候補一覧 (2026-05-17)

WIP の新規/変更箇所のうち、**Node ランナーで動く純粋関数テスト**として安全に追加できる候補。worker-pool 環境依存(D1/AI binding)は含まない。Yakon 承認後に投入することで、現在の `defaultTests`(5 ファイル / 42 テスト) を最低限拡充できる。

## 優先度マトリクス

| # | 対象関数 | ファイル | 純粋性 | 値打ち | 投入コスト | 推奨度 |
|---|---|---|---|---|---|---|
| 1 | `isWeeklyDigestDue` | `apps/api/src/index.ts` | 純粋 | 高(cron quota 統合の根幹ロジック) | 低(export 1 行 + 新規 spec) | **★最優先** |
| 2 | `memorySourceSafetyFlags` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 高(プライバシー判定の核) | 低 | ★高 |
| 3 | `eventSafetyFlags` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 中 | 低 | ★高 |
| 4 | `buildDiscordSyncPlan` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 高(0054 マイグレーション直結) | 中 | ★高 |
| 5 | `recommendAgent` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 中 | 低 | 中 |
| 6 | `buildMetadataOnlyMemorySources` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 中 | 低 | 中 |
| 7 | `limitParam` | `apps/api/src/routes/agent-command.ts` | 純粋(既に export 済) | 低(境界値) | 低 | 中 |
| 8 | `likePattern` | `apps/api/src/routes/agent-command.ts` | 純粋(unexported) | 中(SQL エスケープ) | 低(export 追加要) | 中 |
| 9 | `isAllowedMemorySourcePath` | `apps/api/src/routes/agent-command.ts` | 純粋(unexported) | 高(セキュリティ) | 低(export 追加要) | ★高 |

→ **★最優先 + ★高 を最低でも 6 件投入**すれば WIP の品質保証は劇的に向上する。

---

## 1. `isWeeklyDigestDue` — 投入準備済 draft

(sb-prep-kit-2026-05-17.md §7 と同等、ここに再掲)

### 差分

```diff
# apps/api/src/index.ts
-function isWeeklyDigestDue(event: ScheduledEvent, now = new Date()): boolean {
+export function isWeeklyDigestDue(event: ScheduledEvent, now = new Date()): boolean {
```

```diff
# apps/api/vitest.config.ts
 const defaultTests = [
   'src/routes/agent-command.test.ts',
   'src/tests/cursor.test.ts',
   'src/tests/diff.test.ts',
+  'src/tests/weekly-digest-due.test.ts',
   'tests/health.test.ts',
   'tests/planLimits.test.ts',
 ];
```

### 新規ファイル `apps/api/src/tests/weekly-digest-due.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { isWeeklyDigestDue } from '../index';

type EventLike = { cron: string };
const ev = (cron: string): EventLike => ({ cron });

describe('isWeeklyDigestDue', () => {
  it('returns true for the dedicated weekly cron', () => {
    expect(isWeeklyDigestDue(ev('0 9 * * 1') as never, new Date('2026-03-05T05:00:00Z'))).toBe(true);
  });

  it('returns true for hourly cron on Monday 09:00 UTC', () => {
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-02T09:00:00Z'))).toBe(true);
  });

  it('returns false for hourly cron outside Monday 09:00 UTC', () => {
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-02T10:00:00Z'))).toBe(false);
    expect(isWeeklyDigestDue(ev('0 * * * *') as never, new Date('2026-03-03T09:00:00Z'))).toBe(false);
  });

  it('returns false for an unrelated cron expression', () => {
    expect(isWeeklyDigestDue(ev('30 * * * *') as never, new Date('2026-03-02T09:30:00Z'))).toBe(false);
  });
});
```

---

## 2. `memorySourceSafetyFlags` — draft

```typescript
// apps/api/src/tests/memory-source-safety-flags.test.ts
import { describe, expect, it } from 'vitest';
import { memorySourceSafetyFlags } from '../routes/agent-command';

describe('memorySourceSafetyFlags', () => {
  it('marks metadata-only when safetyNotes contains the keyword', () => {
    const r = memorySourceSafetyFlags({ sourceType: 'file', importStatus: 'imported', safetyNotes: 'metadata-only sync' });
    expect(r.metadataOnly).toBe(true);
    expect(r.contentIngested).toBe(false);
  });

  it('marks metadata-only when importStatus is indexed', () => {
    const r = memorySourceSafetyFlags({ sourceType: 'file', importStatus: 'indexed', safetyNotes: null });
    expect(r.metadataOnly).toBe(true);
  });

  it('marks contentIngested for imported file with no metadata-only note', () => {
    const r = memorySourceSafetyFlags({ sourceType: 'file', importStatus: 'imported', safetyNotes: null });
    expect(r.contentIngested).toBe(true);
    expect(r.metadataOnly).toBe(false);
  });

  it('flags non-file sources as may-contain-private', () => {
    const r = memorySourceSafetyFlags({ sourceType: 'plaud', importStatus: 'imported', safetyNotes: null });
    expect(r.mayContainPrivateData).toBe(true);
  });

  it('flags needs_redaction as requiring redaction', () => {
    const r = memorySourceSafetyFlags({ sourceType: 'file', importStatus: 'needs_redaction', safetyNotes: null });
    expect(r.requiresRedactionBeforeContentIngest).toBe(true);
  });
});
```

(`MemorySource` 型と `safetyNotes` の null 許容を WIP コードで確認のうえ調整)

---

## 3. `isAllowedMemorySourcePath` — draft

```diff
# apps/api/src/routes/agent-command.ts
-function isAllowedMemorySourcePath(path: string): boolean {
+export function isAllowedMemorySourcePath(path: string): boolean {
```

```typescript
// apps/api/src/tests/memory-source-path-allowlist.test.ts
import { describe, expect, it } from 'vitest';
import { isAllowedMemorySourcePath } from '../routes/agent-command';

describe('isAllowedMemorySourcePath', () => {
  it.each([
    ['memory/2026-05-17.md', true],
    ['memory/2026-12-31.md', true],
    ['memory/not-a-date.md', false],
    ['memory/2026-05-17.txt', false],
    ['../etc/passwd', false],
    ['memory/../README.md', false],
    ['', false],
  ])('isAllowedMemorySourcePath(%p) === %p', (input, expected) => {
    expect(isAllowedMemorySourcePath(input)).toBe(expected);
  });

  // ROOT_MEMORY_FILES (MEMORY.md / IDENTITY.md など) は別途 it で追加
});
```

(WIP の `ROOT_MEMORY_FILES` の中身を確認のうえ、それぞれ true を返すケースを追加)

---

## 4. `buildDiscordSyncPlan` — draft 雛形

```typescript
// apps/api/src/tests/discord-sync-plan.test.ts
import { describe, expect, it } from 'vitest';
import { buildDiscordSyncPlan } from '../routes/agent-command';
import type { DiscordWatchSource } from '../routes/agent-command';

const src = (over: Partial<DiscordWatchSource> = {}): DiscordWatchSource => ({
  id: 'src1',
  sourceType: 'channel',
  channelId: 'ch1',
  displayName: 'general',
  status: 'watching',
  watchMode: 'channel_and_threads',
  ...over,
});

describe('buildDiscordSyncPlan', () => {
  it('emits no plan entries when input is empty', () => {
    expect(buildDiscordSyncPlan([]).items).toEqual([]);
  });

  it('skips sources with status="paused"', () => {
    const plan = buildDiscordSyncPlan([src({ status: 'paused' })]);
    expect(plan.items).toHaveLength(0);
  });

  it('includes watching sources', () => {
    const plan = buildDiscordSyncPlan([src({ status: 'watching' })]);
    expect(plan.items).toHaveLength(1);
  });

  // WIP の DiscordSyncPlan 型を確認のうえ、watch_mode 分岐や thread 個別 sync の挙動を追加
});
```

---

## 5. `recommendAgent` / `limitParam` — 短く

`limitParam` は数値クランプの境界値テストで完結(0/負/1/49/50/51/9999 → fallback or clamp 動作確認)。`recommendAgent` は文字列マッチに依存するルーティング、引数バリエーションで挙動確認。

---

## 6. 投入手順

1. Yakon 承認(本書 §1 のどれを投入するか)
2. `apps/api/src/index.ts` / `agent-command.ts` の必要な `export` 追加
3. `apps/api/src/tests/*.test.ts` を新規作成
4. `apps/api/vitest.config.ts` の `defaultTests` 配列に追加
5. `pnpm vitest run --reporter=dot` で 42 + N pass を確認
6. Yakon 承認後に commit/push(prep kit §3 の commit 分割案に新 commit を追加)

---

## 7. 注意

- これらは WIP オーナー(Ao)に黙ってマージすると上書き競合の元 → 承認後は **必ず WIP commit が確定してから** 投入
- worker-pool 系の 186 fail は本書スコープ外(integration テスト harness 整備が必要、別 PR)
- 本書のテスト draft は最終形ではなく **着手たたき台**。実装中に WIP のシグネチャ変更があれば追従要
