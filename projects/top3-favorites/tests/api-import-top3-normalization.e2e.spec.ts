import { expect, test } from '@playwright/test'
import { resetItemsByReplace, replaceItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('API replace import normalizes same-tag data to Top3 with ranks 1..3', async ({ request }) => {
  const now = new Date().toISOString()
  const payload = {
    items: [
      { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
      { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
      { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
      { id: 'd', tag: 'カフェラテ', location: '柏の葉', name: 'D', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    ],
  }

  const res = await replaceItems(request, payload)
  expect(res.status()).toBe(200)

  const json = (await res.json()) as { items: { tag: string; rank: number; name: string }[] }
  const cafe = json.items.filter((i) => i.tag === 'カフェラテ')

  expect(cafe).toHaveLength(3)
  expect(cafe.map((i) => i.rank).sort((a, b) => a - b)).toEqual([1, 2, 3])
})

test('API replace import uses deterministic name/id tie-breakers for identical rank and timestamp', async ({ request }) => {
  const sameTime = '2026-01-01T00:00:00.000Z'
  const payload = {
    items: [
      { id: 'z', tag: 'カフェラテ', location: '柏の葉', name: 'Z店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: sameTime, updatedAt: sameTime },
      { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: sameTime, updatedAt: sameTime },
      { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: sameTime, updatedAt: sameTime },
      { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: sameTime, updatedAt: sameTime },
      { id: 'y', tag: 'カフェラテ', location: '柏の葉', name: 'Y店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: sameTime, updatedAt: sameTime },
    ],
  }

  const res = await replaceItems(request, payload)
  expect(res.status()).toBe(200)

  const json = (await res.json()) as { items: { tag: string; rank: number; name: string }[] }
  const cafe = json.items.filter((i) => i.tag === 'カフェラテ')

  expect(cafe.map((i) => i.name)).toEqual(['A店', 'B店', 'C店'])
  expect(cafe.map((i) => i.rank)).toEqual([1, 2, 3])
})
