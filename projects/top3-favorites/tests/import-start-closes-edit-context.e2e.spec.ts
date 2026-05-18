import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('starting JSON import closes edit context to avoid mixed workflows', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Edit Target')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await page.getByText('1位: Edit Target').click()
  await page.getByRole('button', { name: 'Edit Targetを編集' }).click()
  await expect(page.getByRole('button', { name: '編集を保存' })).toBeVisible()

  await page.getByRole('button', { name: 'JSONインポート' }).click()
  await expect(page.getByRole('button', { name: '編集を保存' })).toHaveCount(0)
})
