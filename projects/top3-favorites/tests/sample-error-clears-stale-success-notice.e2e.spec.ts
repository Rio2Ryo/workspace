import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('failed sample save clears stale success notice and keeps existing data visible', async ({ page, request }) => {
  await request.post('/api/items', { data: { tag: 'カフェラテ', location: '柏の葉', rank: 1, name: 'Existing Keep', memo: '' } })
  await page.goto('/')
  await expect(page.getByText('1位: Existing Keep')).toBeVisible()

  await page.route('**/api/items**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'サンプル保存APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()

  await expect(page.getByRole('alert')).toContainText('サンプル保存APIが一時的に利用できません。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
  await expect(page.getByText('1位: Existing Keep')).toBeVisible()

  const apiData = (await request.get('/api/items').then((res) => res.json())) as { items: { name: string }[] }
  expect(apiData.items.map((item) => item.name)).toEqual(['Existing Keep'])
})
