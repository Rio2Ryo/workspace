import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus, expectOperationAlert, registrationLocationField, registrationNameField, registrationTagField, operationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('failed save clears stale success notice and keeps draft for retry', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('First Save')
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

  await registrationNameField(page).fill('Retry Candidate')
  await registrationSaveButton(page).click()

  await expectOperationAlert(page, '保存APIが一時的に利用できません。')
  await expect(operationStatus(page)).toHaveCount(0)
  await expect(registrationNameField(page)).toHaveValue('Retry Candidate')
})
