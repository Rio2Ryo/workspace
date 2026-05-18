import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace , jsonImportButton} from './e2e-helpers'

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

  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-preview-replace-hint')).toContainText('別ファイルを選ぶと現在のプレビューを置き換えます')
  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-a.json')

  await jsonImportButton(page).click()
  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-a.json')

  await uploadJsonImportFile(page, 'preview-b.json', secondPayload)

  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-b.json')
  await expect(page.getByTestId('import-preview-summary')).not.toContainText('preview-a.json')
})
