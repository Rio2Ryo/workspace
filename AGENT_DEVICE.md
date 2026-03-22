# AGENT_DEVICE.md

## 現在の状態
- `agent-device` CLI: 利用可能（`npx -y agent-device --help` 確認済み）
- Node.js: v25.5.0
- iOS: 利用可能（Xcode / iOS Simulator 確認済み）
- Android: 未準備（`adb` 未インストールのため現時点では不可）

## このMacで確認できたこと
- 利用可能な iOS Simulator が存在
- `iPhone 17` は boot 済み
- `agent-device open Settings --platform ios` が成功
- `agent-device snapshot -i -c --platform ios --session default` が成功
- スクリーンショット保存成功: `agent-device-settings.png`

## 最短の使い方（iOS）
```bash
# ヘルプ
npx -y agent-device --help

# 利用可能デバイス一覧
npx -y agent-device devices --json

# アプリを開く（例: 設定）
npx -y agent-device open Settings --platform ios

# 画面のUI要素を取得
npx -y agent-device snapshot -i -c --platform ios --session default

# 要素を押す（例）
npx -y agent-device press @e18 --platform ios --session default

# テキスト入力（フォーカス済み入力欄へ）
npx -y agent-device type "テスト入力" --platform ios --session default

# 特定要素に入力
npx -y agent-device fill @e5 "入力内容" --platform ios --session default

# スクロール
npx -y agent-device scroll down --platform ios --session default
npx -y agent-device scroll up --platform ios --session default

# 見えるまでスクロール
npx -y agent-device scrollintoview @e10 --platform ios --session default

# スクリーンショット保存
npx -y agent-device screenshot ./agent-device-shot.png --platform ios --session default

# 戻る / ホーム / 終了
npx -y agent-device back --platform ios --session default
npx -y agent-device home --platform ios --session default
npx -y agent-device close --platform ios --session default
```

## 注意
- npm の engines では `Node >=22`
- `open --bundleId ...` は help では確認できていないため、まずは `open <appOrUrl>` 前提で使う
- セッション指定時は device selector と衝突することがあるので、まず `open` でセッションを作ってから、その `--session` を使って継続操作するのが安全
- Android を使うには `adb` / Android SDK 側の準備が必要
