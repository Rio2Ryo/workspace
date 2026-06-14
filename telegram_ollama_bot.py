#!/usr/bin/env python3
import logging
import os
import requests
from collections import defaultdict
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# ===== 設定 =====
# Token must be set via TELEGRAM_TOKEN env var (e.g. in .env or shell export).
# The old hardcoded value was revoked — regenerate via BotFather before use.
TELEGRAM_TOKEN = os.environ["TELEGRAM_TOKEN"]
OLLAMA_URL = "http://localhost:11434"
MODEL = "lukey03/qwen3.5-9b-abliterated"
MAX_HISTORY = 20  # 保持する会話ターン数（多すぎるとコンテキスト溢れる）

# チャットごとの会話履歴
chat_histories = defaultdict(list)

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    chat_histories[chat_id] = []
    await update.message.reply_text(
        f"🤖 ローカルLLMボット起動中！\n"
        f"モデル: {MODEL}\n"
        f"会話履歴を記憶します（最大{MAX_HISTORY}ターン）\n\n"
        f"/clear で会話をリセット"
    )

async def clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    chat_histories[chat_id] = []
    await update.message.reply_text("🗑️ 会話履歴をリセットしました！")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_message = update.message.text

    # 返信引用がある場合、引用元のテキストをコンテキストに追加
    if update.message.reply_to_message and update.message.reply_to_message.text:
        quoted = update.message.reply_to_message.text
        user_message = f"[以下のメッセージへの返信]\n「{quoted}」\n\n{user_message}"

    # 会話履歴にユーザーメッセージ追加
    chat_histories[chat_id].append({"role": "user", "content": user_message})

    # 古い履歴を切り詰め
    if len(chat_histories[chat_id]) > MAX_HISTORY * 2:
        chat_histories[chat_id] = chat_histories[chat_id][-(MAX_HISTORY * 2):]

    await update.message.chat.send_action(action="typing")

    try:
        # Ollama Chat API（会話履歴付き）
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": MODEL,
                "messages": chat_histories[chat_id],
                "stream": False
            },
            timeout=300
        )
        response.raise_for_status()

        result = response.json()
        msg = result.get("message", {})
        bot_reply = msg.get("content", "").strip()
        # thinkingモードで content が空の場合、thinking を使う
        if not bot_reply:
            thinking = msg.get("thinking", "").strip()
            bot_reply = thinking if thinking else "（応答なし）"

        # アシスタントの応答を履歴に追加
        chat_histories[chat_id].append({"role": "assistant", "content": bot_reply})

        await update.message.reply_text(bot_reply)

    except requests.exceptions.ConnectionError:
        await update.message.reply_text("⚠️ Ollamaに接続できません。`ollama serve` が動いてるか確認してね。")
    except requests.exceptions.ReadTimeout:
        turns = len(chat_histories[chat_id])
        await update.message.reply_text(
            f"⏱️ 応答がタイムアウトしました（会話履歴: {turns}メッセージ）\n"
            f"/clear で会話をリセットすると軽くなります"
        )
    except Exception as e:
        await update.message.reply_text(f"エラー: {str(e)}")

def main():
    application = Application.builder().token(TELEGRAM_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("clear", clear))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print(f"Bot起動！モデル: {MODEL}（会話履歴対応）")
    application.run_polling()

if __name__ == "__main__":
    main()
