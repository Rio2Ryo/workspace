import { expect, test } from '@playwright/test'
import { resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sample data seed remains after reload and is reflected in API data', async ({ page, request }) => {
  await page.goto('/')

  await saveSampleItems(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await expect(searchSection.getByText(/1位:\s*Solito MAGO/)).toBeVisible()
  await expect(searchSection.getByText(/2位:\s*T-SITEのカフェ/)).toBeVisible()
  await expect(searchSection.getByText(/1位:\s*とみ田/)).toBeVisible()

  await page.reload()

  await expect(searchSection.getByText(/1位:\s*Solito MAGO/)).toBeVisible()
  await expect(searchSection.getByText(/2位:\s*T-SITEのカフェ/)).toBeVisible()
  await expect(searchSection.getByText(/1位:\s*とみ田/)).toBeVisible()

  const apiData = (await request.get('/api/items').then((res) => res.json())) as {
    items: { tag: string; location: string; name: string; rank: number; memo: string }[]
  }

  expect(apiData.items).toHaveLength(3)
  expect(apiData.items.map(({ tag, location, name, rank, memo }) => ({ tag, location, name, rank, memo }))).toEqual(
    expect.arrayContaining([
      { tag: 'カフェラテ', location: '柏の葉', name: 'Solito MAGO', rank: 1, memo: 'ラテアートがきれい。ミルク感も好き' },
      { tag: 'カフェラテ', location: '柏の葉', name: 'T-SITEのカフェ', rank: 2, memo: '作業ついでに寄りやすい' },
      { tag: 'つけ麺', location: '松戸', name: 'とみ田', rank: 1, memo: '濃厚つけ麺が強い' },
    ]),
  )
})
