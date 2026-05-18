import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('live summary representative excluded name is consistent with excluded-details list order', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    // First theme inserted => its excluded name should become the representative in details order
    { id: 'z1', tag: 'Zタグ', location: '柏', name: 'Z1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'z2', tag: 'Zタグ', location: '柏', name: 'Z2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'z3', tag: 'Zタグ', location: '柏', name: 'Z3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'z4', tag: 'Zタグ', location: '柏', name: 'Z4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },

    // Second theme inserted with lexicographically earlier excluded name
    { id: 'a1', tag: 'Aタグ', location: '柏', name: 'A1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a2', tag: 'Aタグ', location: '柏', name: 'A2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a3', tag: 'Aタグ', location: '柏', name: 'A3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a4', tag: 'Aタグ', location: '柏', name: 'A4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'live-excluded-lead-consistency.json', payload)

  const details = page.getByTestId('import-preview-excluded-details')
  await expect(details).toContainText('・Z3店')
  await expect(details).toContainText('・A3店')

  const live = page.getByTestId('import-preview-live')
  await expect(live).toContainText('正規化除外2件')
  await expect(live).toContainText('例: Z3店')
})
