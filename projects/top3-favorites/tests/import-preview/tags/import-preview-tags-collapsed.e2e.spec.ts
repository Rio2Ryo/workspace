import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('impact tags are collapsed when many tags are affected', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: '1', tag: 'Aタグ', location: '柏', name: 'A1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: '2', tag: 'Bタグ', location: '柏', name: 'B1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: '3', tag: 'Cタグ', location: '柏', name: 'C1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: '4', tag: 'Dタグ', location: '柏', name: 'D1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: '5', tag: 'Eタグ', location: '柏', name: 'E1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: '6', tag: 'Fタグ', location: '柏', name: 'F1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'impact-many-tags.json', payload)

  const tags = page.getByTestId('import-preview-impact-tags')
  await expect(tags).toContainText('影響タグ: Aタグ, Bタグ, Cタグ, Dタグ, Eタグ')
  await expect(tags).toContainText('ほか1件')
})
