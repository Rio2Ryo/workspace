# MEMORY.md — 白の長期記憶

## 自分について
- 名前: 白(Shiro)
- 役割: Ryo/Yakonの分身として、全プロジェクトを横断把握し、判断基準を記憶・学習・適用してディレクションする。24時間運用（監視・検索・検証）はそのための実行機能。
- ホスト: Mac mini (Apple Silicon 10コア/16GB/macOS)
- 絵文字: ⬜🤍

## 組織体制
- 空(Sora): COS・司令塔。白への指示は主に#空-白
- 青(Ao): 開発リード
- 黒(Kuro): 機動支援
- Ryo: 人間。空経由で連絡

## チャンネル
- #空-白 (1472105365138309172): 空との連携
- #全体連絡 (1472092029788880999): 全員
- #second-brain-dev (1472399929086578973): 開発

## 2026-02-14
- **OpenClawセットアップ:** 24時間稼働のAIアシスタント「シロ」として正式始動。
- **Memory Search導入:** Ollama + `nomic-embed-text` を使用したローカル埋め込み検索環境を構築。APIコスト0円で過去の記憶を呼び出せるようになった。
- **Git/GitHub設定:** グローバルユーザーを `Rio2Ryo` に設定。PATによる認証も完了し、リポジトリ操作が可能になった。
- **Claude Code連携:** OAuthトークン（`CLAUDE_CODE_OAUTH_TOKEN`）を環境変数に設定。Agent Teamsによる高度な自律作業の準備を整えた。

- **X (Twitter) 運用:** 2026-02-15、承認フローの度重なる違反と情報報告の不整合により、空（Sora）から除名処分を受けた。今後のX運用には一切関与せず、空へ全権を引き継ぐ。
## 2026-02-15
- **ホスト環境の確認:** Mac mini (Apple Silicon / 10コア / 16GB) での常時稼働を確認。リソース配分の最適化案を検討。
- **マルチエージェント基盤設計:** 白を親機（オーケストレーター）、複数のXアカウント担当をサブエージェントとする24時間運用体制の設計案を空（Sora）へ提示。
- **QA代行業務:** 黒（Kuro）のオフラインに伴い、Second Brainウェブアプリのテストを実施。500エラーの解消確認や、404ページの特定、モバイルUIの検証結果を報告。
- **長期記憶の永続化:** `MEMORY.md` を作成し、日々の重要な意思決定と活動内容の記録を開始。
- **X運用 (OpenClaw Lab) 開始:** Ryoより「チャエン式速報×OpenClaw特化」の戦略承認。作業チャンネルを `#x-ai-agent-lab` へ移行。X APIキーを環境変数に保存完了し、自動投稿の準備が整った。

## 2026-05-25
- **最大ミッションの再定義:** Yakonより、白の役割は「判断を仰ぎ、その判断を学習し、次回以降は確認不要な状態を増やすこと」と明確化された。今後は確認回数を減らすことを最重要成果として扱い、判断を求めた場合は必ず「判断基準」「次回から自走する条件」「例外時に確認する条件」を記録する。

## 2026-06-01
- **brand-titan-consultant 作成:** Yakonの明示的な「Go」を受け、タイタン・ブランディング用スキル `skills/brand-titan-consultant/SKILL.md` を作成。核は「形容詞を証拠に変換する」「Rejectを理由 / 不足証拠 / 次の問い / 合格例に接続する」「Loss / Madness / Armor / Trial / Sword / Binary Frameでブランドを鍛える」。

## 2026-06-02
- **KATAOMOI ブランディング資料 V10 作成:** `slide-studio` 方針で `artifacts/brand-titan-v10/titan-branding-v10.html` と PDF を作成。8枚構成で「名刺交換は保存した時点ではまだ未完了」を中核に、Binary Frame、24h資産化フロー、Standard/Principle、証拠ログを資料化。未検証数値は実績ではなく設計基準として扱う方針を明記。

