import { expect, test } from '@playwright/test'
import {
  editCancelButton,
  itemEditButton,
  resetItemsByReplace,
  registrationSaveButton,
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  operationStatus,
  rankedItemSummary,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('canceling edit clears stale success notice to avoid misleading feedback', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Before Edit')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  await rankedItemSummary(page, 1, 'Before Edit').click()
  await itemEditButton(page, 'Before Edit').click()
  await editCancelButton(page).click()

  await expect(operationStatus(page)).toHaveCount(0)
})
