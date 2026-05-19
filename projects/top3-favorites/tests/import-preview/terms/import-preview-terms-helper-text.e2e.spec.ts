import { expect, test } from '@playwright/test'
import {
  importPreviewTermsHelper,
  importPreviewToggleTermsHelper,
  resetItemsByDelete,
  saveSampleItems,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview explains difference between 削除予定 and 正規化除外', async ({ page }) => {
  await page.goto('/')

  // seed current items so removed count can happen
  await saveSampleItems(page)

  const now = new Date().toISOString()
  const payload = [
    { id: 'x1', tag: 'カフェラテ', location: '柏の葉', name: 'X1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x2', tag: 'カフェラテ', location: '柏の葉', name: 'X2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x3', tag: 'カフェラテ', location: '柏の葉', name: 'X3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x4', tag: 'カフェラテ', location: '柏の葉', name: 'X4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'terms-helper.json', payload)

  await importPreviewToggleTermsHelper(page).click()
  const helper = importPreviewTermsHelper(page)
  const terms = helper.locator('div')
  await expect(terms).toHaveCount(2)
  await expect(helper.locator('dt')).toHaveText(['削除予定', '正規化除外'])
  await expect(helper.locator('dd')).toHaveText([
    '現在DBにあるが、インポート後データに含まれない項目',
    'インポートJSON内で同一タグTop3に収まらず取り込まれない項目',
  ])
})
