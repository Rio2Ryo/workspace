import { expect, test } from '@playwright/test'
import {
  importPreviewPanel,
  registrationSaveButton,
  resetItemsByReplace,
  sampleSaveButton,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('save actions are disabled while import preview is active', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  await expect(registrationSaveButton(page)).toBeDisabled()
  await expect(sampleSaveButton(page)).toBeDisabled()
})
