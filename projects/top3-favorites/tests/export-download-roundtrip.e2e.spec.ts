import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, parseDownloadedJsonFile, resetItemsByReplace, downloadJsonExport, saveSampleItems } from './e2e-helpers'

const requiredStringFields = ['id', 'tag', 'location', 'name', 'memo', 'mapsUrl', 'placeId', 'createdAt', 'updatedAt'] as const

type ExportedItem = Record<(typeof requiredStringFields)[number], string> & { rank: number }

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('exported JSON file has valid item shape and can be imported back through the UI', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

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
  await page.reload()
  await expect(page.getByText('該当するTop3がありません。')).toBeVisible()

  await uploadJsonImportFile(page, filename, raw)

  await expect(page.getByText('現在0件 → インポート後3件')).toBeVisible()
  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByText('インポート成功: 3件を反映しました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('2位: T-SITEのカフェ')).toBeVisible()
  await expect(page.getByText('1位: とみ田')).toBeVisible()

  const afterImport = (await request.get('/api/items').then((res) => res.json())) as { items: ExportedItem[] }
  expect(afterImport.items.map((item) => item.name).sort()).toEqual(exportedItems.map((item) => item.name).sort())
})
