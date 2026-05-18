import { expect, test } from '@playwright/test'

const validItem = (patch: Record<string, unknown> = {}) => ({
  id: 'api-valid-1',
  tag: 'つけ麺',
  location: '松戸',
  name: 'Valid API Item',
  rank: 1,
  memo: 'validation fixture',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
  placeId: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...patch,
})

test('API replace import rejects invalid rank (server-side validation)', async ({ request }) => {
  const payload = {
    items: [validItem({ id: 'api-bad-rank-1', name: 'Invalid API Rank', rank: 4, memo: 'should be rejected' })],
  }

  const res = await request.post('/api/items?mode=replace', { data: payload })
  expect(res.status()).toBe(400)

  const json = await res.json()
  expect(json.error).toBe('API replace importの1件目 / フィールド: rank / 修正: 順位は1、2、3のいずれかにしてください')
})

test('API replace import rejects duplicate item ids', async ({ request }) => {
  const payload = {
    items: [
      validItem({ id: 'dup-1', name: 'Duplicate First' }),
      validItem({ id: 'dup-1', name: 'Duplicate Second', rank: 2 }),
    ],
  }

  const res = await request.post('/api/items?mode=replace', { data: payload })
  expect(res.status()).toBe(400)

  const json = await res.json()
  expect(json.error).toBe('API replace importのID「dup-1」が重複しています: 1件目「Duplicate First」と2件目「Duplicate Second」を確認してください')
})
