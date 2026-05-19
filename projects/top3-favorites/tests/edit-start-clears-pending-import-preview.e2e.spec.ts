import { expect, test } from '@playwright/test'
import {
  cancelImportAndWaitForStatus,
  editSaveButton,
  expectOperationStatus,
  importPreviewPanel,
  itemEditButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview blocks edit until user cancels the import context', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Edit Target')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  await rankedItemSummary(page, 1, 'Edit Target').click()
  await expect(itemEditButton(page, 'Edit Target')).toBeDisabled()

  await cancelImportAndWaitForStatus(page, 'インポートをキャンセルしました。')
  await itemEditButton(page, 'Edit Target').click()
  await expect(editSaveButton(page)).toBeVisible()
  await expect(importPreviewPanel(page)).toHaveCount(0)
})
