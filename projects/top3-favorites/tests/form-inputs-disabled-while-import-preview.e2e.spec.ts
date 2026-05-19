import { expect, test } from '@playwright/test'
import {
  importLockHint,
  importPreviewPanel,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('registration form inputs are locked while import preview is active', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)

  await expect(importPreviewPanel(page)).toBeVisible()
  await expect(importLockHint(page)).toBeVisible()

  await expect(registrationTagField(page)).toBeDisabled()
  await expect(registrationLocationField(page)).toBeDisabled()
  await expect(registrationNameField(page)).toBeDisabled()
  await expect(registrationRankButton(page, 1)).toBeDisabled()
  await expect(registrationRankButton(page, 2)).toBeDisabled()
  await expect(registrationRankButton(page, 3)).toBeDisabled()
  await expect(registrationMemoField(page)).toBeDisabled()
})
