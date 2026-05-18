import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('manual tag edit breaks search-link sync and hides sync status', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Base')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')

  // Manual tag typing should break sync state
  await page.getByLabel('タグ', { exact: true }).fill('手入力タグ')

  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
  await expect(searchSection.getByRole('button', { name: 'タグ解除' })).toHaveCount(0)
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('手入力タグ')
})
