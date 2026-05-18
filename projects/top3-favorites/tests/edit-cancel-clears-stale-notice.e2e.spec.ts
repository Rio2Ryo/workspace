import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('canceling edit clears stale success notice to avoid misleading feedback', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Before Edit')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  await page.getByText('1位: Before Edit').click()
  await page.getByRole('button', { name: 'Before Editを編集' }).click()
  await page.getByRole('button', { name: '編集をキャンセル' }).click()

  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
