import { get, put } from '@vercel/blob'

type Rank = 1 | 2 | 3

type FavoriteItem = {
  id: string
  tag: string
  location: string
  name: string
  rank: Rank
  memo: string
  mapsUrl: string
  placeId: string
  createdAt: string
  updatedAt: string
}

type DataFile = {
  items: FavoriteItem[]
}

const DATA_PATH = 'top3-favorites/items.json'

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRank(value: unknown): Rank {
  const n = Number(value)
  return n === 2 || n === 3 ? n : 1
}

function buildMapsUrl(item: Pick<FavoriteItem, 'name' | 'tag' | 'location'>): string {
  const query = [item.name, item.location, item.tag].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function isItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.tag === 'string' &&
    typeof o.location === 'string' &&
    typeof o.name === 'string' &&
    (o.rank === 1 || o.rank === 2 || o.rank === 3) &&
    typeof o.memo === 'string' &&
    typeof o.mapsUrl === 'string' &&
    typeof o.placeId === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.updatedAt === 'string'
  )
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text()
}

async function readData(): Promise<DataFile> {
  try {
    const blob = await get(DATA_PATH, { access: 'private', useCache: false })
    if (!blob || blob.statusCode !== 200 || !blob.stream) return { items: [] }
    const text = await streamToText(blob.stream)
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') return { items: [] }
    const items = Array.isArray((parsed as DataFile).items) ? (parsed as DataFile).items.filter(isItem) : []
    return { items }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not exist')) return { items: [] }
    return { items: [] }
  }
}

async function writeData(data: DataFile): Promise<void> {
  await put(DATA_PATH, JSON.stringify(data, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  })
}

function themeKey(item: Pick<FavoriteItem, 'tag'>): string {
  return item.tag.trim().toLowerCase()
}

function rebalance(items: FavoriteItem[], target: FavoriteItem): FavoriteItem[] {
  const key = themeKey(target)
  const same = items
    .filter((item) => themeKey(item) === key && item.id !== target.id)
    .sort((a, b) => a.rank - b.rank || b.updatedAt.localeCompare(a.updatedAt))

  const inserted: FavoriteItem[] = []
  let pushed = false
  for (const item of same) {
    if (!pushed && inserted.length === target.rank - 1) {
      inserted.push(target)
      pushed = true
    }
    inserted.push(item)
  }
  if (!pushed) inserted.push(target)

  const normalized = inserted.slice(0, 3).map((item, index) => ({ ...item, rank: (index + 1) as Rank }))
  const others = items.filter((item) => themeKey(item) !== key)
  return [...others, ...normalized]
}

function makeItem(payload: Record<string, unknown>, existing?: FavoriteItem): FavoriteItem {
  const now = new Date().toISOString()
  const base = {
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tag: normalizeText(payload.tag ?? existing?.tag),
    location: normalizeText(payload.location ?? existing?.location),
    name: normalizeText(payload.name ?? existing?.name),
    rank: normalizeRank(payload.rank ?? existing?.rank),
    memo: normalizeText(payload.memo ?? existing?.memo),
    placeId: normalizeText(payload.placeId ?? existing?.placeId),
    mapsUrl: '',
  }
  return { ...base, mapsUrl: buildMapsUrl(base) }
}

function send(res: any, status: number, body: unknown) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: any, res: any) {
  try {
    const data = await readData()

    if (req.method === 'GET') {
      const tags = Array.from(new Set(data.items.map((item) => item.tag).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ja'),
      )
      return send(res, 200, { items: data.items, tags })
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}')
      const item = makeItem(payload)
      if (!item.tag || !item.name) return send(res, 400, { error: 'tag and name are required' })
      const items = rebalance(data.items, item)
      await writeData({ items })
      return send(res, 200, { items, item })
    }

    if (req.method === 'PUT') {
      const payload = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}')
      const id = normalizeText(payload.id)
      const existing = data.items.find((item) => item.id === id)
      if (!existing) return send(res, 404, { error: 'item not found' })
      const base = data.items.filter((item) => item.id !== id)
      const edited = makeItem(payload, existing)
      if (!edited.tag || !edited.name) return send(res, 400, { error: 'tag and name are required' })
      const items = rebalance(base, edited)
      await writeData({ items })
      return send(res, 200, { items, item: edited })
    }

    if (req.method === 'DELETE') {
      const id = normalizeText(req.query?.id)
      const items = data.items.filter((item) => item.id !== id)
      await writeData({ items })
      return send(res, 200, { items })
    }

    res.setHeader('allow', 'GET, POST, PUT, DELETE')
    return send(res, 405, { error: 'method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return send(res, 500, { error: message })
  }
}
