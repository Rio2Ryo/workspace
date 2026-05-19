import { expect, test } from '@playwright/test'
import { resetItemsByReplace, postItem } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('API POST preserves explicit rank 3 for new item when tag has no existing data', async ({ request }) => {
  const res = await postItem(request, {
    tag: 'ランチ',
    location: '松戸',
    name: '三番目食堂',
    rank: 3,
    memo: '',
  })

  expect(res.status()).toBe(200)

  const json = (await res.json()) as { items: { tag: string; name: string; rank: number }[] }
  const saved = json.items.find((item) => item.tag === 'ランチ' && item.name === '三番目食堂')
  expect(saved).toBeTruthy()
  expect(saved?.rank).toBe(3)
})
