import { expect, test } from '@playwright/test'
import { itemEditButton, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('starting edit clears stale success notice to match current context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Edit Start Notice')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  await page.getByText('1位: Edit Start Notice').click()
  await itemEditButton(page, 'Edit Start Notice').click()
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
