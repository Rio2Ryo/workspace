import { expect, test } from '@playwright/test'
import {uploadJsonImportFile, parseDownloadedJsonFile, resetItemsByReplace, downloadJsonExport, saveSampleItems, reloadPageAndWaitForSearchReady, fetchItems, confirmImportAndWaitForStatus, expectImportPreviewCounts} from './e2e-helpers'

const requiredStringFields = ['id', 'tag', 'location', 'name', 'memo', 'mapsUrl', 'placeId', 'createdAt', 'updatedAt'] as const

type ExportedItem = Record<(typeof requiredStringFields)[number], string> & { rank: number }

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('exported JSON file has valid item shape and can be imported back through the UI', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const download = await downloadJsonExport(page)
  const { filename, raw, parsed } = await parseDownloadedJsonFile<unknown>(download)
  expect(Array.isArray(parsed)).toBe(true)

  const exportedItems = parsed as ExportedItem[]
  expect(exportedItems).toHaveLength(3)
  for (const item of exportedItems) {
    for (const field of requiredStringFields) {
      expect(typeof item[field], `${field} should be string`).toBe('string')
    }
    expect([1, 2, 3]).toContain(item.rank)
    expect(item.id.trim()).not.toBe('')
    expect(item.tag.trim()).not.toBe('')
    expect(item.name.trim()).not.toBe('')
    expect(item.mapsUrl).toContain('https://www.google.com/maps/search/?api=1&query=')
  }

  await resetItemsByReplace(request)
  await reloadPageAndWaitForSearchReady(page)
  await expect(page.getByText('該当するTop3がありません。')).toBeVisible()

  await uploadJsonImportFile(page, filename, raw)

  await expectImportPreviewCounts(page, 0, 3)
  await confirmImportAndWaitForStatus(page, 'インポート成功: 3件を反映しました。')
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('2位: T-SITEのカフェ')).toBeVisible()
  await expect(page.getByText('1位: とみ田')).toBeVisible()

  const afterImport = await fetchItems<{ items: ExportedItem[] }>(request)
  expect(afterImport.items.map((item) => item.name).sort()).toEqual(exportedItems.map((item) => item.name).sort())
})
