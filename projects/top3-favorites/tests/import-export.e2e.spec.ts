import { expect, test } from '@playwright/test'
import {sampleSaveButton, jsonExportButton, tagFilterButton, searchClearButton, uploadJsonImportFile, parseDownloadedJsonFile, resetItemsByReplace, downloadJsonExport, saveSampleItems, jsonImportButton, searchSection as searchSectionLocator, reloadPageAndWaitForSearchReady, confirmImportAndWaitForStatus, expectImportPreviewCounts} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('json import/export UI exists and invalid import keeps existing data', async ({ page }) => {
  await page.goto('/')
  await expect(sampleSaveButton(page)).toBeVisible()
  await saveSampleItems(page)

  // Export / Import buttons should exist
  await expect(jsonExportButton(page)).toBeVisible()
  await expect(jsonImportButton(page)).toBeVisible()

  // Invalid import must not destroy existing data (fail-closed)
  await uploadJsonImportFile(page, 'invalid.json', '{"foo":1}')

  await expect(page.getByText(/インポート失敗/)).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})

test('exported JSON can be downloaded and imported back through the confirmation preview', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const download = await downloadJsonExport(page)
  const { filename, raw: exportedText, parsed: exportedItems } = await parseDownloadedJsonFile<Array<{ name: string }>>(download)
  expect(Array.isArray(exportedItems)).toBe(true)
  expect(exportedItems).toHaveLength(3)
  expect(exportedItems.map((item) => item.name)).toContain('Solito MAGO')

  await resetItemsByReplace(request, [])
  await reloadPageAndWaitForSearchReady(page)
  await expect(jsonExportButton(page)).toBeDisabled()
  await expect(page.getByText('該当するTop3がありません。')).toBeVisible()

  await uploadJsonImportFile(page, filename, exportedText)

  await expectImportPreviewCounts(page, 0, 3)
  await confirmImportAndWaitForStatus(page, 'インポート成功: 3件を反映しました。')
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})

test('valid import clears stale tag filters so imported data is immediately visible', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(searchSection.getByText('1位: Solito MAGO')).toBeVisible()

  const importedItems = [
    {
      id: 'imported-1',
      tag: 'スイーツ',
      location: '浅草',
      name: 'Imported Pudding',
      rank: 1,
      memo: 'フィルタ解除の回帰テスト',
      mapsUrl: 'https://example.test/maps',
      placeId: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  await uploadJsonImportFile(page, 'valid-import.json', importedItems)

  await expectImportPreviewCounts(page, 3, 1)
  await confirmImportAndWaitForStatus(page, 'インポート成功: 1件を反映しました。')
  await expect(searchSection.getByRole('heading', { name: 'スイーツ' })).toBeVisible()
  await expect(searchSection.getByText('1位: Imported Pudding')).toBeVisible()
  await expect(searchClearButton(searchSection)).not.toBeVisible()
})
