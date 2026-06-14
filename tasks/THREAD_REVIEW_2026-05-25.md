# Thread Review 2026-05-25

目的: 各Discord作業スレッドを、確認待ちではなく「次に何を進めるか」で管理する。

## 判断基準
- 外部公開、本番設定変更、課金増、削除、秘密値投入は確認対象。
- 調査、原因切り分け、ローカル修正、テスト、下書き、担当者への具体指示は自走対象。
- 一度確認された判断は、次回から同条件で確認しない。

## Active / Needs Action

### tmux-web-view
- Thread: `1501400748427051029`
- 状態: Done / production verified
- 観測: Second Brain API直叩きでは `task_yakon_` が40件存在。本番 `tmux-web-view` の `/api/tasks` は404。Vercel production envには `SECOND_BRAIN_API_KEY` が無いが、Second Brain `/tasks` は公開readで200を返す。
- 判断: DB差分ではなく、WebView本番デプロイに `app/api/tasks` が反映されていない。さらに route 側で API key 必須にすると本番反映後も500になるため、keyがある場合だけ `X-API-Key` を付ける実装に修正。
- 実施: `/Users/umi/.hermes/workspace/tmux-web-view/app/api/tasks/route.ts` と画面側のSecond Brain DBマージ表示を修正。local `npm run build` pass。local `/api/tasks?limit=45` で `task_yakon_` 40件確認済み。production deploy `dpl_4xbV7RAk1w7FCfVK2hJuBpJYuVjR` を `https://tmux-web-view.vercel.app` にalias済み。本番 `/api/tasks?limit=45` で `task_yakon_` 40件確認済み。
- 追加実施: Yakonさん判断により、運用ルールを「Discord thread名 = tmux session名」に統一。Discord上で `top3-favorites-app` → `top3-goose`、`daily-report-app` → `daily-report-codex` に変更。WebView UIは session/thread 名と agent 名を別表示に変更し、複数sessionが同じDiscord threadを共有している場合は1:1未設定として警告表示する。production deploy `dpl_FCCRmLNd9wiEC1FyBiE4Sw2j97L5` を `https://tmux-web-view.vercel.app` にalias済み。本番 `/api/tasks?limit=45` は `task_yakon_` 40件確認済み。
- 次アクション: なし。次は担当別tmux割り当て設計に進める。
- 次回からの自走条件: tmux運用スレッドは原則 `threadName === tmuxSession` にする。agent名・案件名・説明はWebViewの別フィールドで表示し、スレッド名へ混ぜない。既存本番機能の同一スコープ修正として明示承認済みなら、build通過後にdeployまで進める。

### top3-favorites-app
- Thread: `1505419396691267584`
- 状態: Stale / needs fresh direction
- 観測: threadは5/22以降、IDLE監視ログで停止。`tasks/QUEUE.md` にはtop3のReadyがある。
- 次アクション: 対応可能なセッションにReadyタスクを割り当て、実装/テスト/報告まで要求する。

### [DONE]たこおきMap メンテナンス
- Thread: `1504720363215654983`
- 状態: Reopened
- 観測: 公開は完了。ただし最後の判断は「基本的にシステム作るときはDB永続化」。
- 判断: このスレッドはDONEではなく、DB永続化方針を反映する改善タスクとして扱う。
- 次アクション: DB/API方式の最小設計を作り、無料/既存基盤で可能な範囲と本番変更が必要な範囲を分ける。
- 次回からの自走条件: 新規/既存システムで永続データがある場合、localStorageのみは原則NGとしてDB永続化を標準要件に入れる。

### cycle-tracker-app
- Thread: `1507900090742870097`
- 状態: Done / follow-up watch
- 観測: M/Y切替、既存A/Bデータ移行、build/test 17件OKまで報告済み。
- 残確認: 直前にPWA化の要望があるため、PWA未対応なら次のReady候補。

### food-dx-shiro
- Thread: `1508278506281369610`
- 状態: Ready / Shiro管理開始
- 観測: Yakonさんから食品受発注DXの引き継ぎ。ローカル実体は `/Users/umi/.openclaw/workspace/food-dx-qwen/food-dx-system`、Gitは `main`、remote未設定。`/inventory` は404。ログイン画面には `demo@example.com / demo1234` が表示されている。
- 既存記憶: 2026-03-19には GitHub `Rio2Ryo/food-dx-system` と公開URL `https://food-dx-system.common-gifted-tokyo.workers.dev` がある。今回のローカル実体と公開版が同一系列か差分確認が必要。
- 次アクション: モックデータ投入、日本語化後E2E、ナビ構造統一、Orders空状態CTA整理、remote/deploy有無確認。
- 次回からの自走条件: ローカル実装・E2E・スクショ確認は確認なしで進める。本番deploy/GitHub remote作成/既存公開URLの上書きは確認対象。

## Done / No Immediate Action
- ontrust 採用管理ツール引き継ぎ: done
- ontrust email-manager引き継ぎ調査: Cloudflare API token待ち。秘密値投入が必要なので確認対象。
- interaugh-homepage: done。ただし過去に文脈確認ミスあり。次回は履歴/Git/tmuxを先に確認。
- session cleanup: done。37件残存、削除対象0件、バックアップあり。
