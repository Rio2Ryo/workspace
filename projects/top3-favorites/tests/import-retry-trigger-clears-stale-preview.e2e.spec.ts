import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace , jsonImportButton, importPreviewSummary, importPreviewPanel} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview stays visible while choosing another JSON and then replaces after file selection', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const firstPayload = [
    { id: 'p1', tag: 'プリン', location: '浅草', name: 'Preview A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const secondPayload = [
    { id: 'p2', tag: 'プリン', location: '浅草', name: 'Preview B', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'preview-a.json', firstPayload)

  await expect(importPreviewPanel(page)).toBeVisible()
  await expect(page.getByTestId('import-preview-replace-hint')).toContainText('別ファイルを選ぶと現在のプレビューを置き換えます')
  await expect(importPreviewSummary(page)).toContainText('preview-a.json')

  await jsonImportButton(page).click()
  await expect(importPreviewPanel(page)).toBeVisible()
  await expect(importPreviewSummary(page)).toContainText('preview-a.json')

  await uploadJsonImportFile(page, 'preview-b.json', secondPayload)

  await expect(importPreviewSummary(page)).toContainText('preview-b.json')
  await expect(importPreviewSummary(page)).not.toContainText('preview-a.json')
})
