import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('validation error clears stale success notice to avoid mixed feedback', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Notice Mix')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  // trigger validation error on next save attempt
  await page.getByLabel('店舗名', { exact: true }).fill('')
  await registrationSaveButton(page).click()

  await expect(page.getByRole('alert')).toContainText('タグと店舗名は必須です。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
