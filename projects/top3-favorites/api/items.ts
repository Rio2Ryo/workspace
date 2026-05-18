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

function parseMutationRank(value: unknown): Rank | null {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return null
}

function hasInvalidMutationRank(payload: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(payload, 'rank') && parseMutationRank(payload.rank) === null
}

function parseImportRank(value: unknown): Rank | null {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return null
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

function importItemValidationError(value: unknown, index: number): string | null {
  const row = index + 1
  if (!value || typeof value !== 'object') return `invalid item at row ${row}: item must be an object`
  const o = value as Record<string, unknown>
  if (!normalizeText(o.id)) return `invalid item at row ${row}: id is required`
  if (!normalizeText(o.tag)) return `invalid item at row ${row}: tag is required`
  if (!normalizeText(o.name)) return `invalid item at row ${row}: name is required`
  if (parseImportRank(o.rank) === null) return `invalid item at row ${row}: rank must be 1, 2, or 3`
  return null
}

function toValidItem(value: unknown): FavoriteItem | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>

  const id = normalizeText(o.id)
  const tag = normalizeText(o.tag)
  const location = normalizeText(o.location)
  const name = normalizeText(o.name)
  const rank = parseImportRank(o.rank)
  const memo = normalizeText(o.memo)
  const placeId = normalizeText(o.placeId)
  const createdAt = normalizeText(o.createdAt) || new Date().toISOString()
  const updatedAt = normalizeText(o.updatedAt) || new Date().toISOString()

  if (importItemValidationError(value, 0) || rank === null) return null

  const base: FavoriteItem = {
    id,
    tag,
    location,
    name,
    rank,
    memo,
    placeId,
    createdAt,
    updatedAt,
    mapsUrl: '',
  }
  return { ...base, mapsUrl: buildMapsUrl(base) }
}

function duplicateItemIdError(items: FavoriteItem[]): string | null {
  const firstById = new Map<string, { item: FavoriteItem; index: number }>()
  for (const [index, item] of items.entries()) {
    const first = firstById.get(item.id)
    if (first) {
      const firstName = first.item.name.trim() || 'untitled item'
      const duplicateName = item.name.trim() || 'untitled item'
      return `duplicate item id "${item.id}" at rows ${first.index + 1} "${firstName}" and ${index + 1} "${duplicateName}"`
    }
    firstById.set(item.id, { item, index })
  }
  return null
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

function compareTop3Items(a: FavoriteItem, b: FavoriteItem): number {
  return (
    a.rank - b.rank ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.name.localeCompare(b.name, 'ja') ||
    a.id.localeCompare(b.id)
  )
}

function rebalance(items: FavoriteItem[], target: FavoriteItem): FavoriteItem[] {
  const key = themeKey(target)
  const same = items
    .filter((item) => themeKey(item) === key && item.id !== target.id)
    .sort(compareTop3Items)

  const shifted = same
    .map((item) => {
      if (item.rank >= target.rank) {
        const nextRank = item.rank + 1
        return { ...item, rank: (nextRank <= 3 ? nextRank : 4) as Rank | 4 }
      }
      return item
    })
    .filter((item) => item.rank <= 3) as FavoriteItem[]

  const normalized = [...shifted, target]
    .sort(compareTop3Items)
    .slice(0, 3)

  const others = items.filter((item) => themeKey(item) !== key)
  return [...others, ...normalized]
}

function normalizeImportedTop3(items: FavoriteItem[]): FavoriteItem[] {
  const byTheme = new Map<string, FavoriteItem[]>()
  for (const item of items) {
    const key = themeKey(item)
    byTheme.set(key, [...(byTheme.get(key) ?? []), item])
  }

  const normalized: FavoriteItem[] = []
  for (const list of byTheme.values()) {
    const top3 = [...list]
      .sort(compareTop3Items)
      .slice(0, 3)
      .map((item, index) => ({ ...item, rank: (index + 1) as Rank }))
    normalized.push(...top3)
  }
  return normalized
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
      const mode = normalizeText(req.query?.mode)
      const payload = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}')

      if (mode === 'replace') {
        const arr = Array.isArray((payload as Record<string, unknown>)?.items)
          ? ((payload as Record<string, unknown>).items as unknown[])
          : null
        if (!arr) return send(res, 400, { error: 'items array is required' })

        const validationError = arr.map((v, index) => importItemValidationError(v, index)).find(Boolean)
        if (validationError) {
          return send(res, 400, { error: validationError })
        }

        const normalized = arr.map((v) => toValidItem(v))
        if (normalized.some((v) => v === null)) {
          return send(res, 400, { error: 'invalid item exists' })
        }

        const validItems = normalized.filter((v): v is FavoriteItem => v !== null)
        const duplicateError = duplicateItemIdError(validItems)
        if (duplicateError) {
          return send(res, 400, { error: duplicateError })
        }
        const top3Normalized = normalizeImportedTop3(validItems)
        await writeData({ items: top3Normalized })
        return send(res, 200, { items: top3Normalized })
      }

      const item = makeItem(payload)
      if (hasInvalidMutationRank(payload)) return send(res, 400, { error: 'rank must be 1, 2, or 3' })
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
      if (hasInvalidMutationRank(payload)) return send(res, 400, { error: 'rank must be 1, 2, or 3' })
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
