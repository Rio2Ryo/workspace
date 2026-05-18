import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('item with empty memo shows fallback text （メモなし） in details', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェ')
  await page.getByLabel('場所', { exact: true }).fill('渋谷')
  await page.getByLabel('店舗名', { exact: true }).fill('茶亭')
  await page.getByLabel('メモ', { exact: true }).fill('')
  await page.getByRole('button', { name: '登録 2位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェ' }) })
  await expect(group.getByText(/\d位: 茶亭/)).toBeVisible()

  await group.locator('summary', { hasText: /\d位: 茶亭/ }).click()
  await expect(group.getByText('（メモなし）')).toBeVisible()
})
