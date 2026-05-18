import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('tag sync should not break for semantically same tag with half/full width spaces', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェ ラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Space Normalize')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェ ラテ' }).click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  // Same meaning with full-width space should keep sync
  await page.getByLabel('タグ', { exact: true }).fill('カフェ　ラテ')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)
})
