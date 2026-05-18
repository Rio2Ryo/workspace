import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
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

  const res = await request.post('/api/items?mode=replace', { data: payload })
  expect(res.status()).toBe(200)

  const json = (await res.json()) as { items: { tag: string; rank: number; name: string }[] }
  const cafe = json.items.filter((i) => i.tag === 'カフェラテ')

  expect(cafe).toHaveLength(3)
  expect(cafe.map((i) => i.rank).sort((a, b) => a - b)).toEqual([1, 2, 3])
})
