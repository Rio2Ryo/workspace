import { expect, test } from '@playwright/test'
import { editCancelButton, itemEditButton, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('canceling edit clears stale success notice to avoid misleading feedback', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Before Edit')
  await registrationSaveButton(page).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  await page.getByText('1位: Before Edit').click()
  await itemEditButton(page, 'Before Edit').click()
  await editCancelButton(page).click()

  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
