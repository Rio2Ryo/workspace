import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems , importPreviewTermsHelper, importPreviewToggleTermsHelper} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('impact terms helper is collapsed by default and can be expanded/collapsed', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const now = new Date().toISOString()
  const payload = [
    { id: 'x1', tag: 'カフェラテ', location: '柏の葉', name: 'X1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x2', tag: 'カフェラテ', location: '柏の葉', name: 'X2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x3', tag: 'カフェラテ', location: '柏の葉', name: 'X3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x4', tag: 'カフェラテ', location: '柏の葉', name: 'X4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'terms-toggle.json', payload)

  await expect(importPreviewToggleTermsHelper(page)).toBeVisible()
  await expect(importPreviewTermsHelper(page)).toHaveCount(0)

  await importPreviewToggleTermsHelper(page).click()
  const helper = importPreviewTermsHelper(page)
  await expect(helper).toContainText('削除予定: 現在DBにあるが、インポート後データに含まれない項目')
  await expect(helper).toContainText('正規化除外: インポートJSON内で同一タグTop3に収まらず取り込まれない項目')

  await importPreviewToggleTermsHelper(page).click()
  await expect(importPreviewTermsHelper(page)).toHaveCount(0)
})
