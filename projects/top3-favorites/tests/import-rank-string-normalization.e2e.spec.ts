import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, importConfirmButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview handles string ranks and still normalizes same tag to Top3', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 's1', tag: 'カフェラテ', location: '柏の葉', name: 'S1', rank: '1', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's2', tag: 'カフェラテ', location: '柏の葉', name: 'S2', rank: '2', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's3', tag: 'カフェラテ', location: '柏の葉', name: 'S3', rank: '3', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's4', tag: 'カフェラテ', location: '柏の葉', name: 'S4', rank: '1', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'rank-string.json', payload)

  await expect(page.getByText('現在0件 → インポート後3件')).toBeVisible()
  await expect(page.getByText('同一タグはTop3に正規化: 4件中3件を反映予定')).toBeVisible()
  await expect(page.getByTestId('import-preview-impact-math')).toContainText('正規化除外1件')
  await expect(page.getByText(/^正規化除外予定の店舗:/)).toBeVisible()

  await importConfirmButton(page).click()
  await expectOperationStatus(page, 'インポート成功: 3件を反映しました。')

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェラテ' }) })
  await expect(group.getByText(/位:/)).toHaveCount(3)
})
