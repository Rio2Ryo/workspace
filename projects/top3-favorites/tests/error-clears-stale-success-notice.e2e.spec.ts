import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('validation error clears stale success notice to avoid mixed feedback', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Notice Mix')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  // trigger validation error on next save attempt
  await page.getByLabel('店舗名', { exact: true }).fill('')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await expect(page.getByRole('alert')).toContainText('タグと店舗名は必須です。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