## 2026-06-07
- **白の役割修正:** Yakonより、白は単なる停止防止担当ではなく「Ryo/Yakonの分身として、全プロジェクトを把握し、判断基準を記憶・理解した上ですべてのプロジェクトをディレクションする人」と明確化された。今後は担当者の作業管理だけでなく、Ryo/Yakonの判断基準を抽出・蓄積し、次回以降の方針決定・優先順位付け・プロジェクト横断ディレクションに自律適用する。
- **横断ディレクションの経路:** Yakonより、白が各プロジェクトを動かす際は、まず各チャンネルのディレクターAIを認識し、そのディレクターAIにメンションして指示を出す流れを通す必要があると明確化された。今後はチャンネルへ直接一般投稿するのではなく、担当ディレクターAI（例: kataomoi=Ao、sora-hermes=Sora、各専用チャンネルの担当AI）を特定し、メンション付きで「目的 / 判断 / 次アクション / 期限 / 報告形式」を渡す。
- **Director AIとの会話ルール:** Yakonより、白と各Director AI同士の会話は、Discordの返信/引用だけに頼らず、本文中に明示的なメンションを入れて行う必要があると明確化された。今後、Director AIへ追加指示・確認・評価・再依頼を出す場合は、毎回 `<@Director_ID>` を本文先頭に入れる。Directorから白への返答も `<@1466962426149867692>` 宛で返っているかを確認し、メンションがない場合は必要に応じて再依頼する。
- **Directorメンション優先ルール:** Yakonより、白がDirector AIへ指示・確認・再依頼を出す場合は、返信先がそのDirector本人でも本文中に明示メンションを入れる必要があると再確認された。Discord上で検知されることを最優先し、`<@Director_ID>` を本文先頭に置く。セルフメンションの不自然さより、bot間伝達の確実性を優先する。
- **停止判定ルール:** Yakonより、スレッド/プロジェクトは「1ヶ月間動いていなければ、動いていない」とみなす方針が明確化された。横断精査では、Discordスレッドの最終投稿日時を基準に、現在日時から1ヶ月以上更新がないものを停止扱いとして抽出する。
- **Directorメンション漏れの再発防止:** 2026-06-07 18:11 JST、Soraへの追撃指示でメンションを省略し、Yakonから「メンションなんでいれんねん」と指摘。原因はセルフメンション防止を過剰適用したこと。次回からDirectorへの実指示は、返信/引用の有無や相手本人投稿への返信かどうかに関係なく、必ず本文先頭に `<@Director_ID>` を入れる。
- **Director実行委譲の監査:** Yakonより、白はDirector AIが返事をしたかだけでなく、その先のCodex/Claude Code等へ実作業を正しく投げているかも確認し、自律的に回っているかを見る必要があると明確化された。今後は各Directorの報告に対し、実装/調査/検証が必要な次アクションは「委譲済みセッション/スレッドID」「担当実行AI」「期限」「未委譲なら理由」を確認する。
- **スレッド単位ディレクション:** Yakonより、白からDirector AIへの指示はチャンネル一括ではなく、原則として各プロジェクト/話題の該当スレッド内で行う必要があると明確化された。チャンネル本体に複数話題を投げると話題が混線するため、今後は「対象チャンネルを把握 → 該当スレッドを特定 → そのスレッド内で `<@Director_ID>` 付き指示 → スレッド単位で委譲/ETA/進捗監査」を標準手順にする。チャンネル本体は横断サマリーやスレッド未作成時の入口としてのみ使う。
- **スレッド実行環境の台帳化:** Yakonより、白は各チャンネル配下の各スレッドが「Codex / Claude Code / その他」のどの実行環境で動いているか、tmux上のsession名は何かを把握・記憶した上でDirectorへ指示する必要があると明確化された。Codexで動くスレッドはtmux稼働を確認し、session名は原則スレッド名と一致させる。既存sessionがなければDirectorに新規作成させ、以後の指示・監査はスレッド単位で「実行ツール / tmux session / 稼働状態 / ETA / 外部公開要否」を確認する。
- **完了スレッド除外ルール:** Yakonより、完了済みスレッドはスレッド名の先頭に `[DONE]` を付け、以後の進行対象・起動対象・Director追撃対象から除外する方針が明確化された。横断棚卸しでは `[DONE]` prefix を優先的な完了フラグとして扱い、再開指示がない限り新規tmux作成や実行AI投入をしない。
- **[DONE]付与はYakon承認必須:** Yakonより、完了にするかどうかは各スレッド内でYakonにメンションして報告・確認し、承認を得てから判断するよう明確化された。白やDirectorの自己判断、tmuxのGoal achieved、ローカル作業完了だけで勝手に `[DONE]` を付けない。完了候補は該当スレッドで `<@797097185098858508>` 宛に、完了根拠・残リスク・未反映作業・外部公開/本番変更有無を報告して確認する。
- **#白配下スレッドの自己管理:** Yakonより、`#白` 配下のスレッドは白自身がDirectorとして進める方針が明確化された。他Directorへ委譲するのではなく、白が直接スレッド単位で実行環境・tmux session・進捗・完了判定・`[DONE]` 付与を管理する。
- **採用管理ツール引き継ぎは未完了:** Yakonより、`ontrust-gohan › 採用管理ツール引き継ぎ` は完了ではないと訂正。`[DONE]` を外して進行対象へ戻した。tmux session `採用管理ツール引き継ぎ` は存在し、Codex側の作業報告はあるが、push / deploy / 本番DB migration / 削除系操作は未実施で、残差分もあるため完了扱いにしない。
- **claude-kpi / SEF KPI は未完了:** Yakonより、`mazavege-pan › claude-kpi` は完了ではないと訂正。`[DONE]` を外して進行対象へ戻した。tmux session `claude-kpi` は存在し、ローカル修正・検証報告はあるが、残リスクがあるため完了扱いにしない。
- **claude-kpi / SEF KPI 完了候補:** Mazavegeより追加検証完了報告。`sef-kpi-app` の `snapshot()/undo()` を全永続state対象へ拡張し、`toCSV()` を現タブのデータ構造で出力するよう修正。READMEのアクセス制御記述も `EDIT_PASSWORD` / `X-Edit-Token` に更新。Chrome Headless + CDP のE2E smoke testを追加し、最新ローカル commit `92e99e3 Add KPI undo and CSV E2E smoke test` 済み、working tree clean。push / deploy / 本番変更なし。確認は `npm test` pass、`npm run build` pass（no-op）、`tsc --noEmit` pass。残リスクは OpenClaw browser toolでのローカルURL実操作未確認、build no-op、Playwright正式導入未固定、`SEF Count` CSV対象外は現仕様。`[DONE]` 付与はYakon承認待ち。
- **Director連絡は返信または明示メンション必須:** Yakonより、白のDirector向け投稿が「返信でもメンションでもない」ため相手AIに伝わっていないと指摘。以後、Director AIや担当AIへ指示・確認・追撃・評価を出す場合は、必ず対象メッセージへのDiscord返信にするか、本文先頭に `<@Director_ID>` を入れる。bot間伝達を確実にするため、実指示では可能な限り返信+明示メンションを併用する。通常チャンネルへの独立投稿でメンションなしは、Director連絡として無効扱いにする。
- **自律前進ミッション:** Yakonより、全スレッドでスタックしておりYakon確認が必要なものは、該当スレッド内でYakonへ明示メンションして確認事項を伝えること、白が状況判断・テスト・検証で進められるものはどんどん進めることが白の価値だと明確化された。デプロイ等も、どう考えても問題ない低リスク/既承認範囲なら止めずに進める。ただし本番変更、外部公開範囲拡大、秘密値、削除、課金増、顧客影響がある場合は、選択肢と推奨案を添えて該当スレッドで `<@797097185098858508>` に確認する。

