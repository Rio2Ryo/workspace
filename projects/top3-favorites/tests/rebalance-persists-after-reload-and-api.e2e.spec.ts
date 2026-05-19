import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('adding new 1st place rebalances to Top3 and persists ranks after reload + API', async ({ page, request }) => {
  const seed = [
    { tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '' },
    { tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '' },
    { tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '' },
  ] as const

  for (const item of seed) {
    await request.post('/api/items', { data: item })
  }

  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('New 1st')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })

  // immediately after rebalance in UI
  await expect(searchSection.getByText(/1位:\s*New 1st/)).toBeVisible()
  await expect(searchSection.getByText(/2位:\s*A店/)).toBeVisible()
  await expect(searchSection.getByText(/3位:\s*B店/)).toBeVisible()
  await expect(searchSection.getByText('C店')).toHaveCount(0)

  await page.reload()

  // after reload, ranking must remain
  await expect(searchSection.getByText(/1位:\s*New 1st/)).toBeVisible()
  await expect(searchSection.getByText(/2位:\s*A店/)).toBeVisible()
  await expect(searchSection.getByText(/3位:\s*B店/)).toBeVisible()
  await expect(searchSection.getByText('C店')).toHaveCount(0)

  // API contract: only top3 of same tag with exact ranks
  const apiData = (await request.get('/api/items').then((res) => res.json())) as {
    items: { tag: string; name: string; rank: number }[]
  }
  const cafe = apiData.items
    .filter((item) => item.tag === 'カフェラテ')
    .sort((a, b) => a.rank - b.rank)

  expect(cafe).toHaveLength(3)
  expect(cafe.map((item) => ({ rank: item.rank, name: item.name }))).toEqual([
    { rank: 1, name: 'New 1st' },
    { rank: 2, name: 'A店' },
    { rank: 3, name: 'B店' },
  ])
})
