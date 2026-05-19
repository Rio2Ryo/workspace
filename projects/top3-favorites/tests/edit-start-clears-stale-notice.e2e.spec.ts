import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  itemEditButton,
  operationStatus,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
} from './e2e-helpers'

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

  await rankedItemSummary(page, 1, 'Edit Start Notice').click()
  await itemEditButton(page, 'Edit Start Notice').click()
  await expect(operationStatus(page)).toHaveCount(0)
})