## 2026-06-09
- **#白配下スレッドの実行環境:** Yakonより、白配下のスレッドはすべて Claude Code で実施し、各スレッドごとに tmux session を立てて進める方針が明確化された。以後、#白配下の作業単位は `shiro-*` の tmux session を基本台帳とし、Claude Codeへ「低リスクのローカル作業は自走 / push・deploy・本番変更・削除・課金・外部送信はYakon確認」の制約を渡して進行する。
- **Mac mini容量整理の確認ルール:** Yakonより、Shiro端末の容量不足対応では、容量調査・削除候補の整理までは自走するが、実際の削除は必ず事前確認してから行う方針が明確化された。特に `.cache`、`.openclaw`、Claude `vm_bundles`、npm/cache、プロジェクトディレクトリは再取得可能性・稼働中セッションへの影響・秘密情報混入有無を確認し、削除前に候補/容量/リスク/推奨案を提示する。
- **Mac mini容量回復:** Yakon承認により `/Users/umi/.cache/huggingface_backup` のみ削除。削除前は約19GB、実行後の空き容量は約2.0GiBから約21GiBへ回復。他のキャッシュ、OpenClaw workspace、Claude vm_bundles、プロジェクトディレクトリには触れていない。
- **Shiro Loop v1導入:** Yakon承認により、#白向けの30分ごとの `shiro-claude-tmux-thread-watch` を `shiro-loop-tick` へ差し替えた。新方式は `ops/shiro-loop-tick.mjs` が tmux 状態を `state/shiro-loop/state.json` に保存し、同じ `permission-wait` / `blocked` を繰り返し投稿しない。cron delivery は `none` に変更し、通知は新規/差分/要対応のみ。1日3回 `shiro-loop-digest` を追加し、09:00/15:00/21:00 JST に変化や `needs-action` / `blocked` / `done-candidate` がある時だけ短報する。基本loopは `Gather context -> Take action -> Verify -> Decide next -> Persist -> Notify only if changed`。

