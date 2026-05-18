import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('selecting a tag in search also syncs registration tag input', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync A')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toBeVisible()

  await page.getByLabel('タグ', { exact: true }).fill('つけ麺')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync B')
  await expect(page.getByLabel('店舗名', { exact: true })).toHaveValue('Sync B')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByText('つけ麺 の1位に保存しました。')).toBeVisible()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#つけ麺' }).click()

  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('つけ麺')
})
