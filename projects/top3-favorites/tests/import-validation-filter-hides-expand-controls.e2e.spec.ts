import { expect, test } from '@playwright/test'
import {
  importValidationCollapseRepairs,
  importValidationFieldFilter,
  importValidationShowAllRepairs,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation expand/collapse controls are hidden while a field filter is active', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = Array.from({ length: 8 }, (_, index) => ({
    id: `invalid-name-${index + 1}`,
    tag: index < 6 ? 'カフェラテ' : '',
    location: '柏の葉',
    name: index < 6 ? '' : `Tag Invalid ${index + 1}`,
    rank: 1,
    memo: '',
    mapsUrl: '',
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }))

  await uploadJsonImportFile(page, 'invalid-filter-hides-expand.json', invalidItems)

  // unfiltered long list should expose expand control
  await expect(importValidationShowAllRepairs(page)).toBeVisible()
  await expect(importValidationCollapseRepairs(page)).toHaveCount(0)

  // filtered view should hide expand/collapse controls entirely
  await importValidationFieldFilter(page, 'name').click()
  await expect(importValidationShowAllRepairs(page)).toHaveCount(0)
  await expect(importValidationCollapseRepairs(page)).toHaveCount(0)

  // same behavior for another field filter
  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationShowAllRepairs(page)).toHaveCount(0)
  await expect(importValidationCollapseRepairs(page)).toHaveCount(0)
})
