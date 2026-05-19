import { expect, test } from '@playwright/test'
import {
  uploadJsonImportFile,
  resetItemsByReplace,
  confirmImportAndWaitForStatus,
  expectImportPreviewCounts,
  expectImportPreviewImpactMath,
  tagGroup,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('UI shows only Top3 after importing 4 items of same tag', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const items = [
    { id: 'u1', tag: 'カフェラテ', location: '柏の葉', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u2', tag: 'カフェラテ', location: '柏の葉', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u3', tag: 'カフェラテ', location: '柏の葉', name: 'C', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u4', tag: 'カフェラテ', location: '柏の葉', name: 'D', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2000-01-01T00:00:00.000Z' },
  ]
  await uploadJsonImportFile(page, 'same-tag-4items.json', items)

  await expectImportPreviewCounts(page, 0, 3)
  await expect(page.getByText('同一タグはTop3に正規化: 4件中3件を反映予定')).toBeVisible()
  await expectImportPreviewImpactMath(page, { added: 3, kept: 0, removed: 0, excluded: 1 })
  await expect(page.getByText(/^正規化除外予定の店舗:/)).toBeVisible()
  await confirmImportAndWaitForStatus(page, 'インポート成功')

  const group = tagGroup(page, 'カフェラテ')
  await expect(group.getByText(/位:/)).toHaveCount(3)

  // UI list must be normalized to Top3 only
  await expect(group.getByText(/位: A/)).toBeVisible()
  await expect(group.getByText(/位: B/)).toBeVisible()
  await expect(group.getByText(/位: C/)).toBeVisible()
  await expect(group.getByText(/位: D/)).toHaveCount(0)

  const listText = await group.textContent()
  expect(listText ?? '').not.toContain('4位')
})
