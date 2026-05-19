import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace , importPreviewImpactTags, importPreviewToggleImpactTags} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('impact tags can be expanded to show all tags and collapsed back', async ({ page }) => {
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

  await uploadJsonImportFile(page, 'impact-expand-tags.json', payload)

  const tags = importPreviewImpactTags(page)
  await expect(tags).toContainText('ほか1件')
  await expect(tags).not.toContainText('Fタグ')

  const toggle = page.getByRole('button', { name: '影響タグを全件表示' })
  await expect(toggle).toBeVisible()
  await toggle.click()

  await expect(tags).toContainText('Fタグ')
  await expect(tags).not.toContainText('ほか1件')
  await expect(importPreviewToggleImpactTags(page)).toBeVisible()

  await importPreviewToggleImpactTags(page).click()
  await expect(tags).toContainText('ほか1件')
  await expect(tags).not.toContainText('Fタグ')
})
