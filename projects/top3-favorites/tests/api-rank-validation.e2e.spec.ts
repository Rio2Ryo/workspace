import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('API create rejects invalid rank with a localized repair hint instead of silently normalizing to 1', async ({ request }) => {
  const res = await request.post('/api/items', {
    data: { tag: '検証', location: '代々木', rank: 4, name: 'Invalid Rank Create', memo: '' },
  })

  expect(res.status()).toBe(400)
  await expect(res.json()).resolves.toEqual({
    error: 'API create / フィールド: rank / 修正: 順位は1〜3で入力してください。',
  })

  const apiData = (await request.get('/api/items').then((response) => response.json())) as { items: Array<{ name: string }> }
  expect(apiData.items.some((item) => item.name === 'Invalid Rank Create')).toBe(false)
})

test('API edit rejects invalid rank with a localized repair hint and preserves the existing item', async ({ request }) => {
  const created = await request.post('/api/items', {
    data: { tag: '検証', location: '代々木', rank: 2, name: 'Valid Rank Base', memo: '' },
  })
  expect(created.status()).toBe(200)
  const createdBody = (await created.json()) as { item: { id: string } }

  const res = await request.put('/api/items', {
    data: { id: createdBody.item.id, tag: '検証', location: '代々木', rank: 9, name: 'Invalid Rank Edit', memo: '' },
  })

  expect(res.status()).toBe(400)
  await expect(res.json()).resolves.toEqual({
    error: 'API edit / フィールド: rank / 修正: 順位は1〜3で入力してください。',
  })

  const apiData = (await request.get('/api/items').then((response) => response.json())) as {
    items: Array<{ id: string; name: string; rank: number }>
  }
  expect(apiData.items).toContainEqual(expect.objectContaining({ id: createdBody.item.id, name: 'Valid Rank Base', rank: 2 }))
  expect(apiData.items.some((item) => item.name === 'Invalid Rank Edit')).toBe(false)
})
