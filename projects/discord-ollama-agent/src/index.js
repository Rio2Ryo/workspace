import 'dotenv/config'
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const BACKEND = (process.env.LLM_BACKEND || 'ollama').toLowerCase()
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'http://127.0.0.1:8080/v1').replace(/\/$/, '')
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-local'
const DEFAULT_MODEL = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'lukey03/qwen3.5-9b-abliterated:latest'
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || [
  'You are a helpful AI agent running locally.',
  'Reply in the same language as the user unless asked otherwise.',
  'Be concise, practical, and honest about uncertainty.',
].join('\n')

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and set your bot token.')
  process.exit(1)
}

if (!['ollama', 'openai'].includes(BACKEND)) {
  console.error('LLM_BACKEND must be either "ollama" or "openai".')
  process.exit(1)
}

const channelModel = new Map()
const channelHistory = new Map()
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 12)
const MAX_USER_CHARS = Number(process.env.MAX_USER_CHARS || 6000)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
})

function getModel(channelId) {
  return channelModel.get(channelId) || DEFAULT_MODEL
}

function remember(channelId, role, content) {
  const history = channelHistory.get(channelId) || []
  history.push({ role, content })
  channelHistory.set(channelId, history.slice(-MAX_HISTORY_MESSAGES))
}

async function listModels() {
  if (BACKEND === 'ollama') {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!res.ok) throw new Error(`Ollama tags failed: ${res.status}`)
    const data = await res.json()
    return data.models?.map((m) => m.name) || []
  }

  const res = await fetch(`${OPENAI_BASE_URL}/models`, {
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
  })
  if (!res.ok) throw new Error(`OpenAI-compatible models failed: ${res.status}`)
  const data = await res.json()
  return data.data?.map((m) => m.id) || []
}

async function chatWithOllama({ channelId, userText }) {
  const model = getModel(channelId)
  const history = channelHistory.get(channelId) || []
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userText },
  ]

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama chat failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  const answer = data.message?.content?.trim() || data.message?.thinking?.trim() || '(empty response)'
  remember(channelId, 'user', userText)
  remember(channelId, 'assistant', answer)
  return { model, answer }
}

async function chatWithOpenAICompatible({ channelId, userText }) {
  const model = getModel(channelId)
  const history = channelHistory.get(channelId) || []
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userText },
  ]

  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(process.env.TEMPERATURE || 1.0),
      top_p: Number(process.env.TOP_P || 0.95),
      max_tokens: Number(process.env.MAX_TOKENS || 2048),
      stream: false,
      chat_template_kwargs: {
        enable_thinking: process.env.ENABLE_THINKING === 'true',
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI-compatible chat failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  const answer = data.choices?.[0]?.message?.content?.trim() || '(empty response)'
  remember(channelId, 'user', userText)
  remember(channelId, 'assistant', answer)
  return { model, answer }
}

function chat({ channelId, userText }) {
  if (BACKEND === 'openai') return chatWithOpenAICompatible({ channelId, userText })
  return chatWithOllama({ channelId, userText })
}

function stripMention(content) {
  return content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim()
}

async function safeReply(message, text) {
  const chunks = text.match(/[\s\S]{1,1900}/g) || ['']
  await message.reply(chunks[0])
  for (const chunk of chunks.slice(1)) await message.channel.send(chunk)
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`)
  console.log(`Backend: ${BACKEND}`)
  console.log(`Ollama: ${OLLAMA_BASE_URL}`)
  console.log(`OpenAI-compatible: ${OPENAI_BASE_URL}`)
  console.log(`Default model: ${DEFAULT_MODEL}`)
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return

  const mentioned = message.mentions.has(client.user)
  const isDM = !message.guildId
  const prefix = process.env.BOT_PREFIX || '!agent'
  const hasPrefix = message.content.trim().startsWith(prefix)

  if (!mentioned && !isDM && !hasPrefix) return

  const raw = hasPrefix
    ? message.content.trim().slice(prefix.length).trim()
    : stripMention(message.content)

  const [command, ...rest] = raw.split(/\s+/)

  try {
    if (!raw || command === 'help') {
      await safeReply(message, [
        '使い方:',
        `- メンションして質問: @${client.user.username} こんにちは`,
        `- Prefix: \`${prefix} 質問内容\``,
        `- モデル一覧: \`${prefix} models\``,
        `- モデル切替: \`${prefix} model <model-name>\``,
        `- 現在モデル: \`${prefix} current\``,
        `- 履歴リセット: \`${prefix} reset\``,
        `- 接続確認: \`${prefix} status\``,
      ].join('\n'))
      return
    }

    if (command === 'status') {
      await safeReply(message, [
        `backend: \`${BACKEND}\``,
        `base: \`${BACKEND === 'openai' ? OPENAI_BASE_URL : OLLAMA_BASE_URL}\``,
        `model: \`${getModel(message.channelId)}\``,
        `history: \`${channelHistory.get(message.channelId)?.length || 0}/${MAX_HISTORY_MESSAGES}\``,
      ].join('\n'))
      return
    }

    if (command === 'models') {
      const models = await listModels()
      await safeReply(message, models.length ? `利用可能モデル:\n${models.map((m) => `- ${m}`).join('\n')}` : 'モデル一覧が空でした。')
      return
    }

    if (command === 'model') {
      const nextModel = rest.join(' ')
      if (!nextModel) {
        await safeReply(message, `現在のモデル: \`${getModel(message.channelId)}\``)
        return
      }
      const models = await listModels().catch(() => [])
      if (models.length && !models.includes(nextModel)) {
        await safeReply(message, `そのモデルは見つかりません。\n\`${prefix} models\` で確認してください。`)
        return
      }
      channelModel.set(message.channelId, nextModel)
      await safeReply(message, `このチャンネルのモデルを \`${nextModel}\` に切り替えました。`)
      return
    }

    if (command === 'current') {
      await safeReply(message, `現在のモデル: \`${getModel(message.channelId)}\``)
      return
    }

    if (command === 'reset') {
      channelHistory.delete(message.channelId)
      await safeReply(message, 'このチャンネルの会話履歴をリセットしました。')
      return
    }

    if (raw.length > MAX_USER_CHARS) {
      await safeReply(message, `入力が長すぎます。${MAX_USER_CHARS}文字以内にしてください。`)
      return
    }

    await message.channel.sendTyping()
    const { model, answer } = await chat({ channelId: message.channelId, userText: raw })
    await safeReply(message, `${answer}\n\n_model: ${model}_`)
  } catch (error) {
    console.error(error)
    await safeReply(message, `エラー: ${error.message}`)
  }
})

client.login(DISCORD_TOKEN)
