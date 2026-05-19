import { expect, test } from '@playwright/test'
import { itemEditButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('starting edit clears stale success notice to match current context', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Edit Start Notice')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  await page.getByText('1位: Edit Start Notice').click()
  await itemEditButton(page, 'Edit Start Notice').click()
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
})
