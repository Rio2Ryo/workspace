import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
  editSaveButton,
  expectOperationStatus,
  importPreviewPanel,
  itemEditButton,
  jsonImportButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('context transition matrix keeps only one active workflow context', async ({ page }) => {
  await page.goto('/')

  // seed search/edit target
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Context Base')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const searchSection = searchSectionLocator(page)

  // baseline: import preview visible
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  // search select should close import preview
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(importPreviewPanel(page)).toHaveCount(0)

  // make import preview visible again
  await uploadJsonImportFile(page, 'pending-again.json', payload)
  await expect(importPreviewPanel(page)).toBeVisible()

  // search clear should also close import preview
  await clearSearchTagFilter(searchSection)
  await expect(importPreviewPanel(page)).toHaveCount(0)

  // open edit context
  await rankedItemSummary(page, 1, 'Context Base').click()
  await itemEditButton(page, /編集/).first().click()
  await expect(editSaveButton(page)).toBeVisible()

  // starting import should close edit context
  await jsonImportButton(page).click()
  await expect(editSaveButton(page)).toHaveCount(0)
})
