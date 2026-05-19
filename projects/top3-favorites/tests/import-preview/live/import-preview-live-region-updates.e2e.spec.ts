import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete , expectImportPreviewCounts} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview exposes aria-live region and updates when file is replaced', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payloadA = [
    { id: 'a1', tag: 'A', location: '柏', name: 'A1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const payloadB = [
    { id: 'b1', tag: 'B', location: '柏', name: 'B1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b2', tag: 'B', location: '柏', name: 'B2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'live-a.json', payloadA)

  const live = page.getByTestId('import-preview-live')
  await expect(live).toHaveAttribute('aria-live', 'polite')
  await expect(live).toHaveAttribute('aria-atomic', 'true')
  await expect(live).toHaveText('追加1件 / 削除予定0件 / インポート後1件。')
  await expectImportPreviewCounts(page, 0, 1)

  await uploadJsonImportFile(page, 'live-b.json', payloadB)

  await expect(live).toHaveText('追加2件 / 削除予定0件 / インポート後2件。')
  await expectImportPreviewCounts(page, 0, 2)
})
