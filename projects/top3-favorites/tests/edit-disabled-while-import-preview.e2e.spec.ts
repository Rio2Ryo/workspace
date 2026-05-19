import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  importPreviewPanel,
  itemEditButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('edit action is disabled while import preview is active (preventive context guard)', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Guard Target')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  await rankedItemSummary(page, 1, 'Guard Target').click()
  await expect(itemEditButton(page, /編集/).first()).toBeDisabled()
})
