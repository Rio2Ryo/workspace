import { expect, test } from '@playwright/test'
import { itemEditButton, editCancelButton, editSaveButton, resetItemsByReplace, saveSampleItems, expectOperationAlert, expectOperationStatus, operationAlert, editNameField, editTagField, editLocationField, editMemoField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('edit form fields have accessible names and save edited Top3 data', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await page.getByText(/\d位: Solito MAGO/).first().click()
  await itemEditButton(page, /編集$/).click()

  const nameField = editNameField(page)
  await expect(nameField).toBeVisible()
  await expect(editTagField(page)).toBeVisible()
  await expect(editLocationField(page)).toBeVisible()
  await expect(editMemoField(page)).toBeVisible()

  await nameField.fill('Solito MAGO Edited')
  await editSaveButton(page).click()
  await expectOperationStatus(page, '編集を保存しました。')

  await expect(page.getByText(/\d位: Solito MAGO Edited/)).toBeVisible()

  const apiData = (await page.request.get('/api/items').then((res) => res.json())) as { items: Array<{ name: string }> }
  expect(apiData.items.some((item) => item.name === 'Solito MAGO Edited')).toBe(true)
})

test('edit form validates required fields before saving', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await page.getByText(/\d位: Solito MAGO/).first().click()
  await itemEditButton(page, /編集$/).click()

  await editNameField(page).fill('   ')
  await editSaveButton(page).click()

  await expectOperationAlert(page, 'タグと店舗名は必須です。')
  await expect(editNameField(page)).toBeVisible()

  await editCancelButton(page).click()
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(operationAlert(page)).not.toBeVisible()
})
