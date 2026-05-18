import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation error identifies the first invalid row and field for quick recovery', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'valid-1', tag: 'カフェラテ', location: '柏の葉', name: 'Valid Shop', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-2', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'invalid-import-field-details.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalidItems), 'utf-8'),
  })

  await expect(page.getByRole('alert')).toContainText('インポート失敗: 2件目のタグが空です。既存データは保持しました。')
  await expect(page.getByTestId('import-preview-summary')).toHaveCount(0)
})
