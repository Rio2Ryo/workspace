import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('failed sample save clears stale success notice and keeps existing data visible', async ({ page, request }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Existing Keep')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  await page.route('**/api/items', async (route) => {
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
