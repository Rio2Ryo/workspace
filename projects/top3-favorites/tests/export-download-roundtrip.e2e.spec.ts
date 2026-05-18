import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const requiredStringFields = ['id', 'tag', 'location', 'name', 'memo', 'mapsUrl', 'placeId', 'createdAt', 'updatedAt'] as const

type ExportedItem = Record<(typeof requiredStringFields)[number], string> & { rank: number }

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('exported JSON file has valid item shape and can be imported back through the UI', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSONエクスポート' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^top3-favorites-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/)

  const exportedPath = await download.path()
  expect(exportedPath).not.toBeNull()

  const raw = await readFile(exportedPath as string, 'utf-8')
  const parsed = JSON.parse(raw) as unknown
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

  for (const item of exportedItems) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
  await page.reload()
  await expect(page.getByText('該当するTop3がありません。')).toBeVisible()

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(raw, 'utf-8'),
  })

  await expect(page.getByText('現在0件 → インポート後3件')).toBeVisible()
  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByText('インポート成功: 3件を反映しました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('2位: T-SITEのカフェ')).toBeVisible()
  await expect(page.getByText('1位: とみ田')).toBeVisible()

  const afterImport = (await request.get('/api/items').then((res) => res.json())) as { items: ExportedItem[] }
  expect(afterImport.items.map((item) => item.name).sort()).toEqual(exportedItems.map((item) => item.name).sort())
})
