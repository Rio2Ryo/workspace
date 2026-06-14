# QA レポート: security.test.ts 31 件 fail の切り分け

- 報告者: 白(Shiro)
- 日付(JST): 2026-05-17
- 対象 repo: `second-brain` (submodule)
- 対象ブランチ: `shiro/phase2-perf-metrics`
- 対象テスト: `apps/api/src/tests/security.test.ts`
- 実行モード: `RUN_WORKER_POOL_TESTS=1 pnpm vitest run`(`@cloudflare/vitest-pool-workers`)
- 観測時の WIP 主担当(推定): Ao(`feat: add agent command center mvp` 系の WIP 拡張)
- WIP 退避用 stash: `stash@{0}` — `shiro-qa-2026-05-17-security-test-bisect`(**未 drop、保険として残置**)

## 観測結果

| 状態 | テスト結果 |
|---|---|
| WIP 適用時 | 27 pass / 31 fail (合計 58) |
| WIP 退避時(stash 中) | file load 失敗 (`Failed to load url cloudflare:test`) → 0 tests 実行 |

## 切り分け結論

**31 件 fail の正体: テスト前提ズレ + 新規実行可能化されたテスト**

| 区分 | 件数 | 根拠 |
|---|---|---|
| WIP 由来の regression | 0 | WIP の `apps/api/src/index.ts` 差分は (a) CORS allow list に `3001` 追加 / (b) `isWeeklyDigestDue()` で weekly digest gating の 2 点のみ。auth middleware は触っていない |
| pre-existing prod バグ | 0 | 401 を返す側(auth middleware)の挙動は仕様通り |
| **テスト前提ズレ** | 31 | テスト群は「auth 前の不正リクエストでも 400 等が返る」想定で書かれていたが、現行 middleware 順序では auth 401 が先に返る。WIP が `vitest.config.ts` に worker pool 構成を追加して初めてこの file が実行可能になり、長年眠っていたズレが顕在化 |

## 代表的な fail パターン

- `Invalid JSON handling > POST with non-JSON content-type returns 400`
  - 期待: 400 / 取得: 401
  - 原因: 認証 middleware が body parse より前に走り、unauthenticated を 401 で打ち返している

(他 30 件もほぼ同パターン: 期待 4xx 系 vs 取得 401)

## 推奨アクション(Ao 向け)

1. `security.test.ts` の各 it を以下のいずれかで修正
   - (a) リクエストヘッダに有効な dev トークンを付与して auth を通過させてから境界値テストする
   - (b) auth middleware 不要のパスをテスト対象にする
   - (c) 期待値を 401 に更新し、別 describe で「auth 通過後の validation 挙動」を新規追加
2. 修正方針確定後、`RUN_WORKER_POOL_TESTS=1` を CI に組み込み、再発防止
3. WIP が commit された後、stash `shiro-qa-2026-05-17-security-test-bisect` は drop して良い

## 副次的所見

- `docs/DEPLOY.md` と `docs/deploy.md` の二重 tracking は macOS APFS の case-insensitive FS と git の永続的不整合(repo の古い quirk)。今回の QA とは無関係だが、commit 前にどちらかに統一しておく方が綺麗
- WIP の cron quota 統合(`crons = ["0 * * * *"]` + `isWeeklyDigestDue` ゲーティング)は副作用なし、`sendWeeklyDigest` の旧多重発火バグも同時に解消されている(前ターン検証済)

## 補足

- 本レポートは白(Shiro)のローカル観測のみ。Discord 等への通知投稿は別途 Yakon さんの承認が必要なため未実施
- WIP オーナーの確定および commit 分割方針は依然 Yakon 判断待ち
