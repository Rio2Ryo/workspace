import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('JSON export is disabled when there are no items, and enabled after adding one', async ({ page }) => {
  await page.goto('/')

  const exportButton = page.getByRole('button', { name: 'JSONエクスポート' })
  await expect(exportButton).toBeDisabled()

  await page.getByLabel('タグ', { exact: true }).fill('カフェ')
  await page.getByLabel('場所', { exact: true }).fill('渋谷')
  await page.getByLabel('店舗名', { exact: true }).fill('茶亭')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await expect(page.getByRole('status')).toContainText('カフェ の1位に保存しました。')
  await expect(exportButton).toBeEnabled()
})
