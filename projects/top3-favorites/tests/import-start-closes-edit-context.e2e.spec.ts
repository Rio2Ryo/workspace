import { expect, test } from '@playwright/test'
import { itemEditButton, editSaveButton, resetItemsByReplace, jsonImportButton, registrationSaveButton, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('starting JSON import closes edit context to avoid mixed workflows', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Edit Target')
  await registrationSaveButton(page).click()

  await page.getByText('1位: Edit Target').click()
  await itemEditButton(page, 'Edit Target').click()
  await expect(editSaveButton(page)).toBeVisible()

  await jsonImportButton(page).click()
  await expect(editSaveButton(page)).toHaveCount(0)
})
