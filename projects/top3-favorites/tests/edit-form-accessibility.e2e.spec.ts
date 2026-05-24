import { expect, test } from '@playwright/test'
import {
  editCancelButton,
  editLocationField,
  editMemoField,
  editNameField,
  editSaveButton,
  editTagField,
  expectOperationAlertText,
  fetchItems,
  itemEditButton,
  operationAlert,
  rankedItemSummary,
  rankedItemSummaryByName,
  resetItemsByReplace,
  saveEditAndWaitForStatus,
  saveSampleItems,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('edit form fields have accessible names and save edited Top3 data', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await rankedItemSummary(page, 1, 'Solito MAGO').click()
  await itemEditButton(page, /編集$/).click()

  const nameField = editNameField(page)
  await expect(nameField).toBeVisible()
  await expect(editTagField(page)).toBeVisible()
  await expect(editLocationField(page)).toBeVisible()
  await expect(editMemoField(page)).toBeVisible()

  await nameField.fill('Solito MAGO Edited')
  await saveEditAndWaitForStatus(page, '編集を保存しました。')

  await expect(rankedItemSummaryByName(page, 'Solito MAGO Edited')).toBeVisible()

  const apiData = await fetchItems<{ items: Array<{ name: string }> }>(page.request)
  expect(apiData.items.some((item) => item.name === 'Solito MAGO Edited')).toBe(true)
})

test('edit form validates required fields before saving', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await rankedItemSummary(page, 1, 'Solito MAGO').click()
  await itemEditButton(page, /編集$/).click()

  await editNameField(page).fill('   ')
  await editSaveButton(page).click()

  await expectOperationAlertText(page, 'タグと店舗名は必須です。')
  await expect(operationAlert(page)).toBeFocused()
  await expect(editNameField(page)).toBeVisible()

  await editCancelButton(page).click()
  await expect(rankedItemSummaryByName(page, 'Solito MAGO')).toBeVisible()
  await expect(operationAlert(page)).not.toBeVisible()
})
