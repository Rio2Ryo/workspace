import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus, expectOperationAlert } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('failed save clears stale success notice and keeps draft for retry', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('First Save')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '保存APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByLabel('店舗名', { exact: true }).fill('Retry Candidate')
  await registrationSaveButton(page).click()

  await expectOperationAlert(page, '保存APIが一時的に利用できません。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
  await expect(page.getByLabel('店舗名', { exact: true })).toHaveValue('Retry Candidate')
})
