import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  importPreviewPanel,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
  uploadJsonImportFile,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('selecting search tag closes pending import preview to avoid mixed contexts', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Search Target')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(importPreviewPanel(page)).toHaveCount(0)
})
