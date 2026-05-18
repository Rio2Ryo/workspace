#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const dataFile = process.env.TOP3_LOCAL_DATA_FILE || join(root, 'data.local.json')
const port = Number(process.env.PORT || 4180)
const host = process.env.HOST || '127.0.0.1'

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRank(value) {
  const n = Number(value)
  return n === 2 || n === 3 ? n : 1
}

function parseMutationRank(value) {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return null
}

function hasInvalidMutationRank(payload) {
  return Object.prototype.hasOwnProperty.call(payload, 'rank') && parseMutationRank(payload.rank) === null
}

function parseImportRank(value) {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return null
}

function buildMapsUrl(item) {
  const query = [item.name, item.location, item.tag].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function isItem(value) {
  return value && typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.location === 'string' &&
    typeof value.name === 'string' &&
    [1, 2, 3].includes(value.rank) &&
    typeof value.memo === 'string' &&
    typeof value.mapsUrl === 'string' &&
    typeof value.placeId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
}

function importItemValidationError(value, index) {
  const row = index + 1
  if (!value || typeof value !== 'object') return `invalid item at row ${row}: item must be an object`
  if (!normalizeText(value.id)) return `invalid item at row ${row}: id is required`
  if (!normalizeText(value.tag)) return `invalid item at row ${row}: tag is required`
  if (!normalizeText(value.name)) return `invalid item at row ${row}: name is required`
  if (parseImportRank(value.rank) === null) return `invalid item at row ${row}: rank must be 1, 2, or 3`
  return null
}

function toValidItem(value) {
  if (!value || typeof value !== 'object') return null
  const id = normalizeText(value.id)
  const tag = normalizeText(value.tag)
  const location = normalizeText(value.location)
  const name = normalizeText(value.name)
  const rank = parseImportRank(value.rank)
  const memo = normalizeText(value.memo)
  const placeId = normalizeText(value.placeId)
  const createdAt = normalizeText(value.createdAt) || new Date().toISOString()
  const updatedAt = normalizeText(value.updatedAt) || new Date().toISOString()

  if (importItemValidationError(value, 0) || rank === null) return null

  const base = { id, tag, location, name, rank, memo, placeId, createdAt, updatedAt, mapsUrl: '' }
  return { ...base, mapsUrl: buildMapsUrl(base) }
}

async function readData() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8'))
    return { items: Array.isArray(parsed.items) ? parsed.items.filter(isItem) : [] }
  } catch {
    return { items: [] }
  }
}

let mutationQueue = Promise.resolve()

async function writeData(data) {
  const tempFile = `${dataFile}.${process.pid}.tmp`
  await writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8')
  await rename(tempFile, dataFile)
}

async function withDataMutation(mutator) {
  const run = mutationQueue.then(async () => {
    const data = await readData()
    return mutator(data)
  })
  mutationQueue = run.catch(() => {})
  return run
}

function themeKey(item) {
  return item.tag.trim().toLowerCase()
}

function compareTop3Items(a, b) {
  return (
    a.rank - b.rank ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.name.localeCompare(b.name, 'ja') ||
    a.id.localeCompare(b.id)
  )
}

function rebalance(items, target) {
  const key = themeKey(target)
  const same = items
    .filter((item) => themeKey(item) === key && item.id !== target.id)
    .sort(compareTop3Items)

  const shifted = same
    .map((item) => {
      if (item.rank >= target.rank) {
        const nextRank = item.rank + 1
        return { ...item, rank: nextRank <= 3 ? nextRank : 4 }
      }
      return item
    })
    .filter((item) => item.rank <= 3)

  const normalized = [...shifted, target]
    .sort(compareTop3Items)
    .slice(0, 3)

  return [...items.filter((item) => themeKey(item) !== key), ...normalized]
}

function normalizeImportedTop3(items) {
  const byTheme = new Map()
  for (const item of items) {
    const key = themeKey(item)
    byTheme.set(key, [...(byTheme.get(key) || []), item])
  }

  const normalized = []
  for (const list of byTheme.values()) {
    const top3 = [...list]
      .sort(compareTop3Items)
      .slice(0, 3)
      .map((item, index) => ({ ...item, rank: index + 1 }))
    normalized.push(...top3)
  }
  return normalized
}

function duplicateItemIdError(items) {
  const firstById = new Map()
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

function makeItem(payload, existing) {
  const now = new Date().toISOString()
  const base = {
    id: existing?.id ?? randomUUID(),
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

async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  return JSON.parse(raw)
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function handleApi(req, res, url) {
  if (req.method === 'GET') {
    const data = await readData()
    const tags = Array.from(new Set(data.items.map((item) => item.tag).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja'))
    return sendJson(res, 200, { items: data.items, tags })
  }
  if (req.method === 'POST') {
    const payload = await readJsonBody(req)

    if (url.searchParams.get('mode') === 'replace') {
      const arr = Array.isArray(payload?.items) ? payload.items : null
      if (!arr) return sendJson(res, 400, { error: 'items array is required' })

      const validationError = arr.map((item, index) => importItemValidationError(item, index)).find(Boolean)
      if (validationError) {
        return sendJson(res, 400, { error: validationError })
      }

      const normalized = arr.map((item) => toValidItem(item))
      if (normalized.some((item) => item === null)) {
        return sendJson(res, 400, { error: 'invalid item exists' })
      }

      const validItems = normalized.filter(Boolean)
      const duplicateError = duplicateItemIdError(validItems)
      if (duplicateError) {
        return sendJson(res, 400, { error: duplicateError })
      }

      const items = normalizeImportedTop3(validItems)
      await withDataMutation(async () => {
        await writeData({ items })
      })
      return sendJson(res, 200, { items })
    }

    if (hasInvalidMutationRank(payload)) return sendJson(res, 400, { error: 'rank must be 1, 2, or 3' })
    return withDataMutation(async (data) => {
      const item = makeItem(payload)
      if (!item.tag || !item.name) return sendJson(res, 400, { error: 'tag and name are required' })
      const items = rebalance(data.items, item)
      await writeData({ items })
      return sendJson(res, 200, { items, item })
    })
  }
  if (req.method === 'PUT') {
    const payload = await readJsonBody(req)
    if (hasInvalidMutationRank(payload)) return sendJson(res, 400, { error: 'rank must be 1, 2, or 3' })
    return withDataMutation(async (data) => {
      const existing = data.items.find((item) => item.id === normalizeText(payload.id))
      if (!existing) return sendJson(res, 404, { error: 'item not found' })
      const edited = makeItem(payload, existing)
      if (!edited.tag || !edited.name) return sendJson(res, 400, { error: 'tag and name are required' })
      const items = rebalance(data.items.filter((item) => item.id !== existing.id), edited)
      await writeData({ items })
      return sendJson(res, 200, { items, item: edited })
    })
  }
  if (req.method === 'DELETE') {
    const id = normalizeText(url.searchParams.get('id'))
    return withDataMutation(async (data) => {
      const items = data.items.filter((item) => item.id !== id)
      await writeData({ items })
      return sendJson(res, 200, { items })
    })
  }
  return sendJson(res, 405, { error: 'method not allowed' })
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
    if (url.pathname === '/api/items') return await handleApi(req, res, url)

    const requested = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = resolve(distDir, `.${decodeURIComponent(requested)}`)
    if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('not found')
    }
    res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream' })
    const stream = createReadStream(filePath)
    stream.on('error', (error) => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : String(error))
    })
    stream.pipe(res)
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, host, () => {
  console.log(`[top3-local] http://${host}:${port}`)
})
