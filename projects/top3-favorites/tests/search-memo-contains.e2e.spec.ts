import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('search query matches memo text (manual QA contract)', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェ')
  await page.getByLabel('場所', { exact: true }).fill('渋谷')
  await page.getByLabel('店舗名', { exact: true }).fill('茶亭')
  await page.getByLabel('メモ', { exact: true }).fill('深夜営業あり')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await page.getByLabel('タグ', { exact: true }).fill('ラーメン')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('とみ田')
  await page.getByLabel('メモ', { exact: true }).fill('濃厚つけ麺')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await page.getByPlaceholder('例: カフェラテ / 柏の葉 / Solito').fill('深夜営業')

  await expect(searchSection.getByText(/1位: 茶亭/)).toBeVisible()
  await expect(searchSection.getByText(/1位: とみ田/)).not.toBeVisible()
})
