import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded store names preview collapses long lists and can be expanded', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e', tag: 'カフェラテ', location: '柏の葉', name: 'E店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f', tag: 'カフェラテ', location: '柏の葉', name: 'F店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'g', tag: 'カフェラテ', location: '柏の葉', name: 'G店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'excluded-names-collapsed.json', payload)

  const names = page.getByTestId('import-preview-excluded-names')
  await expect(names).toHaveAttribute('aria-label', 'Top3外で除外予定の店舗名プレビュー')
  await expect(names).toHaveAttribute('data-excluded-name-count', '4')
  await expect(names).toContainText('除外予定の店舗: B店, C店, F店（ほか1件）')
  await expect(names).not.toContainText('G店')

  const toggle = page.getByTestId('import-preview-toggle-excluded-names')
  await expect(toggle).toHaveAttribute('aria-controls', 'import-preview-excluded-names')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAccessibleName('インポート詳細: 除外店舗名を全件表示')

  await toggle.click()
  await expect(names).toContainText('G店')
  await expect(names).not.toContainText('ほか1件')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveAccessibleName('インポート詳細: 除外店舗名を折りたたむ')

  await toggle.click()
  await expect(names).not.toContainText('G店')
  await expect(names).toContainText('ほか1件')
})
