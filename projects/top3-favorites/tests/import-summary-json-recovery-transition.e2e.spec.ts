import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('summary json transitions correctly across valid -> invalid -> valid import flow', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Baseline')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  const now = new Date().toISOString()
  const validItems = [
    { id: 'r1', tag: 'プリン', location: '浅草', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'r2', tag: 'プリン', location: '浅草', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  // valid: preview summary exists and has coherent values
  await fileInput.setInputFiles({
    name: 'valid-1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(validItems), 'utf-8'),
  })

  const summaryNode = page.getByTestId('import-preview-summary')
  await expect(summaryNode).toBeVisible()
  const summary1 = JSON.parse((await summaryNode.getAttribute('data-summary-json')) || '{}') as {
    version: number
    before: number
    after: number
    normalizationBefore: number
    normalizationAfter: number
    added: number
    kept: number
    removed: number
    excluded: number
    tags: string[]
  }
  expect(summary1.version).toBe(1)
  expect(summary1.before).toBe(1)
  expect(summary1.after).toBe(2)
  expect(summary1.added + summary1.kept).toBe(summary1.after)

  // invalid in between: preview should be cleared
  await fileInput.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"broken": ', 'utf-8'),
  })
  await expect(page.getByRole('alert')).toContainText('インポート失敗: JSONの読み取りに失敗しました。既存データは保持しました。')
  await expect(page.getByTestId('import-preview-summary')).toHaveCount(0)

  // valid again: summary should be rebuilt coherently
  await fileInput.setInputFiles({
    name: 'valid-2.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(validItems), 'utf-8'),
  })

  const summaryNode2 = page.getByTestId('import-preview-summary')
  await expect(summaryNode2).toBeVisible()
  const summary2 = JSON.parse((await summaryNode2.getAttribute('data-summary-json')) || '{}') as {
    version: number
    before: number
    after: number
    normalizationBefore: number
    normalizationAfter: number
    added: number
    kept: number
    removed: number
    excluded: number
    tags: string[]
  }

  expect(summary2.version).toBe(1)
  expect(summary2.before).toBe(1)
  expect(summary2.after).toBe(2)
  expect(summary2.added + summary2.kept).toBe(summary2.after)
  expect(summary2.before - summary2.removed).toBe(summary2.kept)
  expect(Array.isArray(summary2.tags)).toBe(true)
})
