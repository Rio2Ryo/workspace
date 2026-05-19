import { expect, test } from '@playwright/test'
import {
  editSaveButton,
  itemEditButton,
  jsonImportButton,
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

test('starting JSON import closes edit context to avoid mixed workflows', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Edit Target')
  await registrationSaveButton(page).click()

  await rankedItemSummary(page, 1, 'Edit Target').click()
  await itemEditButton(page, 'Edit Target').click()
  await expect(editSaveButton(page)).toBeVisible()

  await jsonImportButton(page).click()
  await expect(editSaveButton(page)).toHaveCount(0)
})