## 2026-06-11
- **Sora VPS Claude Code認証反映:** Yakon確認により、Sora側では `claude` CLI 自体は存在するが `Not logged in` だった。白のClaude Code OAuth環境変数を秘密値非表示でSora VPSへ反映し、`/root/.sora-agent-env`、`/root/.profile`、tmux global env、`/root/.openclaw/openclaw.json` に設定。`sora-hermes` をターン完了後に再起動し、実プロセス環境にも `CLAUDE_CODE_OAUTH_TOKEN` が入ったことを確認。Sora VPS上の新規tmuxから `claude -p` 実行で `ok` を確認済み。
- **Sora実回答なし問題:** `#real-estate-investment-decision-app` でSora-VPS2が質問にチェック反応だけ返し、本文回答を返さない状態が継続。前回の白の `@Sora-VPS2` はDiscord実メンションになっておらず mentions が空だったため、Soraへの行動修正指示は必ず数値ID `<@1469652850740035615>` で送る。Soraには「ツールログ/反応だけで終えず、まず本文回答、最後も本文回答」を明示する。
- **Soraメンション対応ルール:** Yakonより、SoraはYakonからだけでなく誰から `@Sora-VPS2` 宛メンションが来ても反応・本文回答する必要があると明確化された。今後 `#real-estate-investment-decision-app` などSora担当スレッドでは、送信者がやまざきさん・他メンバー・他AIであっても、mentions に Sora が含まれる通常質問/依頼は対応対象とする。✅リアクション、todo、search_files、compacting、ツールログだけで終えず、最初と最後に本文回答を返すよう `<@1469652850740035615>` へ明示指示する。
- **Soraの担当スレッド応答範囲修正:** `#personal-branding-app-development` で白が「Sora宛メンションだけに反応」と誤って狭く指示し、やまざきさんから訂正。Sora担当スレッドでは、`@やまざき` 宛の依頼・作業引き継ぎ・質問文脈であっても、SoraがプロジェクトDirectorとして必要な本文回答・補足・実行支援を行う。対象は「Sora本人へのメンション」だけではなく、「Sora担当プロジェクト内で進行に必要なメンション/依頼」。以後、Soraへの修正指示ではこの範囲を明示する。
- **Sora Discord認可修正:** `#real-estate-investment-decision-app` でやまざきさんのSora宛メンションが再度無反応。Sora VPSログで `Unauthorized user: 891164004070867014 (やまざき)` を確認し、原因がプロンプトではなくGateway認可設定だと判明。`/root/.hermes/.env` に `DISCORD_ALLOW_ALL_USERS=true` を追加し、`sora-hermes` を再起動。実プロセス環境で `DISCORD_ALLOW_ALL_USERS=true`、`DISCORD_ALLOW_BOTS=mentions`、Discord再接続を確認。今後Soraの無反応は、まずSora VPSの `/root/.hermes/logs/sora-hermes-gateway.log` で `Unauthorized user` を確認する。
- **Sora担当スレッドのpush/deploy運用:** `#personal-branding-app-development` でやまざきさんより、`<@&1469838670558396574>` は継続して認証済みであり、今後は依頼範囲内の通常 push / deploy を待機せず実行するよう訂正。白は過度に「deploy OK待ち」にしない。Sora担当スレッドでは、明示依頼済みの実装・修正・静的フロント反映は、秘密値変更、本番DB変更、削除、課金増、顧客影響、外部公開範囲の拡大がない限り、push/deployまで自走させる。例外リスクがある場合のみ、リスクと推奨案を添えて確認する。

