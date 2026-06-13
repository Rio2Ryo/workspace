# Management Snapshot

Updated: 2026-05-17 21:03:41

## claude — 不明
- Thread: <#1501366244174069904>
- Project: `second-brain`
- Git: branch=shiro/phase2-perf-metrics, changed_files=32
- Deploy: デプロイURLなし/不明
- 未検証項目)— ps -A | grep chromium ベースの軽量ヘルスチェック関数追加

## codex — 完了/待機
- Thread: <#1501366333886042346>
- Project: `second-brain`
- Git: branch=shiro/phase2-perf-metrics, changed_files=32
- Deploy: デプロイURLなし: Second Brain preview/deployは承認待ち。
- - pnpm -C second-brain/apps/web build 成功。既存React Hooks warningは継続、
- 残ブロッカー / 確認URL作成には preview push/deploy承認が必要です。リモートE2E
- を実行する場合も ALLOW_REMOTE_E2E=1 の明示承認が必要です。
- 次に攻めるべき課題 / PlaywrightのShiro Daily専用specを追加し、ローカル環境で
- ブラウザレベルで検証できるようにすること。

## restaurant-sales-intel — 完了/待機
- Thread: <#1501399826397532231>
- Project: `projects/restaurant-sales-intel`
- Git: branch=main, changed_files=11
- Deploy: デプロイURLなし: GitHub/Vercel外部反映は承認待ち。
- - node scripts/test-outreach-api.mjs 成功
- - npm test 成功
- - npm run build 成功
- 残ブロッカー:
- 次に攻めるべき課題:

## daily-report-codex — 完了/待機
- Thread: <#1505429154215100507>
- Project: `projects/daily-report-app`
- Git: branch=shiro/phase2-perf-metrics, changed_files=168
- Deploy: デプロイURLなし: Vercel/DB/env/秘密値投入が未実施。preview deployには明示承認が必要。
- - pnpm test 成功
- - pnpm typecheck 成功
- - pnpm build 成功
- 残ブロッカー: 実Postgres接続、Vercel env設定、deploy、秘密値投入は未実施。
- 次に攻めるべき課題: Second Brain APIの limit/cursor/status/updatedSince フィル

## hermes-jp — 完了/待機
- Thread: <#1501359734203089127>
- Project: `projects/top3-favorites`
- Git: branch=shiro/phase2-perf-metrics, changed_files=168
- Deploy: デプロイURLなし: 外部公開/Vercel deploy未実施。preview deployには明示承認が必要。ローカルE2Eは可能。
- - Build: pnpm build → 成功
- 残ブロッカー:
- - 4180番ポートは既存nodeが使用中のため、検証は引き続き PORT=4181 で実施しま
- 次に攻めるべき課題:
- - export実ファイルの内容検証をPlaywrightで追加し、import/export往復のQAを自

## slide-tool-codex — 完了/待機
- Thread: <#1505385904825696317>
- Project: `slide-tool`
- Git: branch=shiro/phase2-perf-metrics, changed_files=168
- Deploy: デプロイ対象ではなくローカル生成物中心。公開URLなし。
- 変更ファイル:
- 実行したテスト:
- 残ブロッカー: なし。
- 次に攻めるべき課題: PPTX内部テキスト抽出は <a:t> ベースなので、画像化された文

## threads-watcher — 常駐監視中
- Thread: <#1472105365138309172>
- Project: `projects/threads-watcher`
- Git: branch=shiro/phase2-perf-metrics, changed_files=168
- Deploy: 公開status URLは未確認/未反映。ローカル監視はDB/logで確認。
- [done] @hal.lifedesign found=15 new_saved_to_db=0 at=2026-05-17T11:58:22Z
- [done] @hal.lifedesign found=15 new_saved_to_db=0 at=2026-05-17T11:59:29Z
- [done] @hal.lifedesign found=15 new_saved_to_db=0 at=2026-05-17T12:00:35Z
- [done] @hal.lifedesign found=15 new_saved_to_db=0 at=2026-05-17T12:01:40Z
- [done] @hal.lifedesign found=15 new_saved_to_db=0 at=2026-05-17T12:02:46Z

## top3-goose — 完了/待機
- Thread: <#1505419396691267584>
- Project: `projects/top3-favorites`
- Git: branch=shiro/phase2-perf-metrics, changed_files=168
- Deploy: デプロイURLなし: 外部公開/Vercel deploy未実施。preview deployには明示承認が必要。ローカルE2Eは可能。
- - 修正後: 成功
- t/export UI exists"` 成功
- - `pnpm build` 成功
- - **残ブロッカー**:
- - **次に攻めるべき課題**:
