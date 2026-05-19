import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems } from '../../e2e-helpers'

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

  await expect(page.getByRole('button', { name: '差分用語の詳細説明を表示' })).toBeVisible()
  await expect(page.getByTestId('import-preview-terms-helper')).toHaveCount(0)

  await page.getByRole('button', { name: '差分用語の詳細説明を表示' }).click()
  const helper = page.getByTestId('import-preview-terms-helper')
  await expect(helper).toContainText('削除予定: 現在DBにあるが、インポート後データに含まれない項目')
  await expect(helper).toContainText('正規化除外: インポートJSON内で同一タグTop3に収まらず取り込まれない項目')

  await page.getByRole('button', { name: '差分用語の詳細説明を隠す' }).click()
  await expect(page.getByTestId('import-preview-terms-helper')).toHaveCount(0)
})
