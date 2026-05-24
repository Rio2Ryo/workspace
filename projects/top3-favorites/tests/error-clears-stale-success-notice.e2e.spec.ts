import { expect, test } from '@playwright/test'
import {
  expectOperationAlert,
  expectOperationStatus,
  operationAlert,
  operationStatus,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('validation error clears stale success notice to avoid mixed feedback', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Notice Mix')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  // trigger validation error on next save attempt
  await registrationNameField(page).fill('')
  await registrationSaveButton(page).click()

  await expectOperationAlert(page, 'タグと店舗名は必須です。')
  await expect(operationAlert(page)).toBeFocused()
  await expect(operationStatus(page)).toHaveCount(0)
})