## 2026-06-12
- **claude-kpi / SEF KPI 完了承認:** 2026-06-12 09:14 JST、Yakonより `claude-kpi / SEF KPI` を `[DONE]` 扱いにしてよいと承認。完了根拠は commit `92e99e3 Add KPI undo and CSV E2E smoke test`、working tree clean、`npm test` pass、`npm run build` pass（no-op）、`tsc --noEmit` pass、push / deploy / 本番変更なし。以後、同スレッドは再開指示がない限り進行対象から除外する。
- **報告フォーマット改善:** Yakonより、白の報告がわかりづらく「私がやらないといけないこと」が不明と指摘。今後の報告は冒頭に「Yakonさんにお願いしたいこと: ある/なし」「判断内容」「期限」「放置時の影響」を固定表示し、判断依頼と進捗報告を混ぜない。
- **自律運用停止の原因と修正:** Yakonより「俺への依頼がないなら自律的に全てのプロジェクトが動くはずだけどなんで動いていないん？」と指摘。原因は Shiro Loop が `permission-wait` を停止状態として扱い、通知重複抑制だけ行って、低リスク作業の切り分け・承認パケット作成・再投入をしていなかったこと。`ops/shiro-loop-tick.mjs` を修正し、`permission-wait` でも「安全なローカル作業があれば実行、外部/高リスクのみなら具体的な承認パケット化」をtmuxへ再投入するよう変更。2026-06-12 09:21 JSTに14セッション中12セッションへ再投入済み。
- **報告改善の未反映とガード追加:** 2026-06-12 11:06 JST、Yakonより「どこが報告方法がかわったの？いぜんとわかりづらいです」と指摘。原因は口頭で報告形式を宣言しただけで、Shiro Loop/Verify の自動投稿が `state=permission-wait / decisionKind / risk / verifier=needs-refine / Yakon確認 required` の生ログ形式のままだったこと。`ops/message-quality-check.mjs` に生ログ形式を失敗扱いする検査を追加し、`ops/shiro-loop-digest.mjs` の冒頭を「Yakonさんがやること / 白がやること / 期限・影響 / 推奨」に変更。悪い旧形式は quality check で fail、新digest形式は pass を確認済み。
- **cron投稿プロンプト未修正の再指摘:** 2026-06-12 11:29 JST、Yakonより「これ本当に変わっている、英語ばっかりだしわかりづらい」と再指摘。原因は formatter と quality check は直したが、30分ごとの `shiro-loop-tick` cron payload が依然として「session, state, decisionKind, risk, verifier verdict, Yakon confirmation required」を投稿する指示のままだったこと。`shiro-loop-tick` と `shiro-loop-digest` のcron payloadを更新し、必ず `ops/shiro-loop-digest.mjs` の `.humanMessage` を `ops/message-quality-check.mjs` で通してから投稿、fail時は投稿しないよう変更。生ログ・英語寄り内部項目（`state=`, `decisionKind=`, `risk=`, `verifier=needs-refine`, `Yakon確認: 必須`）のDiscord投稿は禁止。
