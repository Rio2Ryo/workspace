import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('tag sync status is visible while operation notice remains the single live status channel', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('A11y Sync')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()

  const sync = page.getByTestId('tag-sync-status')
  await expect(sync).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')
  await expect(sync).not.toHaveAttribute('aria-live')
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')
})
