import { expect, test } from '@playwright/test'
import {
  fetchItems,
  importPreviewMetricAdded,
  importPreviewMetricKept,
  importPreviewMetricRemoved,
  resetItemsByReplace,
  saveSampleItems,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('zero-value impact metric is marked as muted for quick visual scan', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  // Re-import the exact same payload: added=0, kept=3, removed=0
  const current = await fetchItems<{ items: unknown[] }>(request)
  await uploadJsonImportFile(page, 'same-data.json', current.items)

  await expect(importPreviewMetricAdded(page)).toHaveClass(/is-zero/)
  await expect(importPreviewMetricKept(page)).not.toHaveClass(/is-zero/)
  await expect(importPreviewMetricRemoved(page)).toHaveClass(/is-zero/)
})
